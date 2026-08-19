import { Router } from 'express';
import { supabaseAdmin, requireAuth, requireSchoolRole } from '../middleware/auth.js';

const router = Router();

// Créer un créneau
router.post('/', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { class_id, subject_id, teacher_id, day_of_week, start_time, end_time, room } = req.body;
  const { data, error } = await supabaseAdmin
    .from('schedule_slots')
    .insert({
      school_id: req.schoolId,
      class_id,
      subject_id,
      teacher_id,
      day_of_week,
      start_time,
      end_time,
      room
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Emploi du temps d'une classe
router.get('/class/:classId', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('schedule_slots')
    .select('*, subjects(name, color), profiles(full_name)')
    .eq('class_id', req.params.classId)
    .order('day_of_week')
    .order('start_time');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Emploi du temps d'un prof (toutes ses classes)
router.get('/teacher/:teacherId', requireAuth, requireSchoolRole(), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('schedule_slots')
    .select('*, subjects(name, color), classes(name)')
    .eq('teacher_id', req.params.teacherId)
    .eq('school_id', req.schoolId)
    .order('day_of_week')
    .order('start_time');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { error } = await supabaseAdmin.from('schedule_slots').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
});

export default router;
