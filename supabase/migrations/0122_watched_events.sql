-- ============================================================
-- SIR V2 — Migration 0122: watched_events (18·M3 — "Eventos que sigo")
-- ============================================================
-- Señales externas, camino MANUAL y honesto (docs/18): en vez de scrapear el
-- mundo (ruido, ToS), Aaron declara los eventos externos que le importan (el
-- Mundial, una elección, un deadline de la red, un lanzamiento) con su fecha, qué
-- NODO tuyo tocan (finanzas / objetivo / persona / salud / general) y el impacto
-- esperado. SIR los cruza con tu horizonte y tu estado. Vos elegís qué mundo
-- mirar → cero scroll infinito.
--
-- `node` = con qué se cruza; `related_id` opcional (id de goal/persona si aplica).
--
-- NO aplicar a mano si el runner de migraciones (CI `supabase db push`) está
-- activo. Si no, aplicar en Supabase Dashboard -> SQL Editor -> Run.
-- ============================================================

-- ─── 1. Tabla ───────────────────────────────────────────────────────
create table if not exists public.watched_events (
  id           text primary key default gen_random_uuid()::text,
  user_id      text not null,
  title        text not null,
  event_date   date not null,
  -- Nodo tuyo que toca: finanzas | objetivo | persona | salud | general.
  node         text not null default 'general',
  -- Id del goal/persona relacionado (opcional, según node).
  related_id   text,
  impact       text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_watched_events_user_date
  on public.watched_events(user_id, event_date);

-- ─── 2. RLS (owner-only, mismo patrón que reminders/0115) ───────────
alter table public.watched_events enable row level security;

drop policy if exists "select own watched_events" on public.watched_events;
create policy "select own watched_events"
  on public.watched_events for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own watched_events" on public.watched_events;
create policy "insert own watched_events"
  on public.watched_events for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own watched_events" on public.watched_events;
create policy "update own watched_events"
  on public.watched_events for update
  using (auth.uid()::text = user_id);

drop policy if exists "delete own watched_events" on public.watched_events;
create policy "delete own watched_events"
  on public.watched_events for delete
  using (auth.uid()::text = user_id);

-- ============================================================
-- Verificación (pegar en SQL Editor):
-- ============================================================
-- select tablename, rowsecurity from pg_tables
-- where schemaname = 'public' and tablename = 'watched_events';
-- select policyname from pg_policies
-- where schemaname = 'public' and tablename = 'watched_events' order by policyname;
