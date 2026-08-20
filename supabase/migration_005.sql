-- ============================================================
-- MIGRATION 005 — Fiche élèves (roster) + activation par matricule
-- À exécuter dans le SQL Editor Supabase APRÈS migration_004.sql
-- ============================================================

-- Un élève "sur la fiche" mais pas encore inscrit sur Carnet.
-- Dès qu'il crée son compte et saisit son matricule, claimed_by est renseigné
-- et il devient un vrai membre (school_members + class_students).
create table roster_students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  full_name text not null,
  matricule text not null,
  claimed_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  unique (school_id, matricule)
);

alter table roster_students enable row level security;

-- Seul un admin gère la fiche (le "claim" par un élève passe par le backend, en service_role)
create policy "roster_select" on roster_students for select using (has_role(school_id, 'admin'));
create policy "roster_insert" on roster_students for insert with check (has_role(school_id, 'admin'));
create policy "roster_update" on roster_students for update using (has_role(school_id, 'admin'));
create policy "roster_delete" on roster_students for delete using (has_role(school_id, 'admin'));
