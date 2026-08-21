import { Router } from 'express';
import { supabaseAdmin, requireAuth, requireSchoolRole } from '../middleware/auth.js';

const router = Router();

// ---- FILIÈRES ----

router.post('/tracks', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { name } = req.body;
  const { data, error } = await supabaseAdmin
    .from('tracks')
    .insert({ school_id: req.schoolId, name })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.get('/tracks/all', requireAuth, requireSchoolRole(), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('tracks')
    .select('*')
    .eq('school_id', req.schoolId)
    .order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ---- CLASSES ----

router.post('/', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { name, level, school_year, track_id } = req.body;
  const { data, error } = await supabaseAdmin
    .from('classes')
    .insert({ school_id: req.schoolId, name, level, school_year, track_id: track_id || null })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Liste des classes, groupées par filière (optionnel ?track_id=xxx pour filtrer)
router.get('/', requireAuth, requireSchoolRole(), async (req, res) => {
  let query = supabaseAdmin
    .from('classes')
    .select('*, tracks(id, name)')
    .eq('school_id', req.schoolId)
    .order('name');
  if (req.query.track_id) query = query.eq('track_id', req.query.track_id);

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Ajouter un élève à une classe
router.post('/:classId/students', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { student_id } = req.body;
  const { data, error } = await supabaseAdmin
    .from('class_students')
    .insert({ class_id: req.params.classId, student_id })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Liste des élèves d'une classe
router.get('/:classId/students', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('class_students')
    .select('id, profiles(id, full_name, avatar_url)')
    .eq('class_id', req.params.classId);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Assigner un prof à une matière pour une classe
router.post('/:classId/teachers', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { subject_id, teacher_id } = req.body;
  const { data, error } = await supabaseAdmin
    .from('class_subject_teachers')
    .insert({ class_id: req.params.classId, subject_id, teacher_id })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.get('/:classId/teachers', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('class_subject_teachers')
    .select('id, subjects(id, name, color), profiles(id, full_name)')
    .eq('class_id', req.params.classId);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Classes d'un élève ou d'un prof connecté (pratique pour le dashboard)
router.get('/my/:role', requireAuth, requireSchoolRole(), async (req, res) => {
  const { role } = req.params;

  if (role === 'eleve') {
    const { data, error } = await supabaseAdmin
      .from('class_students')
      .select('classes(*)')
      .eq('student_id', req.user.id);
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data.map((d) => d.classes));
  }

  if (role === 'prof') {
    const { data, error } = await supabaseAdmin
      .from('class_subject_teachers')
      .select('classes(*), subjects(id, name, color)')
      .eq('teacher_id', req.user.id);
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  }

  res.status(400).json({ error: 'role invalide (eleve|prof)' });
});

// ---- MATIÈRES ----

router.post('/subjects', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { name, color, coefficient } = req.body;
  const { data, error } = await supabaseAdmin
    .from('subjects')
    .insert({ school_id: req.schoolId, name, color, coefficient: coefficient > 0 ? coefficient : 1 })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Import groupé de matières + coefficients (après scan IA d'une fiche) — crée ou met à jour par nom
router.post('/subjects/scan-import', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { subjects } = req.body;
  if (!Array.isArray(subjects) || subjects.length === 0) {
    return res.status(400).json({ error: 'subjects requis (tableau non vide)' });
  }

  const results = [];
  for (const s of subjects) {
    const name = (s.name || '').trim();
    if (!name) continue;
    const coefficient = Number(s.coefficient) > 0 ? Number(s.coefficient) : 1;

    const { data: existing } = await supabaseAdmin
      .from('subjects')
      .select('id')
      .eq('school_id', req.schoolId)
      .ilike('name', name)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('subjects')
        .update({ coefficient })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) return res.status(400).json({ error: error.message });
      results.push(data);
    } else {
      const { data, error } = await supabaseAdmin
        .from('subjects')
        .insert({ school_id: req.schoolId, name, coefficient })
        .select()
        .single();
      if (error) return res.status(400).json({ error: error.message });
      results.push(data);
    }
  }

  res.status(201).json(results);
});

router.get('/subjects/all', requireAuth, requireSchoolRole(), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('subjects')
    .select('*')
    .eq('school_id', req.schoolId)
    .order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Régler le coefficient (poids dans le bulletin) + interro/devoir spécifiques à une matière
router.put('/subjects/:subjectId/weights', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { interro_weight, devoir_weight, coefficient } = req.body;
  const update = { interro_weight, devoir_weight };
  if (coefficient !== undefined) update.coefficient = Number(coefficient) > 0 ? Number(coefficient) : 1;
  const { data, error } = await supabaseAdmin
    .from('subjects')
    .update(update)
    .eq('id', req.params.subjectId)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ---- FICHE ÉLÈVES (roster) — import depuis une liste scannée par l'IA ----

// Importe une liste de noms validée (après scan IA) : génère un matricule pour chacun
router.post('/:classId/roster/import', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { names } = req.body;
  if (!Array.isArray(names) || names.length === 0) return res.status(400).json({ error: 'names requis (tableau non vide)' });

  const created = [];
  for (const full_name of names) {
    const cleaned = full_name.trim();
    if (!cleaned) continue;

    const { data: matricule, error: genErr } = await supabaseAdmin.rpc('generate_matricule', {
      p_school_id: req.schoolId
    });
    if (genErr) return res.status(400).json({ error: genErr.message });

    const { data, error } = await supabaseAdmin
      .from('roster_students')
      .insert({ school_id: req.schoolId, class_id: req.params.classId, full_name: cleaned, matricule })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    created.push(data);
  }

  res.status(201).json(created);
});

// Liste la fiche d'une classe (élèves scannés, activés ou non)
router.get('/:classId/roster', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('roster_students')
    .select('*')
    .eq('class_id', req.params.classId)
    .order('full_name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/roster/:rosterId', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { error } = await supabaseAdmin.from('roster_students').delete().eq('id', req.params.rosterId);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
});

export default router;
