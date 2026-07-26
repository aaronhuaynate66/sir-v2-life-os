-- 0170 — Catálogo de a quién sigue Aaron en Instagram (handle → NOMBRE).
--
-- El problema medido el 25-jul: 111 cuentas en la bandeja "¿quién es quién?" y
-- NINGUNA con nombre. Instagram no expone el nombre en la barra de historias,
-- solo el handle, y los handles no son parlantes (@yayocastaneda.pe,
-- @voxpopuli.consultoria) → el matcher da 0 sugerencias sobre 111, con o sin
-- ampliar el universo de nombres conocidos. Se probó: cero mejora.
--
-- Donde SÍ está el nombre es en la lista de "Siguiendo": ahí IG muestra handle Y
-- nombre real de cada cuenta. Con ese catálogo el match pasa a ser nombre contra
-- nombre —"Diana Carolina" ↔ "Diana Carolina"— en vez de adivinar del handle, y
-- la bandeja se resuelve en lote en lugar de una por una.
--
-- Es un CATÁLOGO (a quién sigo), no actividad: no dice nada de timing ni de
-- historias. Por eso vive aparte de unmatched_social_activity y contact_activity.

create table if not exists public.social_following (
  id            text primary key,          -- sha1(user|platform|handle)
  user_id       text not null,
  platform      text not null default 'instagram',
  handle        text not null,             -- canónico, sin @
  display_name  text,                      -- el nombre real que muestra IG
  /** Contacto resuelto, cuando el nombre matchea a alguien de su red. */
  person_id     text,
  observed_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_following_user_handle
  on public.social_following(user_id, handle);
create index if not exists idx_following_user_person
  on public.social_following(user_id, person_id)
  where person_id is not null;

alter table public.social_following enable row level security;

drop policy if exists "select own social_following" on public.social_following;
create policy "select own social_following" on public.social_following for select
  using (auth.uid()::text = user_id);
drop policy if exists "insert own social_following" on public.social_following;
create policy "insert own social_following" on public.social_following for insert
  with check (auth.uid()::text = user_id);
drop policy if exists "update own social_following" on public.social_following;
create policy "update own social_following" on public.social_following for update
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
