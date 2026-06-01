-- 0025 — Información sensible / datos adicionales por persona.
--
-- Tabla 1:1 con people, SEPARADA a propósito por sensibilidad (documentos e
-- identidad-dura: DNI, pasaporte, foto del documento). Aaron carga los valores
-- reales él mismo; acá solo se crea el contenedor.
--
-- Reglas de manejo (enforced por diseño en el código, no por SQL):
--   - NO se loguean los valores, NO entran a payloads de IA/embeddings, NO se
--     exponen en el grafo ni en summaries. Esta tabla no la lee ningún engine,
--     builder de grafo, embedding ni síntesis.
--   - La foto va a un bucket PRIVADO (person-documents) con RLS por carpeta
--     {userId}/... (mismo patrón que person-voice-notes, 0014).
--
-- Aditiva, idempotente. ACCIÓN MANUAL: correr en el SQL Editor de Supabase.

-- ─── 1. Tabla (RLS por user_id, FK a people con cascade) ────────────
create table if not exists public.person_sensitive_data (
  person_id              text primary key references public.people(id) on delete cascade,
  user_id                uuid not null references auth.users(id) on delete cascade,
  documento_tipo         text,
  documento_numero       text,
  pasaporte_numero       text,
  pasaporte_vencimiento  date,
  foto_documento_path    text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.person_sensitive_data enable row level security;

drop policy if exists "select own sensitive" on public.person_sensitive_data;
create policy "select own sensitive" on public.person_sensitive_data
  for select using (auth.uid() = user_id);

drop policy if exists "insert own sensitive" on public.person_sensitive_data;
create policy "insert own sensitive" on public.person_sensitive_data
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own sensitive" on public.person_sensitive_data;
create policy "update own sensitive" on public.person_sensitive_data
  for update using (auth.uid() = user_id);

drop policy if exists "delete own sensitive" on public.person_sensitive_data;
create policy "delete own sensitive" on public.person_sensitive_data
  for delete using (auth.uid() = user_id);

-- ─── 2. Bucket PRIVADO para la foto del documento ──────────────────
insert into storage.buckets (id, name, public)
values ('person-documents', 'person-documents', false)
on conflict (id) do nothing;

-- RLS por carpeta {userId}/... (igual que person-voice-notes).
-- EDGE CASE heredado: si tira "must be owner of relation objects", crear las
-- policies desde Dashboard -> Storage -> person-documents -> Policies con la
-- misma expresión (el INSERT del bucket sí corre desde SQL Editor).
drop policy if exists "Users insert own person-documents" on storage.objects;
create policy "Users insert own person-documents"
  on storage.objects for insert
  with check (
    bucket_id = 'person-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users read own person-documents" on storage.objects;
create policy "Users read own person-documents"
  on storage.objects for select
  using (
    bucket_id = 'person-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own person-documents" on storage.objects;
create policy "Users delete own person-documents"
  on storage.objects for delete
  using (
    bucket_id = 'person-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─── Verificación (pegar en SQL Editor) ────────────────────────────
-- select * from information_schema.columns where table_name = 'person_sensitive_data';
-- select policyname from pg_policies where tablename = 'person_sensitive_data';
-- select id, public from storage.buckets where id = 'person-documents';
