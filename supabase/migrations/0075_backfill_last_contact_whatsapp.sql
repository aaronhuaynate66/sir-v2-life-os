-- 0075 — Backfill: sincronizar people.last_contact con la última observación
-- de WhatsApp ya importada.
--
-- El fix del importador (sincronizar last_contact) aplica a importaciones
-- futuras. Las personas YA importadas quedaron con last_contact viejo (bug:
-- el briefing de Diana ancló en "30 de mayo" pese a tener junio importado).
-- Acá adelantamos last_contact a la fecha del último whatsapp_chat observado,
-- SOLO si lo adelanta (nunca pisa una fecha más nueva). Idempotente.

update public.people p
set last_contact = sub.max_obs::date
from (
  select person_id, max(observed_at) as max_obs
  from public.observations
  where capture_type = 'whatsapp_chat' and person_id is not null
  group by person_id
) sub
where p.id = sub.person_id
  and (p.last_contact is null or p.last_contact < sub.max_obs::date);
