import { Router } from 'express';
import { supabaseAdmin, requireAuth, requireSchoolRole } from '../middleware/auth.js';

const router = Router();

// ---- CLASSES ----

router.post('/', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { name, level, school_year } = req.body;
  const { data, error } = await supabaseAdmin
    .from('classes')
    .insert({ school_id: req.schoolId, name, level, school_year })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.get('/', requireAuth, requireSchoolRole(), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('classes')
    .select('*')
    .eq('school_id', req.schoolId)
    .order('name');
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
  const { name, color } = req.body;
  const { data, error } = await supabaseAdmin
    .from('subjects')
    .insert({ school_id: req.schoolId, name, color })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
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

export default router;
