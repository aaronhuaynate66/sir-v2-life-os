-- 0167 — Las PÁGINAS dejan de ser ruido: cuenta de IG ↔ organización, y quiénes
--        del círculo de Aaron siguen esa página (= intereses en común).
--
-- Fricción (2026-07-25, viendo @voxpopuli.consultoria en la bandeja): «está
-- jalando historias de perfiles de empresas, lo cual está bien pero no
-- necesariamente son contactos… hay que ver de asociarlos a perfiles de empresas
-- o unidades como la de bomberos, USAR o RIT. Y sería más valioso saber quiénes
-- de mis amigos siguen también esas páginas para saber qué intereses en común
-- tenemos — así en grafo se va volviendo más potente».
--
-- Hoy la bandeja "¿quién es quién?" solo sabe asignar a PERSONA o descartar: la
-- única salida para una página es borrarla y perder la señal (22 de 101 cuentas
-- en cola son páginas, varias del mundo bomberil: @firebrothersperu, @daedoperu,
-- @k9_peru_sac…). Con esto una página se asigna a su ORG (que ya existe como
-- entidad desde 0077: cgbvp, rit, fedepol…) y deja de volver a la bandeja.

-- 1. La organización puede tener cuenta de Instagram.
alter table public.org_profiles add column if not exists instagram_handle text;

create unique index if not exists uniq_org_profiles_user_ig
  on public.org_profiles (user_id, instagram_handle)
  where instagram_handle is not null;

-- 2. Quién del círculo sigue esa página.
--
-- El dato NO lo expone ninguna API ni ningún tercero: solo se ve desde la cuenta
-- propia, en el renglón "Seguido por fulano, mengano y N personas más que
-- sigues" del perfil. Lo captura el reader de la extensión al visitar la página
-- (pasivo — es lo que Aaron ya ve). Por eso guardamos el handle/nombre crudos:
-- el follower puede no ser todavía un contacto cargado; `person_id` se resuelve
-- cuando matchea (mismo criterio que la bandeja) y hasta entonces queda null.
create table if not exists public.social_page_followers (
  id               text primary key,   -- sha1(user|page|follower) → idempotente
  user_id          text not null,
  page_handle      text not null,      -- handle canónico de la página
  follower_handle  text,               -- handle canónico del seguidor, si vino
  follower_name    text,               -- nombre visible, si vino
  person_id        text,               -- contacto resuelto (null hasta matchear)
  source           text not null default 'instagram',
  observed_at      timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create index if not exists idx_page_followers_user_page
  on public.social_page_followers(user_id, page_handle);
create index if not exists idx_page_followers_user_person
  on public.social_page_followers(user_id, person_id)
  where person_id is not null;

alter table public.social_page_followers enable row level security;

drop policy if exists "select own page_followers" on public.social_page_followers;
create policy "select own page_followers" on public.social_page_followers for select
  using (auth.uid()::text = user_id);
drop policy if exists "insert own page_followers" on public.social_page_followers;
create policy "insert own page_followers" on public.social_page_followers for insert
  with check (auth.uid()::text = user_id);
drop policy if exists "update own page_followers" on public.social_page_followers;
create policy "update own page_followers" on public.social_page_followers for update
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
drop policy if exists "delete own page_followers" on public.social_page_followers;
create policy "delete own page_followers" on public.social_page_followers for delete
  using (auth.uid()::text = user_id);
