import { Router } from 'express';
import { supabaseAdmin, requireAuth, requireSchoolRole } from '../middleware/auth.js';

const router = Router();

// Liste des enfants du parent connecté dans une école
router.get('/children', requireAuth, requireSchoolRole(['parent']), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('parent_child_links')
    .select('child_id, profiles!parent_child_links_child_id_fkey(id, full_name, avatar_url)')
    .eq('parent_id', req.user.id)
    .eq('school_id', req.schoolId);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Vue synthétique d'un enfant : classe, notes récentes, devoirs à venir, annonces
router.get('/children/:childId/overview', requireAuth, requireSchoolRole(['parent']), async (req, res) => {
  const { childId } = req.params;

  // Vérifie le lien parent-enfant
  const { data: link } = await supabaseAdmin
    .from('parent_child_links')
    .select('id')
    .eq('parent_id', req.user.id)
    .eq('child_id', childId)
    .eq('school_id', req.schoolId)
    .maybeSingle();
  if (!link) return res.status(403).json({ error: "Cet enfant n'est pas lié à votre compte" });

  const { data: classLink } = await supabaseAdmin
    .from('class_students')
    .select('classes(*)')
    .eq('student_id', childId)
    .maybeSingle();

  const { data: recentGrades } = await supabaseAdmin
    .from('grades')
    .select('*, subjects(name, color)')
    .eq('student_id', childId)
    .order('graded_at', { ascending: false })
    .limit(10);

  const { data: upcomingHomework } = await supabaseAdmin
    .from('homework')
    .select('*, subjects(name, color)')
    .eq('class_id', classLink?.classes?.id || '')
    .gte('due_date', new Date().toISOString().split('T')[0])
    .order('due_date')
    .limit(10);

  const { data: announcements } = await supabaseAdmin
    .from('announcements')
    .select('*, profiles(full_name)')
    .eq('school_id', req.schoolId)
    .order('created_at', { ascending: false })
    .limit(10);

  res.json({
    class: classLink?.classes || null,
    recentGrades: recentGrades || [],
    upcomingHomework: upcomingHomework || [],
    announcements: (announcements || []).filter(
      (a) => a.class_id === null || a.class_id === classLink?.classes?.id
    )
  });
});

export default router;
