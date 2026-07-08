-- 0136 — Feedback del forecast conductual (Fase 2 del spec: recalibración).
--
-- Aaron registra QUÉ PASÓ en una ventana proyectada → mejora el modelo. El lever
-- fuerte: si confirma una fecha de período/PMS, el endpoint la vuelve ANCLA
-- (person_cycles) y el próximo forecast pasa a calibrado. Además se computa el
-- hit-rate por persona (validado con historial). Ético (doc 17): un evento
-- externo se marca como RUIDO, no como evidencia biológica. RLS por dueño.

create table if not exists public.forecast_feedback (
  id            text primary key default gen_random_uuid()::text,
  user_id       uuid not null references auth.users(id) on delete cascade,
  person_id     text references public.people(id) on delete cascade,
  forecast_id   text references public.behavior_forecasts(id) on delete set null,
  window_center date,                 -- centro de la ventana a la que refiere
  event_date    date,                 -- cuándo pasó (opcional)
  categories    text[] not null default '{}', -- periodo/pms/dolor/medicacion/conflicto/distancia/evento_externo/no_paso_nada
  label         text,                 -- hit | partial | miss | noise (derivado)
  intensity     int,                  -- 1..5
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists forecast_feedback_idx on public.forecast_feedback (user_id, person_id, created_at desc);

alter table public.forecast_feedback enable row level security;
create policy "select own forecast_feedback" on public.forecast_feedback for select using (auth.uid() = user_id);
create policy "insert own forecast_feedback" on public.forecast_feedback for insert with check (auth.uid() = user_id);
create policy "delete own forecast_feedback" on public.forecast_feedback for delete using (auth.uid() = user_id);
