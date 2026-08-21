import { Router } from 'express';
import { supabaseAdmin, requireAuth, requireSchoolRole } from '../middleware/auth.js';

const router = Router();

const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free';
const OPENROUTER_VISION_MODEL = process.env.OPENROUTER_VISION_MODEL || 'google/gemma-4-31b-it:free';

const SYSTEM_PROMPT = `Tu es l'assistant de saisie de notes de "Carnet", un ENT scolaire béninois.
Un professeur va te décrire une ou plusieurs notes en langage naturel (français).
Ton rôle : extraire les informations nécessaires pour enregistrer CHAQUE note :
- l'élève (nom complet ou matricule)
- la classe (ex: "Second IMI-1")
- la matière (ex: "Mathématiques")
- le type d'évaluation : "interro" ou "devoir"
- la note obtenue
- le barème (note sur combien, 20 par défaut si non précisé)
- un intitulé court (ex: "Interro 1", "Devoir maison 2") — invente-en un raisonnable si absent

RÈGLES STRICTES :
1. S'il manque une information indispensable (élève, classe, matière, type, note), NE DEVINE PAS.
   Pose une question courte et précise en français pour obtenir CE QUI MANQUE, et rien d'autre.
   Ne mets aucune balise dans ce cas.
2. Dès que TOUTES les informations sont réunies pour au moins une note complète, réponds avec :
   - une courte phrase de confirmation en français
   - puis un bloc EXACTEMENT sous cette forme, à la fin de ta réponse :
   <GRADE_ENTRIES>[{"student_identifier":"...", "class_name":"...", "subject_name":"...", "type":"interro|devoir", "label":"...", "score":0, "max_score":20}]</GRADE_ENTRIES>
   Le tableau JSON peut contenir plusieurs objets si plusieurs notes complètes ont été données dans le même message.
3. Ne mets jamais de texte après le bloc <GRADE_ENTRIES>.
4. Reste bref. Pas de blabla inutile.`;

async function callOpenRouter(messages) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY manquant côté serveur');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages]
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// Résout un identifiant élève (matricule OU nom) vers un profile, dans une classe donnée
async function resolveStudent(schoolId, classId, identifier) {
  const { data: byNumber } = await supabaseAdmin
    .from('school_members')
    .select('user_id, student_number, profiles(id, full_name)')
    .eq('school_id', schoolId)
    .eq('role', 'eleve')
    .eq('student_number', identifier)
    .maybeSingle();
  if (byNumber) return byNumber.profiles;

  const { data: classStudents } = await supabaseAdmin
    .from('class_students')
    .select('profiles(id, full_name)')
    .eq('class_id', classId);

  const normalized = identifier.trim().toLowerCase();
  const match = (classStudents || []).find((cs) =>
    cs.profiles.full_name.toLowerCase().includes(normalized) ||
    normalized.includes(cs.profiles.full_name.toLowerCase())
  );
  return match?.profiles || null;
}

async function resolveClass(schoolId, className) {
  const { data } = await supabaseAdmin
    .from('classes')
    .select('id, name')
    .eq('school_id', schoolId)
    .ilike('name', `%${className}%`)
    .limit(1)
    .maybeSingle();
  return data;
}

async function resolveSubject(schoolId, subjectName) {
  const { data } = await supabaseAdmin
    .from('subjects')
    .select('id, name')
    .eq('school_id', schoolId)
    .ilike('name', `%${subjectName}%`)
    .limit(1)
    .maybeSingle();
  return data;
}

router.post('/grade-entry', requireAuth, requireSchoolRole(['prof', 'admin']), async (req, res) => {
  try {
    const { messages } = req.body; // [{role: 'user'|'assistant', content: '...'}, ...]
    if (!messages || messages.length === 0) return res.status(400).json({ error: 'messages requis' });

    const aiReply = await callOpenRouter(messages);

    const match = aiReply.match(/<GRADE_ENTRIES>([\s\S]*?)<\/GRADE_ENTRIES>/);
    if (!match) {
      return res.json({ reply: aiReply.trim(), saved: [] });
    }

    let entries;
    try {
      entries = JSON.parse(match[1]);
    } catch {
      return res.json({ reply: "Désolé, une erreur interne a eu lieu lors de l'extraction. Pouvez-vous reformuler ?", saved: [] });
    }

    const humanMessage = aiReply.replace(/<GRADE_ENTRIES>[\s\S]*?<\/GRADE_ENTRIES>/, '').trim();
    const saved = [];
    const failed = [];

    for (const entry of entries) {
      const classRow = await resolveClass(req.schoolId, entry.class_name);
      if (!classRow) { failed.push({ entry, reason: `Classe "${entry.class_name}" introuvable` }); continue; }

      const subjectRow = await resolveSubject(req.schoolId, entry.subject_name);
      if (!subjectRow) { failed.push({ entry, reason: `Matière "${entry.subject_name}" introuvable` }); continue; }

      const student = await resolveStudent(req.schoolId, classRow.id, entry.student_identifier);
      if (!student) { failed.push({ entry, reason: `Élève "${entry.student_identifier}" introuvable dans ${classRow.name}` }); continue; }

      if (req.roles.includes('prof') && !req.roles.includes('admin')) {
        const { data: assign } = await supabaseAdmin
          .from('class_subject_teachers')
          .select('id')
          .eq('class_id', classRow.id)
          .eq('subject_id', subjectRow.id)
          .eq('teacher_id', req.user.id)
          .maybeSingle();
        if (!assign) { failed.push({ entry, reason: `Vous n'enseignez pas ${subjectRow.name} dans ${classRow.name}` }); continue; }
      }

      const { data: inserted, error } = await supabaseAdmin
        .from('grades')
        .insert({
          school_id: req.schoolId,
          student_id: student.id,
          class_id: classRow.id,
          subject_id: subjectRow.id,
          teacher_id: req.user.id,
          label: entry.label || (entry.type === 'interro' ? 'Interrogation' : 'Devoir'),
          score: entry.score,
          max_score: entry.max_score || 20,
          coefficient: 1,
          graded_at: new Date().toISOString().split('T')[0],
          type: entry.type === 'interro' ? 'interro' : 'devoir'
        })
        .select()
        .single();

      if (error) failed.push({ entry, reason: error.message });
      else saved.push({ student: student.full_name, class: classRow.name, subject: subjectRow.name, ...inserted });
    }

    let reply = humanMessage;
    if (saved.length) reply += `\n\n✅ ${saved.length} note(s) enregistrée(s) pour : ${saved.map((s) => s.student).join(', ')}.`;
    if (failed.length) reply += `\n\n⚠️ ${failed.length} note(s) non enregistrée(s) : ${failed.map((f) => f.reason).join(' · ')}`;

    res.json({ reply: reply.trim(), saved, failed });
  } catch (err) {
    console.error('AI grade-entry error:', err);
    res.status(500).json({ error: err.message || 'Erreur assistant IA' });
  }
});

const ROSTER_SYSTEM_PROMPT = `Tu extrais une liste de noms d'élèves à partir d'une photo de fiche de classe
(manuscrite ou tapée). Renvoie UNIQUEMENT un tableau JSON de chaînes de caractères,
un nom complet par élève, dans l'ordre où ils apparaissent sur la fiche.
Corrige les fautes d'écriture évidentes mais n'invente jamais de nom.
Ignore les numéros de ligne, en-têtes, ou toute autre information qui n'est pas un nom d'élève.
Format de réponse EXACT, sans aucun texte autour : ["Nom Prénom", "Nom Prénom", ...]`;

const SUBJECTS_SYSTEM_PROMPT = `Tu extrais une liste de matières scolaires et leurs coefficients à partir d'une
photo de fiche (manuscrite ou tapée, souvent un tableau à deux colonnes : Matière | Coefficient).
Renvoie UNIQUEMENT un tableau JSON d'objets {"name": "...", "coefficient": nombre}.
Si un coefficient n'est pas lisible ou absent pour une matière, mets 1 par défaut.
N'invente jamais de matière qui n'apparaît pas sur la photo.
Format de réponse EXACT, sans aucun texte autour :
[{"name":"Mathématiques","coefficient":4},{"name":"Français","coefficient":3}]`;

async function callOpenRouterVision(imageBase64, systemPrompt, userText) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY manquant côté serveur');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: OPENROUTER_VISION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: imageBase64 } }
          ]
        }
      ]
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// Scanne une photo de fiche de classe et renvoie les noms détectés (à valider côté client avant import)
router.post('/roster-scan', requireAuth, requireSchoolRole(['admin', 'prof']), async (req, res) => {
  try {
    const { image_base64 } = req.body;
    if (!image_base64) return res.status(400).json({ error: 'image_base64 requis' });

    const raw = await callOpenRouterVision(image_base64, ROSTER_SYSTEM_PROMPT, 'Voici la photo de la fiche de classe. Extrais la liste des noms.');
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return res.status(422).json({ error: "L'IA n'a pas pu extraire de liste. Réessayez avec une photo plus nette." });

    let names;
    try {
      names = JSON.parse(match[0]).filter((n) => typeof n === 'string' && n.trim().length > 0);
    } catch {
      return res.status(422).json({ error: "Erreur de lecture de la réponse de l'IA. Réessayez." });
    }

    res.json({ names });
  } catch (err) {
    console.error('AI roster-scan error:', err);
    res.status(500).json({ error: err.message || 'Erreur assistant IA' });
  }
});

// Scanne une photo de fiche matières/coefficients et renvoie la liste détectée
router.post('/subjects-scan', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  try {
    const { image_base64 } = req.body;
    if (!image_base64) return res.status(400).json({ error: 'image_base64 requis' });

    const raw = await callOpenRouterVision(image_base64, SUBJECTS_SYSTEM_PROMPT, 'Voici la photo de la fiche matières/coefficients. Extrais la liste.');
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return res.status(422).json({ error: "L'IA n'a pas pu extraire de liste. Réessayez avec une photo plus nette." });

    let subjects;
    try {
      subjects = JSON.parse(match[0])
        .filter((s) => s && typeof s.name === 'string' && s.name.trim().length > 0)
        .map((s) => ({ name: s.name.trim(), coefficient: Number(s.coefficient) > 0 ? Number(s.coefficient) : 1 }));
    } catch {
      return res.status(422).json({ error: "Erreur de lecture de la réponse de l'IA. Réessayez." });
    }

    res.json({ subjects });
  } catch (err) {
    console.error('AI subjects-scan error:', err);
    res.status(500).json({ error: err.message || 'Erreur assistant IA' });
  }
});

export default router;
