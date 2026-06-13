-- ============================================================
-- SIR V2 — Migration 0071: suscripciones Web Push (PWA notifications)
-- ============================================================
-- Guarda la suscripción push del navegador/PWA del usuario (endpoint + claves
-- p256dh/auth). El server envía push con web-push usando estas filas + VAPID.
-- Una suscripción por (user, endpoint). ADITIVA + idempotente.
-- ============================================================

create table if not exists public.push_subscriptions (
  id          text primary key default gen_random_uuid()::text,
  user_id     text not null,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create unique index if not exists uq_push_subscriptions_user_endpoint
  on public.push_subscriptions(user_id, endpoint);

alter table public.push_subscriptions enable row level security;

drop policy if exists "select own push_subscriptions" on public.push_subscriptions;
create policy "select own push_subscriptions"
  on public.push_subscriptions for select using (auth.uid()::text = user_id);

drop policy if exists "insert own push_subscriptions" on public.push_subscriptions;
create policy "insert own push_subscriptions"
  on public.push_subscriptions for insert with check (auth.uid()::text = user_id);

drop policy if exists "update own push_subscriptions" on public.push_subscriptions;
create policy "update own push_subscriptions"
  on public.push_subscriptions for update using (auth.uid()::text = user_id);

drop policy if exists "delete own push_subscriptions" on public.push_subscriptions;
create policy "delete own push_subscriptions"
  on public.push_subscriptions for delete using (auth.uid()::text = user_id);
