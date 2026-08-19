import { Router } from 'express';
import { supabaseAdmin, requireAuth, requireSchoolRole } from '../middleware/auth.js';

const router = Router();

// Créer une annonce (admin -> toute l'école ou une classe ; prof -> ses classes seulement)
router.post('/', requireAuth, requireSchoolRole(['admin', 'prof']), async (req, res) => {
  const { class_id, title, body } = req.body;

  if (!req.roles.includes('admin')) {
    if (!class_id) return res.status(403).json({ error: 'Un prof ne peut annoncer que sur ses classes' });
    const { data: assign } = await supabaseAdmin
      .from('class_subject_teachers')
      .select('id')
      .eq('class_id', class_id)
      .eq('teacher_id', req.user.id)
      .maybeSingle();
    if (!assign) return res.status(403).json({ error: "Vous n'enseignez pas dans cette classe" });
  }

  const { data, error } = await supabaseAdmin
    .from('announcements')
    .insert({ school_id: req.schoolId, class_id: class_id || null, author_id: req.user.id, title, body })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Annonces visibles par l'utilisateur : toute l'école + ses classes
router.get('/feed', requireAuth, requireSchoolRole(), async (req, res) => {
  let classIds = [];
  if (req.query.class_ids) {
    classIds = req.query.class_ids.split(',');
  }

  let query = supabaseAdmin
    .from('announcements')
    .select('*, profiles(full_name), classes(name)')
    .eq('school_id', req.schoolId)
    .order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });

  // Filtre côté serveur : annonces école entière OU une des classes de l'utilisateur
  const filtered = data.filter((a) => a.class_id === null || classIds.includes(a.class_id));
  res.json(filtered);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('announcements')
    .delete()
    .eq('id', req.params.id)
    .eq('author_id', req.user.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
});

export default router;
