-- 0135 — Forecast conductual: señales diarias + resultados del forecast.
--
-- SEGUNDO horizonte (probabilístico) en paralelo al ciclo real. Aditivo: no toca
-- nada existente. `person_daily_signals` guarda el vector diario por léxico (§8);
-- `behavior_forecasts` guarda cada corrida del ensamble (§14.6-7). Las anclas
-- reusan `person_cycles` (no se duplica). RLS por dueño. Ver lib/forecast-conductual.

create table if not exists public.person_daily_signals (
  id           text primary key default gen_random_uuid()::text,
  user_id      uuid not null references auth.users(id) on delete cascade,
  person_id    text references public.people(id) on delete cascade,
  date         date not null,
  message_count int,
  avg_len      numeric,
  somatic      numeric,
  friction     numeric,
  withdrawal   numeric,
  sensitivity  numeric,
  actions      numeric,
  composite    numeric,
  updated_at   timestamptz not null default now(),
  unique (user_id, person_id, date)
);
create index if not exists person_daily_signals_idx on public.person_daily_signals (user_id, person_id, date);

alter table public.person_daily_signals enable row level security;
create policy "select own daily_signals" on public.person_daily_signals for select using (auth.uid() = user_id);
create policy "insert own daily_signals" on public.person_daily_signals for insert with check (auth.uid() = user_id);
create policy "update own daily_signals" on public.person_daily_signals for update using (auth.uid() = user_id);
create policy "delete own daily_signals" on public.person_daily_signals for delete using (auth.uid() = user_id);

create table if not exists public.behavior_forecasts (
  id                    text primary key default gen_random_uuid()::text,
  user_id               uuid not null references auth.users(id) on delete cascade,
  person_id             text references public.people(id) on delete cascade,
  run_at                timestamptz not null default now(),
  mode                  text,   -- exploratory | calibrated
  center_date           date,
  main_window_start     date,
  main_window_end       date,
  extended_window_start date,
  extended_window_end   date,
  period_days           int,
  confidence_label      text,
  confidence_score      numeric,
  dominant_models       text[],
  interpretation        text,
  result                jsonb not null default '{}'::jsonb, -- BehaviorForecast completo
  created_at            timestamptz not null default now()
);
create index if not exists behavior_forecasts_idx on public.behavior_forecasts (user_id, person_id, run_at desc);

alter table public.behavior_forecasts enable row level security;
create policy "select own behavior_forecasts" on public.behavior_forecasts for select using (auth.uid() = user_id);
create policy "insert own behavior_forecasts" on public.behavior_forecasts for insert with check (auth.uid() = user_id);
create policy "delete own behavior_forecasts" on public.behavior_forecasts for delete using (auth.uid() = user_id);

comment on table public.behavior_forecasts is
  'Corridas del forecast conductual (2º horizonte probabilístico). Ventana de PATRÓN, no período. Ético doc 17. Ver lib/forecast-conductual.';
