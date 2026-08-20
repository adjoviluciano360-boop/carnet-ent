# Carnet — ENT SaaS multi-écoles

Plateforme d'espace numérique de travail (ENT) pour établissements scolaires,
en marque blanche multi-tenant (une instance sert plusieurs écoles).

Stack : **Supabase** (auth + Postgres + RLS) · **Node.js/Express** (API) ·
**HTML/CSS/JS statique** (frontend) — même logique que Baobab Learn.

## Fonctionnalités

- Authentification (Supabase Auth) + rôles par école (admin, prof, élève, parent)
- Un compte peut avoir plusieurs rôles dans plusieurs écoles (multi-tenant)
- **Filières** (ex: IMI) contenant plusieurs **salles/classes** (ex: Second IMI-1, Second IMI-2, Première IMI)
- Matières, affectation prof ↔ matière ↔ classe (les profs de chaque salle sont donc toujours visibles)
- **Matricule élève généré automatiquement** à l'ajout (format `ECO-2026-0001`)
- Emploi du temps par classe (grille hebdomadaire)
- Devoirs par matière/classe
- **Notes typées** (interro / devoir) avec **coefficients personnalisables** par matière (ou par défaut au niveau école)
- **Bulletin automatique** : moyenne interro, moyenne devoir et moyenne générale calculées en temps réel par matière ; si une info manque (ex: pas encore de note de devoir), le bulletin l'indique clairement en attendant, sans se tromper
- **Assistant IA de saisie de notes** (chat en langage naturel) : décrivez une note à l'oral/à l'écrit, l'IA extrait les infos et enregistre — si une info manque, elle vous la redemande avant de continuer
- Annonces (par classe ou toute l'école)
- Portail parent : vue consolidée par enfant (classe, notes, devoirs, annonces)
- Sécurité au niveau ligne (RLS) : chaque rôle ne voit que ce qui le concerne

## 1. Mettre en place Supabase

1. Créer un projet sur [supabase.com](https://supabase.com)
2. Aller dans **SQL Editor**, exécuter **dans l'ordre** :
   1. `supabase/schema.sql`
   2. `supabase/migration_002.sql` (filières, matricule, types de notes)
   3. `supabase/migration_003.sql` (coefficients personnalisables, génération auto du matricule)
3. Dans **Project Settings → API**, récupérer :
   - `Project URL` → `SUPABASE_URL`
   - `anon public key` → `SUPABASE_ANON_KEY` (frontend)
   - `service_role key` → `SUPABASE_SERVICE_ROLE_KEY` (backend uniquement, **jamais** exposée au frontend)
4. Dans **Authentication → Providers**, activer Email/Password (activé par défaut)
5. Dans **Authentication → URL Configuration**, renseigner votre URL Netlify en **Site URL** et **Redirect URLs** (sinon les liens de confirmation d'e-mail pointent vers localhost)

## 2. Déployer le backend (Render)

```bash
cd backend
npm install
cp .env.example .env
# remplir SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FRONTEND_URL, OPENROUTER_API_KEY
npm start
```

Sur Render : nouveau **Web Service**, connecter le dossier `backend/`,
build command `npm install`, start command `npm start`, ajouter les
variables d'environnement du `.env`.

**Pour l'assistant IA de saisie de notes** : créer un compte gratuit sur
[openrouter.ai](https://openrouter.ai), générer une clé API (**Keys** dans le menu),
et la renseigner dans `OPENROUTER_API_KEY`. Le modèle par défaut
(`meta-llama/llama-3.1-8b-instruct:free`) est gratuit.

## 3. Déployer le frontend (Netlify)

1. Ouvrir `frontend/js/config.js` et renseigner :
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (les clés publiques, sans risque)
   - `API_BASE_URL` → l'URL Render de votre backend (ex: `https://carnet-api.onrender.com/api`)
2. Déployer le dossier `frontend/` tel quel sur Netlify (pas de build nécessaire,
   c'est du HTML/JS statique)

## 4. Créer votre première école

1. Ouvrir le site déployé, créer un compte (onglet "Créer un compte")
2. Vous arrivez sur "Vous n'êtes rattaché à aucune école" → cliquer sur
   **Créer une école** : vous devenez automatiquement `admin` de cette école
3. Depuis le tableau de bord admin : créer des classes, des matières,
   puis ajouter les membres (élèves, profs, parents)

## 5. Ajouter des membres à une école

Pour l'instant, l'admin ajoute un membre en collant son **UUID Supabase**
(visible dans **Authentication → Users** côté Supabase, ou que la personne
peut retrouver via `supabaseClient.auth.getUser()` après connexion).

**Amélioration suggérée pour la v2** : remplacer la saisie manuelle d'UUID
par une invitation par e-mail (Supabase permet d'envoyer un lien magique),
ou par un code d'invitation par école.

## 6. Lier un parent à un enfant

Actuellement via l'API directement (pas encore d'UI dédiée) :

```
POST /api/schools/:schoolId/parent-links
Headers: Authorization: Bearer <token admin>, X-School-Id: <school_id>
Body: { "parent_id": "<uuid parent>", "child_id": "<uuid élève>" }
```

## Ce qui n'est pas encore construit (pistes v2)

- Interface d'invitation par e-mail (au lieu de coller un UUID)
- UI pour lier parent ↔ enfant (actuellement API seulement)
- Modification/suppression de devoirs et notes depuis l'UI (l'API existe déjà)
- Bulletins PDF exportables (📎 le skill `pdf` peut générer ça facilement)
- Notifications (nouveau devoir, nouvelle note, nouvelle annonce)
- Présences/absences (module non demandé dans le brief initial)
- Facturation multi-écoles (le champ `schools.plan` est prévu mais pas utilisé)
- Job planifié pour rappels de devoirs (Supabase Edge Functions + cron)

## Structure du projet

```
ent-project/
├── supabase/
│   └── schema.sql          # tables, RLS, triggers
├── backend/
│   ├── server.js
│   ├── middleware/auth.js  # vérification JWT + rôle par école
│   └── routes/
│       ├── schools.js      # écoles, membres, liens parent-enfant
│       ├── classes.js      # classes, matières, affectations
│       ├── schedule.js     # emploi du temps
│       ├── homework.js     # devoirs
│       ├── grades.js       # notes + moyennes
│       ├── announcements.js
│       └── parent.js       # portail parent
└── frontend/
    ├── index.html           # connexion / inscription
    ├── app.html             # shell de l'application
    ├── css/style.css        # design "cahier d'écolier"
    └── js/
        ├── config.js        # clés à remplir
        ├── supabaseClient.js
        ├── auth.js
        ├── api.js           # wrapper fetch vers le backend
        ├── app.js           # navigation, sélection école/rôle
        └── views.js         # rendu de chaque module
```
