-- ============================================================
-- MIGRATION 002 — Filières, matricule élève, notes typées
-- À exécuter dans le SQL Editor Supabase APRÈS schema.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. FILIÈRES (ex: "IMI", "Généralités", "STI")
-- ------------------------------------------------------------
create table if not exists tracks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,              -- ex: "IMI"
  created_at timestamptz default now()
);

alter table classes add column if not exists track_id uuid references tracks(id) on delete set null;

alter table tracks enable row level security;

create policy "tracks_select" on tracks for select using (is_member(school_id));
create policy "tracks_insert" on tracks for insert with check (has_role(school_id, 'admin'));
create policy "tracks_update" on tracks for update using (has_role(school_id, 'admin'));
create policy "tracks_delete" on tracks for delete using (has_role(school_id, 'admin'));

-- ------------------------------------------------------------
-- 2. MATRICULE ÉLÈVE (identifiant, unique par école)
-- ------------------------------------------------------------
alter table school_members add column if not exists student_number text;

create unique index if not exists school_members_student_number_unique
  on school_members (school_id, student_number)
  where student_number is not null;

-- ------------------------------------------------------------
-- 3. TYPE DE NOTE (interro / devoir)
-- ------------------------------------------------------------
do $$ begin
  create type grade_type as enum ('interro', 'devoir');
exception
  when duplicate_object then null;
end $$;

alter table grades add column if not exists type grade_type not null default 'devoir';
