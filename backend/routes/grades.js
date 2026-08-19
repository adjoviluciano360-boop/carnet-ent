import { Router } from 'express';
import { supabaseAdmin, requireAuth, requireSchoolRole } from '../middleware/auth.js';

const router = Router();

// Saisir une note (prof uniquement, pour sa matière/classe)
router.post('/', requireAuth, requireSchoolRole(['prof', 'admin']), async (req, res) => {
  const { student_id, class_id, subject_id, label, score, max_score, coefficient, graded_at } = req.body;

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
      graded_at
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Saisie groupée (bulletin de classe pour une évaluation donnée)
router.post('/bulk', requireAuth, requireSchoolRole(['prof', 'admin']), async (req, res) => {
  const { class_id, subject_id, label, max_score, coefficient, graded_at, entries } = req.body;
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
    graded_at
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
