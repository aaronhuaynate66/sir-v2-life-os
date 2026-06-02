-- ============================================================
-- SIR V2 — Migration 0046: tabla calendar_connections (Calendario v2, Fase 1)
-- ============================================================
-- Hasta hoy el calendario se conectaba por UNA env var (OUTLOOK_ICS_URL):
-- solo-lectura, un único calendario, server-only. Esta tabla habilita que el
-- usuario conecte VARIOS calendarios desde la UI (ej. "Trabajo" Outlook +
-- "Personal" Gmail), cada uno con su URL .ics, label y color.
--
-- Modelo a prueba de futuro: la columna `provider` hoy es siempre 'ics', pero
-- queda abierta para 'google'/'outlook' (OAuth, Fase 2 — ver docs/CALENDAR_V2_OAUTH.md).
-- Las columnas access_token / refresh_token / account_email / token_expires_at
-- son PLACEHOLDERS para ese login bidireccional futuro: hoy quedan NULL y NADA
-- las escribe. NO se implementa OAuth en esta migración.
--
-- DATO SENSIBLE: `ics_url` lleva un TOKEN PRIVADO del feed del calendario. Vive
-- solo bajo RLS por user_id (auth.uid()::text = user_id), igual que el resto de
-- tablas del proyecto. NUNCA se loguea (ni en API ni en Sentry). El reader
-- (lib/calendar/feed.ts) la lee server-side; el cliente solo ve el feed parseado.
-- Por eso NO se agrega a la publicación realtime (no queremos el token en el WAL),
-- a diferencia de tablas no-sensibles como self_diagnosis (0030).
--
-- ADITIVA, no-destructiva, idempotente. NO toca datos existentes. El fallback a
-- OUTLOOK_ICS_URL se mantiene en código: si esta tabla no existe (migración sin
-- correr) o no hay conexiones, el reader sigue leyendo la env var. No rompe nada.
--
-- ACCIÓN: se aplica vía el runner de migraciones (CI `supabase db push`) o, si el
-- runner aún no está activado, manualmente en el SQL Editor de Supabase.
-- ============================================================

-- ─── 1. Tabla ───────────────────────────────────────────────────────
create table if not exists public.calendar_connections (
  id                text primary key default gen_random_uuid()::text,
  user_id           text not null,
  -- Etiqueta humana del calendario (ej. "Trabajo", "Personal").
  label             text not null default 'Calendario',
  -- Proveedor de la conexión. HOY siempre 'ics'. Abierto a 'google'/'outlook'
  -- cuando llegue OAuth (Fase 2). NO se valida con enum a propósito: campo libre
  -- hacia adelante.
  provider          text not null default 'ics',
  -- URL del feed .ics (lleva token privado). Nullable: una conexión OAuth futura
  -- no tendría .ics sino tokens.
  ics_url           text,
  -- Color para distinguir el calendario en la UI (hex, ej. '#7c5cff').
  color             text,
  enabled           boolean not null default true,
  -- ── Placeholders OAuth (Fase 2) — hoy NULL, nada los escribe ──────
  access_token      text,
  refresh_token     text,
  account_email     text,
  token_expires_at  timestamptz,
  -- ──────────────────────────────────────────────────────────────────
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Índice para el reader: trae las conexiones habilitadas de un usuario.
create index if not exists calendar_connections_user_enabled_idx
  on public.calendar_connections (user_id, enabled);

-- ─── 2. RLS (privado por usuario) ───────────────────────────────────
alter table public.calendar_connections enable row level security;

drop policy if exists "select own calendar_connections" on public.calendar_connections;
create policy "select own calendar_connections"
  on public.calendar_connections for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own calendar_connections" on public.calendar_connections;
create policy "insert own calendar_connections"
  on public.calendar_connections for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own calendar_connections" on public.calendar_connections;
create policy "update own calendar_connections"
  on public.calendar_connections for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "delete own calendar_connections" on public.calendar_connections;
create policy "delete own calendar_connections"
  on public.calendar_connections for delete
  using (auth.uid()::text = user_id);

-- ============================================================
-- Verificación post-aplicación (pegar en SQL Editor):
-- ============================================================
-- select table_name from information_schema.tables
--   where table_schema='public' and table_name='calendar_connections';
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='calendar_connections';
-- select column_name, data_type, is_nullable from information_schema.columns
--   where table_name='calendar_connections' order by ordinal_position;
-- ============================================================
