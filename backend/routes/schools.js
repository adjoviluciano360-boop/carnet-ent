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
// Pour un élève, le matricule est généré automatiquement par le système (jamais saisi à la main)
router.post('/:schoolId/members', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { user_id, role } = req.body;
  if (!user_id || !role) return res.status(400).json({ error: 'user_id et role requis' });

  let student_number = null;
  if (role === 'eleve') {
    const { data: generated, error: genErr } = await supabaseAdmin.rpc('generate_matricule', {
      p_school_id: req.schoolId
    });
    if (genErr) return res.status(400).json({ error: genErr.message });
    student_number = generated;
  }

  const { data, error } = await supabaseAdmin
    .from('school_members')
    .insert({ school_id: req.schoolId, user_id, role, student_number })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Lister les membres d'une école (avec filtre optionnel ?role=eleve)
router.get('/:schoolId/members', requireAuth, requireSchoolRole(), async (req, res) => {
  let query = supabaseAdmin
    .from('school_members')
    .select('id, role, student_number, profiles(id, full_name, phone, avatar_url)')
    .eq('school_id', req.schoolId);
  if (req.query.role) query = query.eq('role', req.query.role);

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Rechercher un élève par matricule (utile pour l'assistant IA de saisie de notes)
router.get('/:schoolId/students/by-number/:studentNumber', requireAuth, requireSchoolRole(['prof', 'admin']), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('school_members')
    .select('id, student_number, profiles(id, full_name)')
    .eq('school_id', req.schoolId)
    .eq('role', 'eleve')
    .eq('student_number', req.params.studentNumber)
    .maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Aucun élève avec ce matricule' });
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

// Régler les poids interro/devoir par défaut de l'école
router.put('/:schoolId/weights', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { default_interro_weight, default_devoir_weight } = req.body;
  const { data, error } = await supabaseAdmin
    .from('schools')
    .update({ default_interro_weight, default_devoir_weight })
    .eq('id', req.schoolId)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

export default router;
