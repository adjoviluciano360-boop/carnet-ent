-- ============================================================
-- ENT SaaS Multi-Écoles — Schéma Supabase (PostgreSQL)
-- ============================================================
-- Convention : chaque table métier porte un school_id -> isolation
-- multi-tenant via Row Level Security (RLS).
-- Rôles possibles : admin (direction école), prof, eleve, parent
-- Un même compte auth peut avoir plusieurs rôles (un par école).
-- ============================================================

-- Extension utile pour UUID
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. ÉCOLES (tenants)
-- ------------------------------------------------------------
create table schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,          -- ex: "college-sainte-marie"
  city text,
  country text default 'BJ',
  plan text default 'free',           -- free / premium (facturation future)
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 2. PROFILS (étend auth.users de Supabase)
-- ------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  avatar_url text,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 3. RÔLES PAR ÉCOLE (table pivot user <-> school <-> rôle)
-- ------------------------------------------------------------
create type user_role as enum ('admin', 'prof', 'eleve', 'parent');

create table school_members (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role user_role not null,
  created_at timestamptz default now(),
  unique (school_id, user_id, role)
);

-- ------------------------------------------------------------
-- 4. LIEN PARENT <-> ÉLÈVE
-- ------------------------------------------------------------
create table parent_child_links (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  parent_id uuid not null references profiles(id) on delete cascade,
  child_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (school_id, parent_id, child_id)
);

-- ------------------------------------------------------------
-- 5. CLASSES
-- ------------------------------------------------------------
create table classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,              -- ex: "6ème A"
  level text,                      -- ex: "6ème"
  school_year text not null,       -- ex: "2026-2027"
  created_at timestamptz default now()
);

-- Élèves inscrits dans une classe
create table class_students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  unique (class_id, student_id)
);

-- ------------------------------------------------------------
-- 6. MATIÈRES
-- ------------------------------------------------------------
create table subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,              -- ex: "Mathématiques"
  color text default '#4F46E5',    -- pour l'UI (emploi du temps)
  created_at timestamptz default now()
);

-- Attribution prof <-> matière <-> classe
create table class_subject_teachers (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  teacher_id uuid not null references profiles(id) on delete cascade,
  unique (class_id, subject_id, teacher_id)
);

-- ------------------------------------------------------------
-- 7. EMPLOI DU TEMPS
-- ------------------------------------------------------------
create table schedule_slots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  teacher_id uuid references profiles(id) on delete set null,
  day_of_week smallint not null check (day_of_week between 1 and 7), -- 1=lundi
  start_time time not null,
  end_time time not null,
  room text,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 8. DEVOIRS
-- ------------------------------------------------------------
create table homework (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  teacher_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text,
  due_date date not null,
  attachment_url text,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 9. NOTES
-- ------------------------------------------------------------
create table grades (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  teacher_id uuid not null references profiles(id) on delete cascade,
  label text not null,             -- ex: "Devoir 1", "Composition trim 1"
  score numeric(5,2) not null,
  max_score numeric(5,2) not null default 20,
  coefficient numeric(4,2) default 1,
  graded_at date default current_date,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 10. ANNONCES
-- ------------------------------------------------------------
create table announcements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade, -- NULL = toute l'école
  author_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz default now()
);

-- ============================================================
-- HELPER FUNCTIONS (utilisées par les policies RLS)
-- ============================================================

-- Rôle(s) de l'utilisateur connecté dans une école donnée
create or replace function my_role(p_school_id uuid)
returns setof user_role
language sql security definer stable as $$
  select role from school_members
  where school_id = p_school_id and user_id = auth.uid()
$$;

create or replace function is_member(p_school_id uuid)
returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from school_members
    where school_id = p_school_id and user_id = auth.uid()
  )
$$;

create or replace function has_role(p_school_id uuid, p_role user_role)
returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from school_members
    where school_id = p_school_id and user_id = auth.uid() and role = p_role
  )
$$;

-- L'élève fait-il partie de la classe ?
create or replace function is_class_student(p_class_id uuid)
returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from class_students
    where class_id = p_class_id and student_id = auth.uid()
  )
$$;

-- Le prof enseigne-t-il dans cette classe ?
create or replace function is_class_teacher(p_class_id uuid)
returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from class_subject_teachers
    where class_id = p_class_id and teacher_id = auth.uid()
  )
$$;

-- Le parent a-t-il un enfant dans cette classe ?
create or replace function is_class_parent(p_class_id uuid)
returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from class_students cs
    join parent_child_links pcl on pcl.child_id = cs.student_id
    where cs.class_id = p_class_id and pcl.parent_id = auth.uid()
  )
$$;

-- Le parent a-t-il l'élève p_student_id comme enfant ?
create or replace function is_parent_of(p_student_id uuid)
returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from parent_child_links
    where child_id = p_student_id and parent_id = auth.uid()
  )
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table schools enable row level security;
alter table profiles enable row level security;
alter table school_members enable row level security;
alter table parent_child_links enable row level security;
alter table classes enable row level security;
alter table class_students enable row level security;
alter table subjects enable row level security;
alter table class_subject_teachers enable row level security;
alter table schedule_slots enable row level security;
alter table homework enable row level security;
alter table grades enable row level security;
alter table announcements enable row level security;

-- SCHOOLS : visible par ses membres, gérable par admin
create policy "schools_select" on schools for select using (is_member(id));
create policy "schools_update" on schools for update using (has_role(id, 'admin'));

-- PROFILES : chacun voit son propre profil + les profils des écoles où il est membre
create policy "profiles_select_self" on profiles for select using (id = auth.uid());
create policy "profiles_select_same_school" on profiles for select using (
  exists (
    select 1 from school_members sm1
    join school_members sm2 on sm1.school_id = sm2.school_id
    where sm1.user_id = auth.uid() and sm2.user_id = profiles.id
  )
);
create policy "profiles_update_self" on profiles for update using (id = auth.uid());
create policy "profiles_insert_self" on profiles for insert with check (id = auth.uid());

-- SCHOOL_MEMBERS : visible par les membres de l'école, géré par admin
create policy "members_select" on school_members for select using (is_member(school_id));
create policy "members_insert" on school_members for insert with check (has_role(school_id, 'admin'));
create policy "members_delete" on school_members for delete using (has_role(school_id, 'admin'));

-- PARENT_CHILD_LINKS : admin gère, parent/enfant concernés peuvent voir
create policy "links_select" on parent_child_links for select using (
  parent_id = auth.uid() or child_id = auth.uid() or has_role(school_id, 'admin')
);
create policy "links_insert" on parent_child_links for insert with check (has_role(school_id, 'admin'));
create policy "links_delete" on parent_child_links for delete using (has_role(school_id, 'admin'));

-- CLASSES : lecture = tout membre de l'école ; écriture = admin
create policy "classes_select" on classes for select using (is_member(school_id));
create policy "classes_insert" on classes for insert with check (has_role(school_id, 'admin'));
create policy "classes_update" on classes for update using (has_role(school_id, 'admin'));
create policy "classes_delete" on classes for delete using (has_role(school_id, 'admin'));

-- CLASS_STUDENTS : admin gère ; élève/prof/parent concernés voient
create policy "class_students_select" on class_students for select using (
  student_id = auth.uid()
  or is_class_teacher(class_id)
  or is_parent_of(student_id)
  or exists (select 1 from classes c where c.id = class_id and has_role(c.school_id, 'admin'))
);
create policy "class_students_insert" on class_students for insert with check (
  exists (select 1 from classes c where c.id = class_id and has_role(c.school_id, 'admin'))
);
create policy "class_students_delete" on class_students for delete using (
  exists (select 1 from classes c where c.id = class_id and has_role(c.school_id, 'admin'))
);

-- SUBJECTS : lecture = membre école ; écriture = admin
create policy "subjects_select" on subjects for select using (is_member(school_id));
create policy "subjects_insert" on subjects for insert with check (has_role(school_id, 'admin'));
create policy "subjects_update" on subjects for update using (has_role(school_id, 'admin'));
create policy "subjects_delete" on subjects for delete using (has_role(school_id, 'admin'));

-- CLASS_SUBJECT_TEACHERS : admin gère, membres de la classe voient
create policy "cst_select" on class_subject_teachers for select using (
  is_class_student(class_id) or is_class_teacher(class_id) or is_class_parent(class_id)
  or exists (select 1 from classes c where c.id = class_id and has_role(c.school_id, 'admin'))
);
create policy "cst_insert" on class_subject_teachers for insert with check (
  exists (select 1 from classes c where c.id = class_id and has_role(c.school_id, 'admin'))
);
create policy "cst_delete" on class_subject_teachers for delete using (
  exists (select 1 from classes c where c.id = class_id and has_role(c.school_id, 'admin'))
);

-- SCHEDULE_SLOTS : lecture = élève/prof/parent de la classe + admin ; écriture = admin ou prof titulaire du créneau
create policy "schedule_select" on schedule_slots for select using (
  is_class_student(class_id) or is_class_teacher(class_id) or is_class_parent(class_id) or has_role(school_id, 'admin')
);
create policy "schedule_insert" on schedule_slots for insert with check (has_role(school_id, 'admin'));
create policy "schedule_update" on schedule_slots for update using (has_role(school_id, 'admin'));
create policy "schedule_delete" on schedule_slots for delete using (has_role(school_id, 'admin'));

-- HOMEWORK : lecture = élève/prof/parent de la classe + admin ; écriture = prof de la matière/classe ou admin
create policy "homework_select" on homework for select using (
  is_class_student(class_id) or is_class_teacher(class_id) or is_class_parent(class_id) or has_role(school_id, 'admin')
);
create policy "homework_insert" on homework for insert with check (
  teacher_id = auth.uid() and is_class_teacher(class_id)
);
create policy "homework_update" on homework for update using (
  teacher_id = auth.uid() or has_role(school_id, 'admin')
);
create policy "homework_delete" on homework for delete using (
  teacher_id = auth.uid() or has_role(school_id, 'admin')
);

-- GRADES : élève voit ses notes, parent voit celles de son enfant, prof gère les siennes, admin tout
create policy "grades_select" on grades for select using (
  student_id = auth.uid()
  or is_parent_of(student_id)
  or teacher_id = auth.uid()
  or has_role(school_id, 'admin')
);
create policy "grades_insert" on grades for insert with check (
  teacher_id = auth.uid() and is_class_teacher(class_id)
);
create policy "grades_update" on grades for update using (
  teacher_id = auth.uid() or has_role(school_id, 'admin')
);
create policy "grades_delete" on grades for delete using (
  teacher_id = auth.uid() or has_role(school_id, 'admin')
);

-- ANNOUNCEMENTS : lecture = membres école (si class_id null) ou membres classe ; écriture = admin ou prof (pour ses classes)
create policy "announcements_select" on announcements for select using (
  (class_id is null and is_member(school_id))
  or (class_id is not null and (is_class_student(class_id) or is_class_teacher(class_id) or is_class_parent(class_id)))
  or has_role(school_id, 'admin')
);
create policy "announcements_insert" on announcements for insert with check (
  has_role(school_id, 'admin') or (class_id is not null and is_class_teacher(class_id))
);
create policy "announcements_update" on announcements for update using (
  author_id = auth.uid() or has_role(school_id, 'admin')
);
create policy "announcements_delete" on announcements for delete using (
  author_id = auth.uid() or has_role(school_id, 'admin')
);

-- ============================================================
-- TRIGGER : créer automatiquement le profil à l'inscription
-- ============================================================
create or replace function handle_new_user()
returns trigger
language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'Utilisateur'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
