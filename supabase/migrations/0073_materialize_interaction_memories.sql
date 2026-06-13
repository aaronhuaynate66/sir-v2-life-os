-- 0073 — Materialización RETROACTIVA de interacciones registradas → memories.
--
-- CONTEXTO: desde 2026-06-13 una interacción registrada CON nota se materializa
-- como memoria al guardarse (mem_log:<logId>). Pero las interacciones VIEJAS
-- (anteriores al fix) quedaron solo en person_logs; el briefing (que lee
-- memories) las ignora y dice "nada que resumir" aunque exista la nota.
--
-- ESTA MIGRACIÓN rellena el pasado: por cada person_log kind='interaction' con
-- nota no vacía, crea la memoria episódica equivalente. MISMO shape que
-- interactionLogToMemoryRow (id determinístico, type episodic, importance 6,
-- emotional_charge = (tono-3)/2, source manual, tag interaccion).
--
-- IDEMPOTENTE: ON CONFLICT (id) DO NOTHING. Re-correrla no duplica, y no choca
-- con las memorias que el endpoint ya creó para interacciones nuevas.
-- Corre como service role vía el runner (bypassa RLS; user_id se copia del log).

insert into public.memories
  (id, user_id, person_id, type, title, content, entities,
   emotional_charge, importance, decay_rate, tags, related_memories,
   occurred_at, last_accessed, source)
select
  'mem_log:' || pl.id,
  pl.user_id,
  pl.person_id,
  'episodic',
  'Interacción registrada',
  trim(pl.note),
  case when pl.person_id is not null then array[pl.person_id] else '{}'::text[] end,
  (least(5, greatest(1, pl.value)) - 3) / 2.0,
  6,
  0.05,
  array['interaccion']::text[],
  '{}'::text[],
  pl.logged_at,
  pl.logged_at,
  'manual'
from public.person_logs pl
where pl.kind = 'interaction'
  and pl.note is not null
  and length(trim(pl.note)) > 0
on conflict (id) do nothing;
