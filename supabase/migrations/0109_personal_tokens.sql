-- ============================================================
-- SIR V2 — Migration 0109: personal_tokens (API Personal Access Tokens)
-- ============================================================
-- Módulo "Claude → SIR ingest" Fase 1.
--
-- Habilita que Aaron genere tokens desde /yo, los pegue a un cliente
-- externo (Claude Code, un script, curl…) y ese cliente hable con la
-- API como si fuera él. Mismo modelo que los Personal Access Tokens
-- de GitHub/GitLab.
--
-- Storage: solo el HASH SHA-256 del token vive en DB. El valor plano
-- se muestra UNA vez al crearlo (después es irrecuperable — igual que
-- un PAT de GitHub). `token_prefix` guarda los primeros 8-10 caracteres
-- del token en claro para poder mostrarlo en el listado ("sirp_9x2K…")
-- sin exponer el secret.
--
-- Auth: RLS por user_id — sólo el dueño ve sus tokens desde la UI. Los
-- endpoints de escritura (revocar) también validan por user_id. La
-- resolución del bearer se hace server-side con service_role LOOK-UP
-- por token_hash (ver src/lib/auth/tokens.ts).
--
-- Scopes: por ahora un JSONB abierto. La primera versión ignora scopes
-- (todo o nada) — cuando queramos scopes granulares (read-only,
-- moments-only, etc.) los interpretamos desde acá sin cambiar el schema.
--
-- ADITIVA, no-destructiva, idempotente. Se aplica vía runner de migraciones.
-- ============================================================

-- ─── 1. Tabla ────────────────────────────────────────────────────────
create table if not exists public.personal_tokens (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null,
  -- Etiqueta humana ("Claude Code · Aaron", "Script backup", etc.).
  label         text not null default 'Token',
  -- Primeros ~10 chars del token en claro (ej. "sirp_9x2K"). Se muestra en
  -- la lista; el resto queda solo como hash.
  token_prefix  text not null,
  -- SHA-256 hex del token completo. Único global — evita colisiones.
  token_hash    text not null unique,
  -- Placeholder para scopes granulares futuros. Hoy ignorado → todo o nada.
  scopes        jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  -- Revocación soft: seteás revoked_at y el token deja de autenticar. NO
  -- se borra la row (auditoría / no reusar el hash).
  revoked_at    timestamptz
);

-- Índices: lookup por (user_id) para la UI, y por (token_hash) para el
-- auth middleware (esa query corre en cada request bearer-auth).
create index if not exists personal_tokens_user_idx
  on public.personal_tokens (user_id) where revoked_at is null;
create index if not exists personal_tokens_hash_idx
  on public.personal_tokens (token_hash) where revoked_at is null;

-- ─── 2. RLS ──────────────────────────────────────────────────────────
alter table public.personal_tokens enable row level security;

drop policy if exists "select own personal_tokens" on public.personal_tokens;
create policy "select own personal_tokens"
  on public.personal_tokens for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own personal_tokens" on public.personal_tokens;
create policy "insert own personal_tokens"
  on public.personal_tokens for insert
  with check (auth.uid()::text = user_id);

-- Update (revocación) desde UI: sólo el dueño. El auth middleware que
-- actualiza last_used_at usa service_role, así que no depende de RLS.
drop policy if exists "update own personal_tokens" on public.personal_tokens;
create policy "update own personal_tokens"
  on public.personal_tokens for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "delete own personal_tokens" on public.personal_tokens;
create policy "delete own personal_tokens"
  on public.personal_tokens for delete
  using (auth.uid()::text = user_id);

-- ============================================================
-- Verificación post-aplicación (SQL Editor):
-- ============================================================
-- select table_name from information_schema.tables
--   where table_schema='public' and table_name='personal_tokens';
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='personal_tokens';
-- select column_name, data_type, is_nullable from information_schema.columns
--   where table_name='personal_tokens' order by ordinal_position;
-- ============================================================
