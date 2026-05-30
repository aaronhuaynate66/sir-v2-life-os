-- ============================================================
-- SIR V2 — Migration 0013: tabla person_logs (Sesion 6)
-- ============================================================
-- Almacenamiento Supabase-native para "Registro rapido" (#5 backlog
-- detail page V1) + "Registrar interaccion" (#14). Una sola tabla con
-- discriminator `kind` para que ambas features compartan storage,
-- query path y RLS — y para que la data sea queryable para correlacion
-- (fase lunar / ciclo / engagement) en Fase 3c.
--
-- Diseño consciente: NO se usa relationships.history (Zustand-backed)
-- para no extender el split-brain localStorage<->Supabase. person_logs
-- es Supabase-only, mismo patron que `memories` y `observations`.
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
-- (Mismo flujo que 0001-0012.)
-- ============================================================

-- ─── 1. Tabla ───────────────────────────────────────────────────────
create table if not exists public.person_logs (
  id          text primary key default gen_random_uuid()::text,
  user_id     text not null,
  person_id   text not null references public.people(id) on delete cascade,
  kind        text not null check (kind in ('mood', 'energy', 'sleep', 'pain', 'interaction')),
  value       int not null check (value between 1 and 5),
  note        text,
  logged_at   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- ─── 2. Indice (user_id, person_id, logged_at DESC) ─────────────────
-- Soporta la query principal del detail page: "ultimos N logs de esta
-- persona". El sort DESC permite scan secuencial in-order sin sort
-- extra. Para queries por kind (analitica de Fase 3c), el filtro post-
-- index es trivial; agregar indice por kind si surge la necesidad.
create index if not exists idx_person_logs_user_person_time
  on public.person_logs(user_id, person_id, logged_at desc);

-- ─── 3. RLS ─────────────────────────────────────────────────────────
alter table public.person_logs enable row level security;

drop policy if exists "select own person_logs" on public.person_logs;
create policy "select own person_logs"
  on public.person_logs for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own person_logs" on public.person_logs;
create policy "insert own person_logs"
  on public.person_logs for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own person_logs" on public.person_logs;
create policy "update own person_logs"
  on public.person_logs for update
  using (auth.uid()::text = user_id);

drop policy if exists "delete own person_logs" on public.person_logs;
create policy "delete own person_logs"
  on public.person_logs for delete
  using (auth.uid()::text = user_id);

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- -- 1. tabla creada:
-- select table_name from information_schema.tables
-- where table_schema = 'public' and table_name = 'person_logs';
--
-- -- 2. RLS habilitada:
-- select tablename, rowsecurity from pg_tables
-- where schemaname = 'public' and tablename = 'person_logs';
--
-- -- 3. policies (4 esperadas):
-- select policyname from pg_policies
-- where schemaname = 'public' and tablename = 'person_logs'
-- order by policyname;
--
-- -- 4. indice:
-- select indexname from pg_indexes
-- where schemaname = 'public' and tablename = 'person_logs';
--
-- -- 5. dry-run insert (reemplazar <person_id> por un id real del user):
-- insert into public.person_logs (user_id, person_id, kind, value, note)
-- values (auth.uid()::text, '<person_id>', 'mood', 4, 'diag 0013');
-- select * from public.person_logs where note = 'diag 0013';
-- delete from public.person_logs where note = 'diag 0013';
