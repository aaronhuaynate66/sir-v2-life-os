-- ============================================================
-- SIR V2 — Migration 0030: tabla self_diagnosis (Espacio personal / diagnóstico)
-- ============================================================
-- Espacio PRIVADO y editable para el diagnóstico personal del dueño de la app:
-- estado emocional, ansiedades, bloqueos, "lo que dejé de tolerar", "lo que
-- entiendo", visión de vida ideal, modelo del yo futuro, frases ancla/valores.
--
-- Es un SINGLETON por usuario: una fila por user_id (constraint unique). El
-- cliente genera un id único (`diag_<ts>`) la primera vez y lo reusa en cada
-- edición (upsert por id), igual que self_metrics/sleep_records. El sync engine
-- existente lo trata como un slice-array de 0 o 1 fila (ver adapters/self.ts).
--
-- Data PERSONAL SENSIBLE: vive solo bajo RLS por user_id (auth.uid() = user_id),
-- NO se envía a embeddings/IA, NO se expone fuera de /yo. Mismo aislamiento
-- que el resto de tablas (policies por user_id de 0001/0013).
--
-- Hueco de numeración: 0026-0029 quedan libres a propósito para la sesión que
-- trabaja Relaciones en paralelo (sus migraciones 0024/0025) y no colisionar.
--
-- ADITIVA, no-destructiva, idempotente. NO toca datos existentes.
--
-- ACCIÓN: se aplica vía el runner de migraciones (CI `supabase db push`) o,
-- mientras no esté activado, manualmente en el SQL Editor de Supabase. El
-- código cliente es tolerante: hasta que corras esto, el diagnóstico se guarda
-- localmente y se re-pushea al existir la tabla (mismo patrón que el resto).
-- ============================================================

-- ─── 1. Tabla ───────────────────────────────────────────────────────
create table if not exists public.self_diagnosis (
  id                  text primary key default gen_random_uuid()::text,
  user_id             text not null,
  -- Estado emocional actual (texto libre).
  emotional_state     text not null default '',
  -- Listas estructuradas (texto[]): ítems puntuales, editables como chips.
  anxieties           text[] not null default '{}',
  blocks              text[] not null default '{}',
  stopped_tolerating  text[] not null default '{}',
  understandings      text[] not null default '{}',
  anchors             text[] not null default '{}',
  -- Narrativas libres (texto largo).
  ideal_life_vision   text not null default '',
  future_self         text not null default '',
  updated_at          timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  -- Singleton: a lo sumo una fila por usuario.
  constraint self_diagnosis_user_unique unique (user_id)
);

-- ─── 2. RLS (privado por usuario) ───────────────────────────────────
alter table public.self_diagnosis enable row level security;

drop policy if exists "select own self_diagnosis" on public.self_diagnosis;
create policy "select own self_diagnosis"
  on public.self_diagnosis for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own self_diagnosis" on public.self_diagnosis;
create policy "insert own self_diagnosis"
  on public.self_diagnosis for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own self_diagnosis" on public.self_diagnosis;
create policy "update own self_diagnosis"
  on public.self_diagnosis for update
  using (auth.uid()::text = user_id);

drop policy if exists "delete own self_diagnosis" on public.self_diagnosis;
create policy "delete own self_diagnosis"
  on public.self_diagnosis for delete
  using (auth.uid()::text = user_id);

-- ─── 3. Realtime (sync en vivo cross-device, consistente con 0017/0018) ──
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'self_diagnosis'
  ) then
    execute 'alter publication supabase_realtime add table public.self_diagnosis';
  end if;
end $$;

-- REPLICA IDENTITY FULL: que el WAL incluya user_id en UPDATE/DELETE para que
-- Realtime evalúe la RLS y propague el evento al otro dispositivo (ver 0018).
alter table public.self_diagnosis replica identity full;

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- select table_name from information_schema.tables
--   where table_schema='public' and table_name='self_diagnosis';
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='self_diagnosis';
-- select tablename from pg_publication_tables
--   where pubname='supabase_realtime' and tablename='self_diagnosis';
-- ============================================================
