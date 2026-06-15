-- ============================================================
-- SIR V2 — Migration 0078: capture_type 'dm_conversation' en observations
-- ============================================================
-- Agrega 'dm_conversation' al CHECK de observations.capture_type (definido en
-- migration 0010, ampliado en 0020). Soporta capturas (screenshots) de DMs de
-- Instagram / Telegram / Messenger como CONVERSACIÓN real (cuenta como
-- interacción, igual que whatsapp_chat).
--
-- ADITIVA y NO destructiva: solo amplía los valores permitidos. Idempotente.
-- ============================================================

alter table public.observations
  drop constraint if exists observations_capture_type_check;

alter table public.observations
  add constraint observations_capture_type_check check (capture_type in (
    'whatsapp_chat',
    'whatsapp_web',
    'whatsapp_info',
    'instagram',
    'dm_conversation',
    'linkedin',
    'manual_note',
    'voice_note',
    'unknown'
  ));
