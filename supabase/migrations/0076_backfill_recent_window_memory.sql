-- 0076 — Backfill: memoria de "ventana reciente" para exports de WhatsApp ya
-- importados.
--
-- El fix del importador crea esta memoria a futuro. Acá la generamos para las
-- observaciones whatsapp_chat ya existentes (ej. Diana), tomando los últimos
-- bloques (más recientes) del resumen, con fecha = observed_at (último mensaje).
-- Mismo shape que recentWindowMemoryRow. Idempotente (id mem_recent:<obsId>).

insert into public.memories
  (id, user_id, person_id, type, title, content, entities,
   emotional_charge, importance, decay_rate, tags, related_memories,
   occurred_at, last_accessed, source, observation_id)
select
  'mem_recent:' || o.id,
  o.user_id,
  o.person_id,
  'episodic',
  'Conversación reciente (WhatsApp)',
  left(rw.content, 700),
  case when o.person_id is not null then array[o.person_id] else '{}'::text[] end,
  0, 7, 0.05, array['whatsapp','reciente']::text[], '{}'::text[],
  o.observed_at, o.observed_at, 'inferred', o.id
from public.observations o
cross join lateral (
  select string_agg(value, ' ' order by ord) as content
  from (
    select value, ordinality as ord
    from jsonb_array_elements_text(coalesce(o.data->'blockSummaries', '[]'::jsonb)) with ordinality
  ) t
  where ord > greatest(0, jsonb_array_length(coalesce(o.data->'blockSummaries', '[]'::jsonb)) - 2)
) rw
where o.capture_type = 'whatsapp_chat'
  and o.person_id is not null
  and jsonb_array_length(coalesce(o.data->'blockSummaries', '[]'::jsonb)) > 0
  and rw.content is not null
  and length(trim(rw.content)) > 0
on conflict (id) do nothing;
