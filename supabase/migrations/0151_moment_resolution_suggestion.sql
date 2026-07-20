-- 0151 — Sugerencia de resolución en relationship_moments (cruce chat → tema).
--
-- Fricción de Aaron (17/07): un tema ABIERTO (el examen del seguro de Diana)
-- seguía 'abierto' aunque el chat YA decía que se resolvió → "SIR no cruza bien
-- la info". El cron `moment-scan` (LLM, corre ANTES del morning-push) revisa si
-- el chat reciente resolvió cada tema abierto y deja la sugerencia AQUÍ, para
-- que el push la lea determinístico (sin LLM → cero latencia/502, como es su
-- diseño). El usuario sigue confirmando el cierre a mano — SIR SUGIERE, no cierra.
alter table public.relationship_moments
  add column if not exists resolution_suggested  boolean not null default false,
  add column if not exists resolution_evidence   text,
  add column if not exists resolution_confidence text,
  add column if not exists resolution_checked_at timestamptz;

-- Lectura rápida del push: los abiertos con sugerencia fresca, por usuario.
create index if not exists relationship_moments_user_suggested_idx
  on public.relationship_moments (user_id, resolution_checked_at desc)
  where resolution_suggested;
