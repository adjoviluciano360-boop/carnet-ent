-- ============================================================
-- MIGRATION 003 — Coefficients interro/devoir personnalisables
-- + génération automatique du matricule élève
-- À exécuter dans le SQL Editor Supabase APRÈS migration_002.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Pondération interro/devoir par défaut (au niveau école)
-- ------------------------------------------------------------
alter table schools add column if not exists default_interro_weight numeric(4,2) not null default 1;
alter table schools add column if not exists default_devoir_weight numeric(4,2) not null default 2;

-- ------------------------------------------------------------
-- 2. Pondération spécifique par matière (NULL = utilise celle de l'école)
-- ------------------------------------------------------------
alter table subjects add column if not exists interro_weight numeric(4,2);
alter table subjects add column if not exists devoir_weight numeric(4,2);

-- ------------------------------------------------------------
-- 3. Compteur de matricule par école (pour génération séquentielle)
-- ------------------------------------------------------------
create table if not exists matricule_counters (
  school_id uuid primary key references schools(id) on delete cascade,
  next_value integer not null default 1
);

alter table matricule_counters enable row level security;
create policy "matricule_counters_all" on matricule_counters for all using (has_role(school_id, 'admin'));

-- Fonction : génère et réserve le prochain matricule pour une école
-- Format : <3 lettres du slug en majuscules>-<année>-<0001>
create or replace function generate_matricule(p_school_id uuid)
returns text
language plpgsql security definer as $$
declare
  v_slug text;
  v_year text;
  v_next integer;
begin
  select upper(left(slug, 3)) into v_slug from schools where id = p_school_id;
  v_year := to_char(now(), 'YYYY');

  insert into matricule_counters (school_id, next_value)
  values (p_school_id, 2)
  on conflict (school_id) do update set next_value = matricule_counters.next_value + 1
  returning next_value - 1 into v_next;

  return v_slug || '-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$$;
