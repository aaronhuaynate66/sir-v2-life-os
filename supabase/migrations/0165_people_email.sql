-- 0165 — Email como identidad matcheable de una persona (ingesta de correo/Teams).
--
-- El reader de correo (/api/email/ingest, /api/email/sync) y Teams traen el
-- `fromEmail` del remitente, pero HOY solo se usa como threadId/dedup: la persona
-- se atribuye por el NOMBRE VISIBLE del remitente (namesLooselyMatch), que falla
-- seguido (alias, nombre corporativo, "Apellido, Nombre", etc.). El email es la
-- llave estable del remitente → hay que poder matchear por email.
--
-- VÍA ELEGIDA: columna `people.email` (Opción A), NO network='email' en
-- person_identities (Opción B). Por qué:
--   1) MENOS fricción con el matcher existente: matchPersonId ya lee `people`;
--      con la columna resolvemos el match por email en la MISMA query, sin tabla
--      ni RLS nuevos (people ya tiene RLS por user_id).
--   2) `person_identities.network` es un enum CERRADO en el código
--      (IDENTITY_NETWORKS / isNetwork), sin 'email'; la Opción B obligaría a tocar
--      esos tipos + el Record NETWORK_LABEL + la UI de identidades (más superficie
--      y archivos ajenos). Nota: NO hay check constraint en la tabla (network es
--      text libre), así que el check no era el bloqueo — la fricción es de código.
--   3) El email primario es un atributo natural (single-valued) de una persona.
--
-- Aditiva e idempotente. El matcher exige UNA sola persona por email (misma
-- guarda anti-ambigüedad que el match por nombre), así que no imponemos unique.
alter table public.people add column if not exists email text;

-- Índice para el lookup por email normalizado (lower). Parcial: solo filas con
-- email, para mantenerlo chico.
create index if not exists people_user_email_idx
  on public.people (user_id, lower(email))
  where email is not null;
