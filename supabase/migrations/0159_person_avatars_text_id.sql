-- 0159 — Bug de fondo: person_avatars.person_id quedó como `uuid` (mig 0093)
-- cuando people.id ya era `text` desde 0002_text_ids / 0006_fix_id_types (para
-- soportar ids generados en cliente tipo `per_1780180139709_ytw0zw`).
--
-- Consecuencia: CUALQUIER contacto con id no-UUID nunca podía tener avatar —
-- el upsert a person_avatars fallaba con
--   invalid input syntax for type uuid: "per_1780180139709_ytw0zw"
-- y /api/avatars/auto se lo tragaba (devolvía ok:true igual). Por eso la
-- galería de avatares se quedaba efectivamente en 0 y el match por cara (capa 2)
-- nunca tenía referencias contra las cuales comparar.
--
-- Fix: alinear person_id a `text`, como el resto de tablas que referencian
-- people.id. person_id es parte de la PK compuesta (user_id, person_id);
-- Postgres reconstruye el índice de la PK solo con el cambio de tipo.
-- No hay FK declarada sobre person_avatars.person_id, así que el cambio es limpio.

alter table public.person_avatars
  alter column person_id type text using person_id::text;

-- Verificación (SQL Editor):
--   select data_type from information_schema.columns
--   where table_name = 'person_avatars' and column_name = 'person_id';
--   -- esperado: text
