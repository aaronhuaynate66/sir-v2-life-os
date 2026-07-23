-- SIR V2 — snapshot permanente del avatar capturado en la bandeja ¿quién es quién?
--
-- `avatar_url` guarda la URL cruda del CDN de Instagram, que CADUCA en horas/días
-- y bloquea hotlinking. Para que la cara siga visible (y sirva de referencia al
-- match por cara), la ingesta la baja y la sube al bucket privado person-avatars;
-- acá guardamos su PATH permanente. La UI sirve una signed URL desde este path
-- (con fallback a avatar_url mientras se snapshotea).

alter table public.unmatched_social_activity
  add column if not exists avatar_path text;
