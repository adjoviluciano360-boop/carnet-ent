import { Router } from 'express';
import { supabaseAdmin, requireAuth, requireSchoolRole } from '../middleware/auth.js';

const router = Router();

// Saisir une note (prof uniquement, pour sa matière/classe)
// type: 'interro' | 'devoir'
router.post('/', requireAuth, requireSchoolRole(['prof', 'admin']), async (req, res) => {
  const { student_id, class_id, subject_id, label, score, max_score, coefficient, graded_at, type } = req.body;

  if (req.roles.includes('prof') && !req.roles.includes('admin')) {
    const { data: assign } = await supabaseAdmin
      .from('class_subject_teachers')
      .select('id')
      .eq('class_id', class_id)
      .eq('subject_id', subject_id)
      .eq('teacher_id', req.user.id)
      .maybeSingle();
    if (!assign) return res.status(403).json({ error: "Vous n'enseignez pas cette matière dans cette classe" });
  }

  const { data, error } = await supabaseAdmin
    .from('grades')
    .insert({
      school_id: req.schoolId,
      student_id,
      class_id,
      subject_id,
      teacher_id: req.user.id,
      label,
      score,
      max_score: max_score || 20,
      coefficient: coefficient || 1,
      graded_at,
      type: type === 'interro' ? 'interro' : 'devoir'
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Saisie groupée (bulletin de classe pour une évaluation donnée)
router.post('/bulk', requireAuth, requireSchoolRole(['prof', 'admin']), async (req, res) => {
  const { class_id, subject_id, label, max_score, coefficient, graded_at, type, entries } = req.body;
  // entries: [{ student_id, score }, ...]

  const rows = entries.map((e) => ({
    school_id: req.schoolId,
    student_id: e.student_id,
    class_id,
    subject_id,
    teacher_id: req.user.id,
    label,
    score: e.score,
    max_score: max_score || 20,
    coefficient: coefficient || 1,
    graded_at,
    type: type === 'interro' ? 'interro' : 'devoir'
  }));

  const { data, error } = await supabaseAdmin.from('grades').insert(rows).select();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Notes d'un élève (pour l'élève lui-même, son parent, ou un prof/admin)
router.get('/student/:studentId', requireAuth, async (req, res) => {
  let query = supabaseAdmin
    .from('grades')
    .select('*, subjects(name, color), profiles!grades_teacher_id_fkey(full_name)')
    .eq('student_id', req.params.studentId)
    .order('graded_at', { ascending: false });
  if (req.query.subject_id) query = query.eq('subject_id', req.query.subject_id);

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Moyenne d'un élève par matière (calcul pondéré par coefficient)
router.get('/student/:studentId/average', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('grades')
    .select('subject_id, subjects(name), score, max_score, coefficient')
    .eq('student_id', req.params.studentId);
  if (error) return res.status(400).json({ error: error.message });

  const bySubject = {};
  for (const g of data) {
    const key = g.subject_id;
    if (!bySubject[key]) bySubject[key] = { name: g.subjects.name, totalWeighted: 0, totalCoef: 0 };
    const normalized = (g.score / g.max_score) * 20;
    bySubject[key].totalWeighted += normalized * g.coefficient;
    bySubject[key].totalCoef += g.coefficient;
  }
  const result = Object.entries(bySubject).map(([subject_id, v]) => ({
    subject_id,
    subject_name: v.name,
    average: v.totalCoef ? +(v.totalWeighted / v.totalCoef).toFixed(2) : null
  }));
  res.json(result);
});

// Bulletin complet d'un élève : moyenne interro, moyenne devoir, moyenne générale par matière
// Pondération : celle de la matière si définie, sinon celle de l'école (par défaut interro=1, devoir=2)
router.get('/student/:studentId/bulletin', requireAuth, async (req, res) => {
  const { data: school, error: schoolErr } = await supabaseAdmin
    .from('schools')
    .select('default_interro_weight, default_devoir_weight')
    .eq('id', req.schoolId)
    .single();
  if (schoolErr) return res.status(400).json({ error: schoolErr.message });

  const { data: grades, error } = await supabaseAdmin
    .from('grades')
    .select('subject_id, subjects(name, interro_weight, devoir_weight, coefficient), type, score, max_score, coefficient, label, graded_at')
    .eq('student_id', req.params.studentId);
  if (error) return res.status(400).json({ error: error.message });

  const bySubject = {};
  for (const g of grades) {
    const key = g.subject_id;
    if (!bySubject[key]) {
      bySubject[key] = {
        subject_id: key,
        subject_name: g.subjects.name,
        subject_coefficient: g.subjects.coefficient ?? 1,
        interro_weight: g.subjects.interro_weight ?? school.default_interro_weight,
        devoir_weight: g.subjects.devoir_weight ?? school.default_devoir_weight,
        interro: { totalWeighted: 0, totalCoef: 0, count: 0 },
        devoir: { totalWeighted: 0, totalCoef: 0, count: 0 },
        details: []
      };
    }
    const normalized = (g.score / g.max_score) * 20;
    const bucket = bySubject[key][g.type];
    bucket.totalWeighted += normalized * g.coefficient;
    bucket.totalCoef += g.coefficient;
    bucket.count += 1;
    bySubject[key].details.push({
      label: g.label, type: g.type, score: g.score, max_score: g.max_score,
      coefficient: g.coefficient, graded_at: g.graded_at
    });
  }

  // Moyenne générale par matière : pondération interro/devoir propre à la matière
  // (ou héritée de l'école si non définie). Si un seul type existe encore, l'IA
  // n'invente rien : elle indique "en attente" pour l'autre et n'utilise que ce qui est disponible.
  const result = Object.values(bySubject).map((s) => {
    const moyInterro = s.interro.totalCoef ? +(s.interro.totalWeighted / s.interro.totalCoef).toFixed(2) : null;
    const moyDevoir = s.devoir.totalCoef ? +(s.devoir.totalWeighted / s.devoir.totalCoef).toFixed(2) : null;

    let moyGenerale = null;
    let statut = 'complet';
    if (moyInterro !== null && moyDevoir !== null) {
      const totalWeight = s.interro_weight + s.devoir_weight;
      moyGenerale = +(((moyInterro * s.interro_weight) + (moyDevoir * s.devoir_weight)) / totalWeight).toFixed(2);
    } else if (moyInterro !== null || moyDevoir !== null) {
      moyGenerale = moyInterro ?? moyDevoir;
      statut = moyInterro === null ? 'en_attente_interro' : 'en_attente_devoir';
    } else {
      statut = 'aucune_note';
    }

    return {
      subject_id: s.subject_id,
      subject_name: s.subject_name,
      subject_coefficient: s.subject_coefficient,
      interro_weight: s.interro_weight,
      devoir_weight: s.devoir_weight,
      moyenne_interro: moyInterro,
      moyenne_devoir: moyDevoir,
      moyenne_generale: moyGenerale,
      statut,
      nb_notes: s.details.length,
      details: s.details
    };
  });

  // Moyenne générale du bulletin : pondérée par le coefficient de chaque matière
  // (ex: Maths coef 4 pèse 4x plus que EPS coef 1), pas une simple moyenne arithmétique.
  const overall = result.filter((r) => r.moyenne_generale !== null);
  const totalCoefBulletin = overall.reduce((sum, r) => sum + r.subject_coefficient, 0);
  const moyenne_generale_bulletin = totalCoefBulletin
    ? +(overall.reduce((sum, r) => sum + r.moyenne_generale * r.subject_coefficient, 0) / totalCoefBulletin).toFixed(2)
    : null;

  const enAttente = result.filter((r) => r.statut !== 'complet').map((r) => ({
    subject_name: r.subject_name,
    manque: r.statut === 'en_attente_interro' ? 'notes d\'interro' : r.statut === 'en_attente_devoir' ? 'notes de devoir' : 'toute note'
  }));

  res.json({ subjects: result, moyenne_generale_bulletin, en_attente: enAttente });
});

// Notes saisies par un prof pour une classe/matière (vue de correction)
router.get('/class/:classId/subject/:subjectId', requireAuth, requireSchoolRole(['prof', 'admin']), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('grades')
    .select('*, profiles!grades_student_id_fkey(full_name)')
    .eq('class_id', req.params.classId)
    .eq('subject_id', req.params.subjectId)
    .order('graded_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('grades')
    .delete()
    .eq('id', req.params.id)
    .eq('teacher_id', req.user.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
});

export default router;
