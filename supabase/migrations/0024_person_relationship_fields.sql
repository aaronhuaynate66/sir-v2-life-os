-- 0024 — Campos de relación de primera clase en `people`.
--
-- Aditiva, no-destructiva, idempotente. RLS de `people` ya cubre todas las
-- columnas (policies por user_id de 0001) → no hay que tocar policies.
--
--   - estado_civil : soltero/casado/etc. (texto libre; el form sugiere opciones).
--   - education    : grado de instrucción / educación (texto libre). Se muestra
--                    dentro de "Vida profesional" en el detalle.
--
-- NOTA: la ubicación (ciudad/distrito) ya existe como `people.location`
-- (migration 0001) — no se agrega columna nueva, se reusa.
--
-- ACCIÓN MANUAL: correr en el SQL Editor de Supabase (o vía el runner una vez
-- activado). El código cliente ya está deployado y es tolerante: hasta que
-- corras esto, los campos nuevos simplemente no persisten (los demás edits de
-- la persona siguen funcionando — la inclusión en el upsert es condicional).

alter table public.people add column if not exists estado_civil text;
alter table public.people add column if not exists education    text;
