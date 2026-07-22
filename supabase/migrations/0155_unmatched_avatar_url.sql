-- 0155 — unmatched_social_activity.avatar_url: foto de perfil para match por cara.
--
-- IG no expone el NOMBRE en la barra de historias (solo el handle) → el camino
-- para identificar el círculo es la FOTO de perfil. El reader (0.6.4+) manda la
-- URL de la foto; acá la guardamos para comparar contra los avatares de los
-- contactos (visión) y sugerir quién es. Aditivo.

alter table public.unmatched_social_activity
  add column if not exists avatar_url text;

comment on column public.unmatched_social_activity.avatar_url is
  'URL de la foto de perfil capturada por el reader (IG). Alimenta el match por cara contra avatares de contactos. NULL = no capturada.';
