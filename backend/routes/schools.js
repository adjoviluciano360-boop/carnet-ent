import { Router } from 'express';
import { supabaseAdmin, requireAuth, requireSchoolRole } from '../middleware/auth.js';

const router = Router();

// Annuaire public des écoles — AUCUNE authentification requise
// N'expose que des informations non sensibles (nom, ville, filières)
router.get('/public', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('schools')
    .select('id, name, slug, city, country, tracks(id, name)')
    .order('name');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Activation d'un compte élève via son matricule (donné sur la fiche imprimée après scan IA).
// L'utilisateur doit être connecté ; il devient membre 'eleve' de l'école et est inscrit dans sa classe.
router.post('/:schoolId/claim-matricule', requireAuth, async (req, res) => {
  const { matricule } = req.body;
  if (!matricule) return res.status(400).json({ error: 'matricule requis' });

  const { data: roster, error: rosterErr } = await supabaseAdmin
    .from('roster_students')
    .select('*')
    .eq('school_id', req.schoolId)
    .eq('matricule', matricule.trim())
    .maybeSingle();
  if (rosterErr) return res.status(400).json({ error: rosterErr.message });
  if (!roster) return res.status(404).json({ error: 'Matricule introuvable pour cette école.' });
  if (roster.claimed_by) return res.status(400).json({ error: 'Ce matricule a déjà été activé par un autre compte.' });

  const { error: claimErr } = await supabaseAdmin
    .from('roster_students')
    .update({ claimed_by: req.user.id })
    .eq('id', roster.id);
  if (claimErr) return res.status(400).json({ error: claimErr.message });

  const { error: memberErr } = await supabaseAdmin
    .from('school_members')
    .insert({ school_id: req.schoolId, user_id: req.user.id, role: 'eleve', student_number: matricule.trim() });
  if (memberErr && memberErr.code !== '23505') return res.status(400).json({ error: memberErr.message });

  const { error: classErr } = await supabaseAdmin
    .from('class_students')
    .insert({ class_id: roster.class_id, student_id: req.user.id });
  if (classErr && classErr.code !== '23505') return res.status(400).json({ error: classErr.message });

  res.json({ ok: true, class_id: roster.class_id, full_name: roster.full_name });
});

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

// Lier un parent à un enfant (le parent doit déjà être membre — voir invite-parent pour le flux complet)
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

// Inviter un parent par e-mail et le lier directement à son enfant.
// Envoie un e-mail d'invitation via Supabase Auth (crée le compte s'il n'existe pas encore).
// Si l'adresse a déjà un compte, on le retrouve et on le lie directement (pas de doublon d'e-mail).
router.post('/:schoolId/invite-parent', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { email, full_name, child_id } = req.body;
  if (!email || !child_id) return res.status(400).json({ error: 'email et child_id requis' });

  let userId;
  let invited = false;

  const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.FRONTEND_URL}/invite-accept.html`,
    data: full_name ? { full_name } : undefined
  });

  if (inviteErr) {
    // Adresse déjà enregistrée : on retrouve le compte existant plutôt que d'échouer
    const alreadyExists = /already.*registered|already.*exist/i.test(inviteErr.message || '');
    if (!alreadyExists) return res.status(400).json({ error: inviteErr.message });

    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) return res.status(400).json({ error: listErr.message });
    const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!existing) return res.status(400).json({ error: "Impossible de retrouver ce compte existant." });
    userId = existing.id;
  } else {
    userId = inviteData.user.id;
    invited = true;
  }

  const { error: memberErr } = await supabaseAdmin
    .from('school_members')
    .insert({ school_id: req.schoolId, user_id: userId, role: 'parent' });
  if (memberErr && memberErr.code !== '23505') return res.status(400).json({ error: memberErr.message });

  const { error: linkErr } = await supabaseAdmin
    .from('parent_child_links')
    .insert({ school_id: req.schoolId, parent_id: userId, child_id });
  if (linkErr && linkErr.code !== '23505') return res.status(400).json({ error: linkErr.message });

  res.status(201).json({
    ok: true,
    invited,
    message: invited
      ? "Invitation envoyée par e-mail."
      : "Ce compte existait déjà : le parent a été directement lié à l'enfant (aucun e-mail envoyé)."
  });
});

// Régler les poids interro/devoir par défaut de l'école
router.put('/:schoolId/weights', requireAuth, requireSchoolRole(['admin']), async (req, res) => {  const { default_interro_weight, default_devoir_weight } = req.body;
  const { data, error } = await supabaseAdmin
    .from('schools')
    .update({ default_interro_weight, default_devoir_weight })
    .eq('id', req.schoolId)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ---- CANDIDATURES DE PROFESSEURS ----

// Postuler pour enseigner dans une école (utilisateur connecté, pas encore forcément membre)
router.post('/:schoolId/apply', requireAuth, async (req, res) => {
  const { message } = req.body;
  const { data, error } = await supabaseAdmin
    .from('teacher_applications')
    .insert({ school_id: req.params.schoolId, user_id: req.user.id, message: message || null })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Vous avez déjà postulé dans cette école.' });
    return res.status(400).json({ error: error.message });
  }
  res.status(201).json(data);
});

// Mes candidatures (utilisateur connecté)
router.get('/applications/mine', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('teacher_applications')
    .select('*, schools(name, city)')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Candidatures reçues par une école (admin uniquement)
router.get('/:schoolId/applications', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  let query = supabaseAdmin
    .from('teacher_applications')
    .select('*, profiles(id, full_name, phone)')
    .eq('school_id', req.schoolId)
    .order('created_at', { ascending: false });
  if (req.query.status) query = query.eq('status', req.query.status);

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Accepter ou refuser une candidature (admin uniquement)
// En cas d'acceptation, le candidat devient automatiquement membre 'prof' de l'école
router.put('/:schoolId/applications/:appId', requireAuth, requireSchoolRole(['admin']), async (req, res) => {
  const { status } = req.body; // 'accepted' | 'rejected'
  if (!['accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ error: "status doit être 'accepted' ou 'rejected'" });
  }

  const { data: application, error: appErr } = await supabaseAdmin
    .from('teacher_applications')
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq('id', req.params.appId)
    .eq('school_id', req.schoolId)
    .select()
    .single();
  if (appErr) return res.status(400).json({ error: appErr.message });

  if (status === 'accepted') {
    const { error: memberErr } = await supabaseAdmin
      .from('school_members')
      .insert({ school_id: req.schoolId, user_id: application.user_id, role: 'prof' })
      .select()
      .maybeSingle();
    // Si déjà membre (ex: doublon), on ignore silencieusement l'erreur de contrainte unique
    if (memberErr && memberErr.code !== '23505') return res.status(400).json({ error: memberErr.message });
  }

  res.json(application);
});

export default router;
