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

// Régler les poids interro/devoir spécifiques à une matière (NULL = hérite du réglage école)
router.put('/subjects/:subjectId/weights', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { interro_weight, devoir_weight } = req.body;
  const { data, error } = await supabaseAdmin
    .from('subjects')
    .update({ interro_weight, devoir_weight })
    .eq('id', req.params.subjectId)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

export default router;
