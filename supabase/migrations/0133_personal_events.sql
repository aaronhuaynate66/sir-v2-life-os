-- 0133 — Agenda personal de Aaron (eventos/planes propios).
--
-- CONTEXTO. El calendario conectado ("HNG") es LABORAL y de solo lectura (feed
-- .ics): SIR no puede escribir ahí, y volcarlo sobre la línea del ciclo de una
-- persona mezcla "mi trabajo" con "el ritmo de ella". Esta tabla es la AGENDA
-- PERSONAL nativa de SIR: planes propios (una cena, un viaje, un plan con
-- alguien) que SIR SÍ puede escribir y editar, separada del calendario de
-- trabajo. Es la "capa personal" que alimenta el Horizonte del ciclo — y el
-- enganche para, más adelante, sumar un calendario PERSONAL conectado (Camino B)
-- a la MISMA capa (columna `source` lo distingue: 'sir' | 'manual' | 'calendar').
--
-- `person_id` (nullable) liga el plan a una persona (ej. una cena con Diana) para
-- que caiga en SU línea del ciclo; los planes sin persona son agenda general.
-- date-only (TZ Lima, sin shift UTC). Aditiva, idempotente, RLS por dueño.

create table if not exists public.personal_events (
  id          text primary key default gen_random_uuid()::text,
  user_id     uuid not null references auth.users(id) on delete cascade,
  person_id   text references public.people(id) on delete set null, -- plan con alguien (opcional)
  title       text not null,
  event_date  date not null,                       -- inicio (YYYY-MM-DD, TZ Lima)
  end_date    date,                                -- fin, para planes de varios días (opcional)
  all_day     boolean not null default true,       -- los planes personales suelen ser por día
  note        text,                                -- detalle libre (opcional)
  source      text not null default 'sir',         -- 'sir' | 'manual' | 'calendar' (Camino B)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists personal_events_user_date_idx on public.personal_events (user_id, event_date);
create index if not exists personal_events_person_idx on public.personal_events (person_id, event_date);

alter table public.personal_events enable row level security;
create policy "select own personal_events" on public.personal_events for select using (auth.uid() = user_id);
create policy "insert own personal_events" on public.personal_events for insert with check (auth.uid() = user_id);
create policy "update own personal_events" on public.personal_events for update using (auth.uid() = user_id);
create policy "delete own personal_events" on public.personal_events for delete using (auth.uid() = user_id);

comment on table public.personal_events is
  'Agenda personal nativa de SIR: planes propios (escribibles por SIR), separada del calendario laboral. Alimenta la capa personal del Horizonte del ciclo. source distingue el origen (sir/manual/calendar) para sumar un calendario personal conectado más adelante.';
