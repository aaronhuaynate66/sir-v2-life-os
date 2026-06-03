-- ============================================================
-- SIR V2 — Migration 0055: tabla identity_profile (Anclas de identidad / perfil propio)
-- ============================================================
-- Datos básicos de identidad del dueño de la app (sección "Yo"), base del motor
-- proactivo: nombre completo, fecha de nacimiento (→ edad), roles/ocupación
-- (multi-tag), ubicación y sus propias fechas importantes recurrentes.
--
-- Es un SINGLETON por usuario: una fila por user_id (constraint unique). El
-- cliente genera un id único (`idn_<ts>`) la primera vez y lo reusa en cada
-- edición (upsert por id), igual que self_diagnosis. El sync engine existente
-- lo trata como un slice-array de 0 o 1 fila (ver adapters/self.ts + useSelfStore).
--
-- `special_dates` es jsonb con el MISMO shape que people.special_dates
-- (migration 0010): [{ id, label, date 'YYYY-MM-DD', recurring }]. Se renderiza
-- con las utilidades de lib/dates/specialDates.ts.
--
-- Aislamiento por RLS (auth.uid()::text = user_id), mismo patrón que el resto
-- de tablas Camino A. Sync en vivo cross-device vía publicación supabase_realtime
-- + REPLICA IDENTITY FULL (consistente con 0017/0018/0030).
--
-- Hueco de numeración: 0053-0054 quedan libres a propósito para la sesión que
-- trabaja Relaciones/vínculos familiares en paralelo (su migración 0052) y no
-- colisionar.
--
-- ADITIVA, no-destructiva, idempotente. NO toca datos existentes. El código
-- cliente es tolerante: hasta correr esto, el perfil se guarda localmente y se
-- re-pushea al existir la tabla (mismo patrón que el resto).
-- ============================================================

-- ─── 1. Tabla ───────────────────────────────────────────────────────
create table if not exists public.identity_profile (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null,
  -- Nombre completo (texto libre).
  full_name     text not null default '',
  -- Fecha de nacimiento date-only (nullable: puede no estar seteada aún).
  birth_date    date,
  -- Roles / ocupación como tags (ej. "Bombero", "Fundador de Marlab").
  roles         text[] not null default '{}',
  -- Ubicación (texto libre, ej. "Lima, Perú").
  location      text not null default '',
  -- Fechas importantes propias (mismo shape que people.special_dates).
  special_dates jsonb not null default '[]'::jsonb,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  -- Singleton: a lo sumo una fila por usuario.
  constraint identity_profile_user_unique unique (user_id)
);

-- ─── 2. RLS (privado por usuario) ───────────────────────────────────
alter table public.identity_profile enable row level security;

drop policy if exists "select own identity_profile" on public.identity_profile;
create policy "select own identity_profile"
  on public.identity_profile for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own identity_profile" on public.identity_profile;
create policy "insert own identity_profile"
  on public.identity_profile for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own identity_profile" on public.identity_profile;
create policy "update own identity_profile"
  on public.identity_profile for update
  using (auth.uid()::text = user_id);

drop policy if exists "delete own identity_profile" on public.identity_profile;
create policy "delete own identity_profile"
  on public.identity_profile for delete
  using (auth.uid()::text = user_id);

-- ─── 3. Realtime (sync en vivo cross-device, consistente con 0017/0018/0030) ──
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'identity_profile'
  ) then
    execute 'alter publication supabase_realtime add table public.identity_profile';
  end if;
end $$;

-- REPLICA IDENTITY FULL: que el WAL incluya user_id en UPDATE/DELETE para que
-- Realtime evalúe la RLS y propague el evento al otro dispositivo (ver 0018).
alter table public.identity_profile replica identity full;

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- select table_name from information_schema.tables
--   where table_schema='public' and table_name='identity_profile';
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='identity_profile';
-- select tablename from pg_publication_tables
--   where pubname='supabase_realtime' and tablename='identity_profile';
-- ============================================================
