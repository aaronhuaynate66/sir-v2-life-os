-- 0129 — email_connections: conexión OAuth de correo (Microsoft Graph, Fase 2).
--
-- Guarda la conexión de correo de trabajo por OAuth: access/refresh token +
-- cuenta + el delta link de Graph para sync incremental. Una fila por cuenta.
-- Los tokens son sensibles → RLS por user_id (y el sync corre server-side).
--
-- El sync transforma cada correo nuevo en un batch del SIR Reader
-- (ingestReaderBatch), así reusa TODO el pipeline (persona por remitente, dedup
-- por hash, observación dm_conversation). Este es solo el estado de la conexión.

create table if not exists public.email_connections (
  id                text primary key default gen_random_uuid()::text,
  user_id           text not null,
  -- Proveedor. Hoy 'microsoft' (Graph). Campo libre hacia 'google' (Gmail API).
  provider          text not null default 'microsoft',
  -- Cuenta conectada (para mostrar y como author de los correos propios).
  account_email     text,
  -- Tokens OAuth. refresh_token permite renovar sin re-login.
  access_token      text,
  refresh_token     text,
  token_expires_at  timestamptz,
  -- Delta link de Graph: puntero al sync incremental (solo lo nuevo).
  delta_link        text,
  enabled           boolean not null default true,
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Una conexión por (usuario, proveedor): reconectar actualiza, no duplica.
create unique index if not exists email_connections_user_provider_idx
  on public.email_connections (user_id, provider);

alter table public.email_connections enable row level security;

drop policy if exists "select own email_connections" on public.email_connections;
create policy "select own email_connections"
  on public.email_connections for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own email_connections" on public.email_connections;
create policy "insert own email_connections"
  on public.email_connections for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own email_connections" on public.email_connections;
create policy "update own email_connections"
  on public.email_connections for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "delete own email_connections" on public.email_connections;
create policy "delete own email_connections"
  on public.email_connections for delete
  using (auth.uid()::text = user_id);
