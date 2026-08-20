import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Client "admin" utilisé côté serveur (bypass RLS quand nécessaire,
// mais on vérifie les droits nous-mêmes dans le code)
export const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

/**
 * Vérifie le JWT envoyé par le frontend (Authorization: Bearer <token>)
 * et attache req.user
 */
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Non authentifié' });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Session invalide ou expirée' });
    }
    req.user = data.user;
    req.token = token;
    next();
  } catch (err) {
    console.error('requireAuth error:', err);
    res.status(500).json({ error: 'Erreur serveur auth' });
  }
}

/**
 * Vérifie que req.user a bien un rôle dans l'école donnée par
 * req.params.schoolId ou req.body.school_id ou req.headers['x-school-id'].
 * Attache req.schoolId et req.role.
 * allowedRoles: tableau optionnel, ex: ['admin', 'prof']
 */
export function requireSchoolRole(allowedRoles = null) {
  return async (req, res, next) => {
    try {
      const schoolId =
        req.params.schoolId || req.body.school_id || req.headers['x-school-id'];
      if (!schoolId) return res.status(400).json({ error: 'school_id manquant' });

      const { data, error } = await supabaseAdmin
        .from('school_members')
        .select('role')
        .eq('school_id', schoolId)
        .eq('user_id', req.user.id);

      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(403).json({ error: "Vous n'êtes pas membre de cette école" });
      }

      const roles = data.map((r) => r.role);
      if (allowedRoles && !roles.some((r) => allowedRoles.includes(r))) {
        return res.status(403).json({ error: 'Rôle insuffisant pour cette action' });
      }

      req.schoolId = schoolId;
      req.roles = roles;
      next();
    } catch (err) {
      console.error('requireSchoolRole error:', err);
      res.status(500).json({ error: 'Erreur serveur rôle' });
    }
  };
}
