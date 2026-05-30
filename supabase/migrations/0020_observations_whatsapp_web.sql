-- ============================================================
-- SIR V2 — Migration 0020: capture_type 'whatsapp_web' en observations
-- ============================================================
-- Agrega 'whatsapp_web' al CHECK de observations.capture_type (definido en
-- migration 0010) para soportar capturas de WhatsApp Web (escritorio).
--
-- ADITIVA y NO destructiva: solo amplía el conjunto de valores permitidos
-- (drop + recreate del CHECK constraint con el valor extra). NO toca datos
-- ni filas existentes. Idempotente (drop if exists + recreate).
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
-- ============================================================

alter table public.observations
  drop constraint if exists observations_capture_type_check;

alter table public.observations
  add constraint observations_capture_type_check check (capture_type in (
    'whatsapp_chat',
    'whatsapp_web',
    'whatsapp_info',
    'instagram',
    'linkedin',
    'manual_note',
    'voice_note',
    'unknown'
  ));

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- select pg_get_constraintdef(oid) from pg_constraint
-- where conname = 'observations_capture_type_check';
--   -> debe incluir 'whatsapp_web'.
-- ============================================================
