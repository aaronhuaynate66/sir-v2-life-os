-- ============================================================
-- SIR V2 — Migration 0113: person_status_snapshots + person_status_alerts
-- ============================================================
-- G3: detectar cuando el label del panel Estado empeora (ej. de "estable" a
-- "en_tension") y avisar a Aaron. Hoy Aaron solo se entera cuando abre la
-- ficha; con esto SIR lo dispara proactivamente en /panel.
--
-- Modelo:
--   - person_status_snapshots: 1 row por (user, persona, día). Guarda el
--     label calculado ese día. El cron corre 1x al día y agrega uno nuevo.
--   - person_status_alerts: 1 row cada vez que se detecta empeoramiento
--     (rank del label sube). Aaron marca seen/dismissed desde la UI.
-- ============================================================

-- ─── snapshots ──────────────────────────────────────────────────────
create table if not exists public.person_status_snapshots (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null,
  person_id     text not null references public.people(id) on delete cascade,
  -- Label calculado ese día ('cerca'|'estable'|'distante'|'en_tension'|'sin_data').
  label         text not null,
  -- Fecha del snapshot (typical: la que corre el cron). date-only para dedupe.
  snapshot_date date not null default (now() at time zone 'America/Lima')::date,
  created_at    timestamptz not null default now()
);

create unique index if not exists person_status_snapshots_uniq
  on public.person_status_snapshots (user_id, person_id, snapshot_date);

create index if not exists person_status_snapshots_by_person
  on public.person_status_snapshots (user_id, person_id, snapshot_date desc);

-- ─── alerts ────────────────────────────────────────────────────────
create table if not exists public.person_status_alerts (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null,
  person_id     text not null references public.people(id) on delete cascade,
  -- Label anterior (el bueno) y actual (el malo).
  from_label    text not null,
  to_label      text not null,
  -- Prosa corta ("Diana pasó de estable a en_tension: 2 pendientes vencidos").
  message       text not null,
  created_at    timestamptz not null default now(),
  seen_at       timestamptz,
  dismissed_at  timestamptz
);

create index if not exists person_status_alerts_active
  on public.person_status_alerts (user_id, created_at desc)
  where dismissed_at is null;

-- ─── RLS ────────────────────────────────────────────────────────────
alter table public.person_status_snapshots enable row level security;
alter table public.person_status_alerts enable row level security;

drop policy if exists "select own person_status_snapshots" on public.person_status_snapshots;
create policy "select own person_status_snapshots"
  on public.person_status_snapshots for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own person_status_snapshots" on public.person_status_snapshots;
create policy "insert own person_status_snapshots"
  on public.person_status_snapshots for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "select own person_status_alerts" on public.person_status_alerts;
create policy "select own person_status_alerts"
  on public.person_status_alerts for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own person_status_alerts" on public.person_status_alerts;
create policy "insert own person_status_alerts"
  on public.person_status_alerts for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own person_status_alerts" on public.person_status_alerts;
create policy "update own person_status_alerts"
  on public.person_status_alerts for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);
