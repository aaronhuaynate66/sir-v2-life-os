-- 0160 — Match por cara (capa 2): cache del resultado de la comparación por
-- visión sobre cada cara misteriosa de la bandeja ¿quién es quién?.
--
-- El matcher (POST /api/social/unmatched/face-match) compara la foto snapshoteada
-- (avatar_path, mig 0156) contra la galería de contactos con avatar y guarda acá
-- su veredicto → la sugerencia se muestra sin re-correr visión, y las caras ya
-- revisadas (face_checked_at not null) no se vuelven a procesar (idempotente,
-- controla el costo). Sin match: face_person_id null pero face_checked_at seteado.

alter table public.unmatched_social_activity
  add column if not exists face_person_id  text,          -- contacto sugerido por cara (o null)
  add column if not exists face_confidence text,           -- 'alta' | 'media'
  add column if not exists face_checked_at timestamptz;    -- cuándo se corrió el matcher
