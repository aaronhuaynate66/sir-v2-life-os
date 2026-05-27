-- ============================================================
-- SIR V2 — Migration 0002: id uuid → text (Sesión 20c)
-- ============================================================
-- Contexto: los componentes generan IDs no-UUID como
-- 'm_${Date.now()}', 'sig_${Date.now()}', etc. El schema 0001 declaró
-- id como uuid con default uuid_generate_v4(). Para evitar tocar
-- componentes (restricción de sesión 20c), cambiamos id a text en
-- tablas de dominio. user_id sigue siendo uuid (FK a auth.users).
--
-- Seguro de aplicar: las tablas de dominio están vacías en este
-- punto (la migración de datos existentes localStorage→DB es 20d).
--
-- Aplicar via Supabase Dashboard → SQL Editor → Run.
-- ============================================================

-- ─── Drop RLS policies y FKs que dependen de columnas id ─────
-- relationships.person_id apunta a people.id; hay que dropear la FK
-- antes de alterar people.id.
alter table public.relationships drop constraint if exists relationships_person_id_fkey;

-- ─── self_metrics ───────────────────────────────────────────
alter table public.self_metrics
  alter column id drop default,
  alter column id type text using id::text;

-- ─── health_metrics ─────────────────────────────────────────
alter table public.health_metrics
  alter column id drop default,
  alter column id type text using id::text;

-- ─── sleep_records ──────────────────────────────────────────
alter table public.sleep_records
  alter column id drop default,
  alter column id type text using id::text;

-- ─── finance_movements ──────────────────────────────────────
alter table public.finance_movements
  alter column id drop default,
  alter column id type text using id::text;

-- ─── goals ──────────────────────────────────────────────────
alter table public.goals
  alter column id drop default,
  alter column id type text using id::text;

-- ─── signals ────────────────────────────────────────────────
alter table public.signals
  alter column id drop default,
  alter column id type text using id::text;

-- ─── people ─────────────────────────────────────────────────
alter table public.people
  alter column id drop default,
  alter column id type text using id::text;

-- ─── relationships ──────────────────────────────────────────
alter table public.relationships
  alter column id drop default,
  alter column id type text using id::text,
  alter column person_id type text using person_id::text;

-- Recrear FK con tipo text
alter table public.relationships
  add constraint relationships_person_id_fkey
  foreign key (person_id) references public.people(id) on delete cascade;

-- ─── memories ───────────────────────────────────────────────
alter table public.memories
  alter column id drop default,
  alter column id type text using id::text;

-- ─── snapshots ──────────────────────────────────────────────
-- snapshots queda en schema por compatibilidad futura aunque
-- useSnapshotStore se mantiene client-only en sesión 20c.
alter table public.snapshots
  alter column id drop default,
  alter column id type text using id::text;
