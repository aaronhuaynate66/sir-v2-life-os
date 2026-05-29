-- ============================================================
-- SIR V2 — Migration 0006: convertir id de uuid a text en 8 tablas
-- ============================================================
-- Contexto:
--   Migration 0002_text_ids.sql cambio id de uuid -> text en TODAS las
--   tablas de dominio para soportar IDs no-UUID generados client-side
--   (mem_*, sig_*, cap_*__*, etc.). Diagnostico del 28/05/2026 detecto
--   que 0002 SOLO se aplico a sleep_records y finance_movements en la
--   instancia de produccion; las otras 8 tablas siguieron con id=uuid.
--
--   Sintoma: el flujo de Captura bascula (PR #79) hace bulk upsert con
--   IDs tipo "cap_1780012107__weight_kg". PostgREST devolvio HTTP 400
--   con codigo 22P02 ("invalid input syntax for type uuid") y pushWithRetry
--   reintento 3 veces sin exito, dejando las metricas solo en localStorage.
--
-- Esta migration completa lo que 0002 no termino, sobre las 8 tablas
-- restantes:
--   memories, self_metrics, health_metrics, signals, goals, people,
--   relationships, snapshots
--
-- Riesgo: minimo. Las 10 tablas de dominio estan en 0 rows totales
-- (cleanup + nada nuevo insertado desde la falla). El ALTER es
-- instantaneo sobre tablas vacias.
--
-- profiles.id NO se convierte: es FK a auth.users.id que es uuid nativo
-- de Supabase Auth.
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
-- (Mismo flujo que 0001-0005. NO se aplica via CI.)
-- ============================================================

-- ─── 1. Drop FK que depende de people.id antes del ALTER ────────────
alter table public.relationships
  drop constraint if exists relationships_person_id_fkey;

-- ─── 2. ALTER id uuid -> text en cada tabla outlier ─────────────────
alter table public.memories
  alter column id drop default,
  alter column id type text using id::text;

alter table public.self_metrics
  alter column id drop default,
  alter column id type text using id::text;

alter table public.health_metrics
  alter column id drop default,
  alter column id type text using id::text;

alter table public.signals
  alter column id drop default,
  alter column id type text using id::text;

alter table public.goals
  alter column id drop default,
  alter column id type text using id::text;

alter table public.people
  alter column id drop default,
  alter column id type text using id::text;

-- relationships: id + person_id (FK) ambos a text
alter table public.relationships
  alter column id drop default,
  alter column id type text using id::text,
  alter column person_id type text using person_id::text;

alter table public.snapshots
  alter column id drop default,
  alter column id type text using id::text;

-- ─── 3. Recrear FK relationships.person_id -> people.id (ambos text) ─
alter table public.relationships
  add constraint relationships_person_id_fkey
  foreign key (person_id) references public.people(id) on delete cascade;

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- -- 1. confirmar tipos: deberian retornar 'text' las 8 tablas + uuid las 2 ya correctas + uuid auth.users
-- select table_name, column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and column_name = 'id'
--   and table_name in (
--     'memories','self_metrics','health_metrics','sleep_records',
--     'finance_movements','signals','goals','people','relationships','snapshots'
--   )
-- order by table_name;
--
-- -- 2. confirmar que el FK person_id -> people.id existe
-- select conname, conrelid::regclass, confrelid::regclass
-- from pg_constraint
-- where conname = 'relationships_person_id_fkey';
--
-- -- 3. probe insert que antes fallaba (debe retornar 201, despues borrar):
-- insert into public.health_metrics(id, user_id, type, value, unit, measured_at)
-- values ('diag_post_0006', auth.uid(), 'bmi', 25.5, '', now());
-- delete from public.health_metrics where id = 'diag_post_0006';
