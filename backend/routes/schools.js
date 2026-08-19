import { Router } from 'express';
import { supabaseAdmin, requireAuth, requireSchoolRole } from '../middleware/auth.js';

const router = Router();

// Créer une école (le créateur devient admin automatiquement)
router.post('/', requireAuth, async (req, res) => {
  const { name, slug, city, country } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'name et slug requis' });

  const { data: school, error } = await supabaseAdmin
    .from('schools')
    .insert({ name, slug, city, country })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  const { error: memberErr } = await supabaseAdmin
    .from('school_members')
    .insert({ school_id: school.id, user_id: req.user.id, role: 'admin' });
  if (memberErr) return res.status(400).json({ error: memberErr.message });

  res.status(201).json(school);
});

// Lister les écoles dont je suis membre (toutes casquettes confondues)
router.get('/mine', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('school_members')
    .select('role, schools(*)')
    .eq('user_id', req.user.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Inviter un membre (élève / prof / parent / admin) dans une école
router.post('/:schoolId/members', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { user_id, role } = req.body;
  if (!user_id || !role) return res.status(400).json({ error: 'user_id et role requis' });

  const { data, error } = await supabaseAdmin
    .from('school_members')
    .insert({ school_id: req.schoolId, user_id, role })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Lister les membres d'une école (avec filtre optionnel ?role=eleve)
router.get('/:schoolId/members', requireAuth, requireSchoolRole(), async (req, res) => {
  let query = supabaseAdmin
    .from('school_members')
    .select('id, role, profiles(id, full_name, phone, avatar_url)')
    .eq('school_id', req.schoolId);
  if (req.query.role) query = query.eq('role', req.query.role);

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Lier un parent à un enfant
router.post('/:schoolId/parent-links', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { parent_id, child_id } = req.body;
  const { data, error } = await supabaseAdmin
    .from('parent_child_links')
    .insert({ school_id: req.schoolId, parent_id, child_id })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

export default router;
