import { Router } from 'express';
import { supabaseAdmin, requireAuth, requireSchoolRole } from '../middleware/auth.js';

const router = Router();

// Créer un devoir (prof uniquement, et seulement pour ses propres classes/matières)
router.post('/', requireAuth, requireSchoolRole(['prof', 'admin']), async (req, res) => {
  const { class_id, subject_id, title, description, due_date, attachment_url } = req.body;

  // Vérifie que le prof enseigne bien cette matière dans cette classe
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
    .from('homework')
    .insert({
      school_id: req.schoolId,
      class_id,
      subject_id,
      teacher_id: req.user.id,
      title,
      description,
      due_date,
      attachment_url
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Devoirs d'une classe (optionnellement filtrés par matière)
router.get('/class/:classId', requireAuth, async (req, res) => {
  let query = supabaseAdmin
    .from('homework')
    .select('*, subjects(name, color), profiles(full_name)')
    .eq('class_id', req.params.classId)
    .order('due_date');
  if (req.query.subject_id) query = query.eq('subject_id', req.query.subject_id);

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Devoirs à venir pour un élève (toutes ses classes)
router.get('/student/:studentId/upcoming', requireAuth, async (req, res) => {
  const { data: classLinks, error: clErr } = await supabaseAdmin
    .from('class_students')
    .select('class_id')
    .eq('student_id', req.params.studentId);
  if (clErr) return res.status(400).json({ error: clErr.message });

  const classIds = classLinks.map((c) => c.class_id);
  if (classIds.length === 0) return res.json([]);

  const { data, error } = await supabaseAdmin
    .from('homework')
    .select('*, subjects(name, color), classes(name)')
    .in('class_id', classIds)
    .gte('due_date', new Date().toISOString().split('T')[0])
    .order('due_date');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.put('/:id', requireAuth, async (req, res) => {
  const { title, description, due_date, attachment_url } = req.body;
  const { data, error } = await supabaseAdmin
    .from('homework')
    .update({ title, description, due_date, attachment_url })
    .eq('id', req.params.id)
    .eq('teacher_id', req.user.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('homework')
    .delete()
    .eq('id', req.params.id)
    .eq('teacher_id', req.user.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
});

export default router;
