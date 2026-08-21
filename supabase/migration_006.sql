-- ============================================================
-- MIGRATION 006 — Coefficient de matière (poids dans le bulletin général)
-- À exécuter dans le SQL Editor Supabase APRÈS migration_005.sql
-- ============================================================

-- Coefficient global de la matière (ex: Maths = 4, EPS = 1), utilisé pour
-- pondérer la moyenne générale du bulletin entre les différentes matières.
-- Différent de interro_weight/devoir_weight, qui combinent interros et devoirs
-- À L'INTÉRIEUR d'une même matière.
alter table subjects add column if not exists coefficient numeric(4,2) not null default 1;
