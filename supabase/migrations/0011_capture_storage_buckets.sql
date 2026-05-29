-- ============================================================
-- SIR V2 — Migration 0011: Storage buckets para detail page foundation
-- ============================================================
-- Tres buckets nuevos (privados) para capturas extendidas y avatares:
--   1. instagram-captures  — screenshots de perfiles Instagram
--   2. linkedin-captures   — screenshots de perfiles LinkedIn
--   3. person-avatars      — fotos de perfil manuales o capturadas
--
-- Mismo patron que migrations 0005 (scale-captures) y 0009 (whatsapp-captures):
-- bucket privado + 3 policies por bucket (insert/select/delete) con RLS por
-- carpeta {userId}/...
--
-- Voice notes NO incluido (D6 = fuera de scope, fase futura).
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
--
-- EDGE CASE (heredado de migrations anteriores): algunos proyectos Supabase
-- recientes requieren ser `postgres` superuser para crear policies en
-- storage.objects desde el SQL Editor. Si el SQL siguiente tira
-- "must be owner of relation objects", crear las policies desde
-- Dashboard -> Storage -> {bucket} -> Policies con la misma expresion.
-- El INSERT del bucket si funciona desde SQL Editor.
-- ============================================================

-- ─── 1. Buckets privados ────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('instagram-captures', 'instagram-captures', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('linkedin-captures', 'linkedin-captures', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('person-avatars', 'person-avatars', false)
on conflict (id) do nothing;

-- ─── 2A. RLS instagram-captures ─────────────────────────────────────
drop policy if exists "Users insert own instagram captures" on storage.objects;
create policy "Users insert own instagram captures"
  on storage.objects for insert
  with check (
    bucket_id = 'instagram-captures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users read own instagram captures" on storage.objects;
create policy "Users read own instagram captures"
  on storage.objects for select
  using (
    bucket_id = 'instagram-captures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own instagram captures" on storage.objects;
create policy "Users delete own instagram captures"
  on storage.objects for delete
  using (
    bucket_id = 'instagram-captures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─── 2B. RLS linkedin-captures ──────────────────────────────────────
drop policy if exists "Users insert own linkedin captures" on storage.objects;
create policy "Users insert own linkedin captures"
  on storage.objects for insert
  with check (
    bucket_id = 'linkedin-captures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users read own linkedin captures" on storage.objects;
create policy "Users read own linkedin captures"
  on storage.objects for select
  using (
    bucket_id = 'linkedin-captures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own linkedin captures" on storage.objects;
create policy "Users delete own linkedin captures"
  on storage.objects for delete
  using (
    bucket_id = 'linkedin-captures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─── 2C. RLS person-avatars ─────────────────────────────────────────
drop policy if exists "Users insert own person avatars" on storage.objects;
create policy "Users insert own person avatars"
  on storage.objects for insert
  with check (
    bucket_id = 'person-avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users read own person avatars" on storage.objects;
create policy "Users read own person avatars"
  on storage.objects for select
  using (
    bucket_id = 'person-avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own person avatars" on storage.objects;
create policy "Users delete own person avatars"
  on storage.objects for delete
  using (
    bucket_id = 'person-avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- -- 1. buckets creados (3 esperados):
-- select id, name, public from storage.buckets
-- where id in ('instagram-captures', 'linkedin-captures', 'person-avatars')
-- order by id;
--
-- -- 2. policies activas (9 esperadas: 3 buckets x 3 policies):
-- select policyname, tablename from pg_policies
-- where schemaname = 'storage'
--   and (policyname like '%instagram captures%'
--     or policyname like '%linkedin captures%'
--     or policyname like '%person avatars%')
-- order by policyname;
