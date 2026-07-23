-- 0157 — dev_session_status: estado EN VIVO de la sesión de Claude Code en la laptop.
--
-- Problema: el bot de dev (@sir_aaron_dev_bot) solo veía GitHub (commits/CI/PRs), así
-- que mientras Claude Code trabaja LOCAL —antes de commitear/pushear— Aaron no veía
-- NADA en tiempo real. Un hook local (scripts/dev-session-hook.mjs) escribe aquí en
-- cada SessionStart / PostToolUse (con throttle) / Stop, vía POST /api/dev/session.
-- El webhook del bot lee la última fila y la cuenta.
--
-- Solo server-side (service role la escribe y la lee). RLS ON sin policies públicas
-- => anon/authenticated no la tocan; service role la bypassa. Aditivo.

create table if not exists public.dev_session_status (
  session_id    text primary key,
  event         text not null default 'progress',  -- start | progress | stop
  summary       text,                                -- en qué anda / qué hizo (última respuesta del asistente)
  activity      text,                                -- heartbeat: última herramienta/acción
  branch        text,                                -- rama git local
  changed_files text,                                -- resumen de git status --porcelain
  last_commit   text,                                -- último commit local (oneline)
  cwd           text,
  updated_at    timestamptz not null default now()
);

alter table public.dev_session_status enable row level security;

comment on table public.dev_session_status is
  'Estado en vivo de la sesión de Claude Code en la laptop de Aaron. Lo escribe un hook local vía POST /api/dev/session; lo lee el bot de dev (@sir_aaron_dev_bot). Solo service role.';
