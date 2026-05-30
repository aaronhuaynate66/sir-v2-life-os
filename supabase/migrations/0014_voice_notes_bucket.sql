-- ============================================================
-- SIR V2 — Migration 0014: Storage bucket para notas de voz (#12 detail page)
-- ============================================================
-- Un bucket privado nuevo para audios grabados por el usuario asociados a
-- una persona. Mismo patron que migrations 0011 (capture buckets): bucket
-- privado + 3 policies (insert/select/delete) con RLS por carpeta
-- {userId}/...
--
-- Las notas de voz se materializan como rows en `observations` con
-- capture_type='voice_note' (ya valido en el CHECK de migration 0010):
--   - source_image_path = path del audio en este bucket
--   - storage_bucket    = 'person-voice-notes'
--   - data              = { durationSec, mime }
-- Por eso NO se necesita tabla nueva ni cambios de schema — solo el bucket.
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
--
-- EDGE CASE (heredado): si el SQL de policies tira "must be owner of
-- relation objects", crearlas desde Dashboard -> Storage -> person-voice-notes
-- -> Policies con la misma expresion. El INSERT del bucket si corre desde
-- SQL Editor.
-- ============================================================

-- ─── 1. Bucket privado ──────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('person-voice-notes', 'person-voice-notes', false)
on conflict (id) do nothing;

-- ─── 2. RLS person-voice-notes ──────────────────────────────────────
drop policy if exists "Users insert own voice notes" on storage.objects;
create policy "Users insert own voice notes"
  on storage.objects for insert
  with check (
    bucket_id = 'person-voice-notes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users read own voice notes" on storage.objects;
create policy "Users read own voice notes"
  on storage.objects for select
  using (
    bucket_id = 'person-voice-notes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own voice notes" on storage.objects;
create policy "Users delete own voice notes"
  on storage.objects for delete
  using (
    bucket_id = 'person-voice-notes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- -- 1. bucket creado:
-- select id, name, public from storage.buckets where id = 'person-voice-notes';
--
-- -- 2. policies activas (3 esperadas):
-- select policyname, tablename from pg_policies
-- where schemaname = 'storage' and policyname like '%voice notes%'
-- order by policyname;
