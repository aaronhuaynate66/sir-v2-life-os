-- ============================================================
-- SIR V2 — Migration 0059: enriquecer identity_profile (auto-captura)
-- ============================================================
-- Suma a identity_profile (0055) los campos que alimenta la AUTO-CAPTURA de los
-- propios perfiles de Aaron (screenshots de SU LinkedIn/Instagram → Visión):
--
--   • interests  text[]  → intereses/hobbies (Instagram) + skills (LinkedIn),
--                          como tags. Es la señal nueva del motor proactivo
--                          (detectRubros también los matchea, no sólo roles).
--   • bio        text    → bio/about corto (texto).
--   • trajectory text    → educación/trayectoria breve (texto).
--
-- roles/location ya existen (0055): la captura los MERGEA sin duplicar / rellena
-- sin pisar lo que Aaron escribió a mano (la propuesta es editable antes de
-- guardar).
--
-- ADITIVA, idempotente. La tabla YA está en supabase_realtime con REPLICA
-- IDENTITY FULL (0055): las columnas nuevas viajan por el mismo sync. RLS
-- intacto (políticas por user_id de 0055). NO toca datos existentes.
--
-- Hueco 0056-0057 libre a propósito (sesiones en paralelo). El código cliente es
-- tolerante: hasta correr esto, los campos nuevos se guardan localmente y se
-- re-pushean al existir las columnas.
-- ============================================================

alter table public.identity_profile
  add column if not exists interests  text[] not null default '{}',
  add column if not exists bio        text   not null default '',
  add column if not exists trajectory text   not null default '';

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='identity_profile'
--   and column_name in ('interests','bio','trajectory');
-- ============================================================
