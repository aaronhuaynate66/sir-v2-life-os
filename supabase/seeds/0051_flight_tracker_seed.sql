-- SIR V2 — SEED del caso real: tracker del precio del vuelo Lima→Dammam.
--
-- NO es una migración de schema (no se corre en CI). Es un seed de DATA del
-- usuario: créa el tracker en la TAREA "Comprar pasaje a Dammam" del objetivo
-- "Ganar el Mundial de Bomberos" y lo siembra con el punto 5075 @ 2026-06-03
-- (y el previo 5566 como referencia, para que la tendencia muestre la baja).
--
-- POR QUÉ SQL Y NO CÓDIGO: los trackers son local-first (localStorage → sync a
-- Supabase). El id de la tarea y el user_id son data real de Aaron que no puedo
-- resolver sin sus credenciales. Insertando directo en Supabase, el cliente lo
-- pulea como fuente de verdad y aparece solo en la UI (/seguimiento + resumen
-- en la tarea). Idempotente (ids fijos + ON CONFLICT DO NOTHING) y SEGURO: si no
-- encuentra el objetivo/tarea por título, NO inserta nada (no-op).
--
-- CÓMO CORRERLO: pegar en el SQL Editor de Supabase (requiere 0051 ya aplicada).
-- Si tus títulos difieren, ajustá los patrones ILIKE de abajo. Verificá al final.

-- 1) Tracker, enganchado a la TAREA "…Dammam…" del objetivo "…Mundial de Bomberos…".
insert into public.trackers
  (id, user_id, objective_id, objective_step_id, label, unit,
   condition_kind, condition_value, cadence_days, created_at)
select
  'tk_flight_dammam', g.user_id, g.id, st.id,
  'Precio vuelo Lima→Dammam (ida/vuelta)', 'PEN',
  'lte', 4500, 7, now()
from public.goals g
join public.objective_steps st
  on st.objective_id = g.id
 and st.user_id = g.user_id
 and st.title ilike '%Dammam%'
where g.title ilike '%Mundial de Bomberos%'
order by st.created_at
limit 1
on conflict (id) do nothing;

-- 1-bis) FALLBACK (descomentar SÓLO si la tarea aún no existe): enganchar al
-- OBJETIVO en vez de a la tarea. Igual de idempotente.
-- insert into public.trackers
--   (id, user_id, objective_id, label, unit, condition_kind, condition_value, cadence_days, created_at)
-- select 'tk_flight_dammam', g.user_id, g.id,
--        'Precio vuelo Lima→Dammam (ida/vuelta)', 'PEN', 'lte', 4500, 7, now()
-- from public.goals g
-- where g.title ilike '%Mundial de Bomberos%'
-- order by g.created_at
-- limit 1
-- on conflict (id) do nothing;

-- 2) Punto previo (referencia): 5566. Fecha aproximada para mostrar la baja.
insert into public.tracker_points
  (id, user_id, tracker_id, value, date, source, note, created_at)
select 'tp_flight_dammam_prev', t.user_id, t.id, 5566, date '2026-05-27',
       'manual_text', 'Precio previo (referencia)', now()
from public.trackers t
where t.id = 'tk_flight_dammam'
on conflict (id) do nothing;

-- 3) Punto seed: 5075 @ 2026-06-03.
insert into public.tracker_points
  (id, user_id, tracker_id, value, date, source, note, created_at)
select 'tp_flight_dammam_seed', t.user_id, t.id, 5075, date '2026-06-03',
       'manual_text', 'Lectura inicial (Google Flights)', now()
from public.trackers t
where t.id = 'tk_flight_dammam'
on conflict (id) do nothing;

-- 4) Denormalizar el último valor en el tracker (lo que muestra el resumen).
update public.trackers
set current_value = 5075, current_value_date = date '2026-06-03', last_updated = now()
where id = 'tk_flight_dammam';

-- ─── Verificación ──────────────────────────────────────────────────
-- select id, label, objective_id, objective_step_id, current_value,
--        current_value_date, condition_kind, condition_value
--   from public.trackers where id = 'tk_flight_dammam';
-- select value, date, source from public.tracker_points
--   where tracker_id = 'tk_flight_dammam' order by date;
