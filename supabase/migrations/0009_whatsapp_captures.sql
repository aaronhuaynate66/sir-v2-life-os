-- ============================================================
-- SIR V2 — Migration 0009: Captura WhatsApp Relaciones
-- ============================================================
-- Crea bucket privado "whatsapp-captures" para los screenshots de
-- WhatsApp + RLS por carpeta {userId}/...
--
-- IMPORTANTE: este feature NO requiere ALTER de tablas. Las capturas
-- WhatsApp se guardan como items dentro de relationships.history
-- (jsonb opaco) — la extension del schema esta solo a nivel TypeScript
-- en RelationshipEvent. Una sola migration de Storage es todo lo que
-- necesita la DB.
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
-- (Mismo flujo que 0001-0008.)
--
-- EDGE CASE (heredado de migration 0005): algunos proyectos Supabase
-- recientes requieren ser `postgres` superuser para crear policies en
-- storage.objects desde el SQL Editor. Si el SQL siguiente tira
-- "must be owner of relation objects", crear las 3 policies desde
-- Dashboard -> Storage -> whatsapp-captures -> Policies con la misma
-- expresion. El INSERT del bucket si funciona desde SQL Editor.
-- ============================================================

-- ─── 1. Bucket privado ──────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('whatsapp-captures', 'whatsapp-captures', false)
on conflict (id) do nothing;

-- ─── 2. RLS sobre storage.objects ───────────────────────────────────
-- Convencion: path empieza con {userId}/whatsapp/<file> y
-- storage.foldername(name) expone {userId} como [1].

drop policy if exists "Users insert own whatsapp captures" on storage.objects;
create policy "Users insert own whatsapp captures"
  on storage.objects for insert
  with check (
    bucket_id = 'whatsapp-captures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users read own whatsapp captures" on storage.objects;
create policy "Users read own whatsapp captures"
  on storage.objects for select
  using (
    bucket_id = 'whatsapp-captures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own whatsapp captures" on storage.objects;
create policy "Users delete own whatsapp captures"
  on storage.objects for delete
  using (
    bucket_id = 'whatsapp-captures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- -- 1. bucket creado:
-- select id, name, public from storage.buckets where id = 'whatsapp-captures';
--
-- -- 2. policies activas (3 esperadas):
-- select policyname, tablename from pg_policies
-- where schemaname = 'storage'
--   and policyname like '%whatsapp captures%'
-- order by policyname;
