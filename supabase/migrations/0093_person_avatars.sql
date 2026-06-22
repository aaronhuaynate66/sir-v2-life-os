-- 0093 — Foto/avatar por persona. Tabla aparte (no toca el modelo tipado de
-- people ni el sync) que mapea persona → archivo en el bucket privado
-- person-avatars. Se muestra via signed URL. RLS por usuario.
create table if not exists public.person_avatars (
  user_id      uuid not null references auth.users(id) on delete cascade,
  person_id    uuid not null,
  storage_path text not null,
  updated_at   timestamptz not null default now(),
  primary key (user_id, person_id)
);
alter table public.person_avatars enable row level security;
drop policy if exists "select own avatars" on public.person_avatars;
create policy "select own avatars" on public.person_avatars for select using (auth.uid() = user_id);
drop policy if exists "insert own avatars" on public.person_avatars;
create policy "insert own avatars" on public.person_avatars for insert with check (auth.uid() = user_id);
drop policy if exists "update own avatars" on public.person_avatars;
create policy "update own avatars" on public.person_avatars for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "delete own avatars" on public.person_avatars;
create policy "delete own avatars" on public.person_avatars for delete using (auth.uid() = user_id);

-- Bucket privado + políticas de Storage (carpeta = {userId}/...).
insert into storage.buckets (id, name, public) values ('person-avatars', 'person-avatars', false)
  on conflict (id) do nothing;
drop policy if exists "avatars storage select" on storage.objects;
create policy "avatars storage select" on storage.objects for select
  using (bucket_id = 'person-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars storage insert" on storage.objects;
create policy "avatars storage insert" on storage.objects for insert
  with check (bucket_id = 'person-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars storage update" on storage.objects;
create policy "avatars storage update" on storage.objects for update
  using (bucket_id = 'person-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars storage delete" on storage.objects;
create policy "avatars storage delete" on storage.objects for delete
  using (bucket_id = 'person-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
