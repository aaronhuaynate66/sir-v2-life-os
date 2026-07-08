-- 0137 — Calendario personal vs laboral (Camino B del ciclo).
--
-- Distingue calendarios LABORALES (HNG) de PERSONALES. Solo los personales
-- alimentan la línea del ciclo de una persona (vía calendarHorizon, filtrados a
-- los eventos que la mencionan) — para NUNCA volcar reuniones de trabajo sobre el
-- ciclo de alguien. Default 'work' (conservador: no filtra nada al ciclo hasta
-- que Aaron marque un calendario como personal). Aditiva, idempotente.

alter table public.calendar_connections
  add column if not exists kind text not null default 'work'
  check (kind in ('work', 'personal'));

comment on column public.calendar_connections.kind is
  'work | personal. Solo los personales alimentan la línea del ciclo (Camino B). Default work = seguro (no leakea reuniones laborales al ciclo).';
