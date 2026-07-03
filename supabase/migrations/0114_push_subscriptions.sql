-- ============================================================
-- SIR V2 — Migration 0114: push_subscriptions (Web Push API)
-- ============================================================
-- Guarda las subscripciones del browser para poder mandar push
-- notifications cuando el cron detecta que una relación empeoró.
--
-- Formato PushSubscription del W3C:
--   {
--     endpoint: URL absoluta del push service,
--     keys: { p256dh: base64url, auth: base64url }
--   }
--
-- El endpoint es único por device/browser. Al re-suscribirse (permission
-- cambió, etc.) puede cambiar → usamos endpoint como unique key para
-- upsert.
-- ============================================================

create table if not exists public.push_subscriptions (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null,
  endpoint      text not null,
  p256dh        text not null,
  auth          text not null,
  -- User-Agent al momento de suscribirse (para debug/gestión).
  ua            text,
  -- Etiqueta libre ("Chrome iPhone", "Firefox laptop").
  label         text,
  created_at    timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  -- Cuando el push service devuelve 410 (Gone), marcamos la sub como muerta.
  disabled_at   timestamptz
);

-- Drift-safe: si la tabla YA existía (creada por una versión anterior sin estas
-- columnas), el `create table if not exists` de arriba es no-op y el índice
-- parcial `where disabled_at is null` reventaría con "column does not exist".
-- Aseguramos cada columna opcional antes de indexar. Idempotente.
alter table public.push_subscriptions add column if not exists ua              text;
alter table public.push_subscriptions add column if not exists label           text;
alter table public.push_subscriptions add column if not exists last_success_at timestamptz;
alter table public.push_subscriptions add column if not exists last_failure_at timestamptz;
alter table public.push_subscriptions add column if not exists disabled_at     timestamptz;

-- Un endpoint = una subscripción (mismo device puede re-suscribirse).
create unique index if not exists push_subscriptions_endpoint_uniq
  on public.push_subscriptions (endpoint);

create index if not exists push_subscriptions_by_user
  on public.push_subscriptions (user_id) where disabled_at is null;

-- ─── RLS ────────────────────────────────────────────────────────────
alter table public.push_subscriptions enable row level security;

drop policy if exists "select own push_subscriptions" on public.push_subscriptions;
create policy "select own push_subscriptions"
  on public.push_subscriptions for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own push_subscriptions" on public.push_subscriptions;
create policy "insert own push_subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own push_subscriptions" on public.push_subscriptions;
create policy "update own push_subscriptions"
  on public.push_subscriptions for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "delete own push_subscriptions" on public.push_subscriptions;
create policy "delete own push_subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid()::text = user_id);
