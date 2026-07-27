-- 0171 — Datos del PERFIL de una cuenta de Instagram (seguidores, publicaciones,
-- bio, categoría). Pedido de Aaron (issue #994):
--
--   "¿por qué si SIR ya revisa las historias y saca el user, no puede sacar de
--    una vez la cantidad de seguidores, publicaciones, etc.?"
--
-- POR QUÉ SE PUEDE (y por qué no era obvio): el reader es PASIVO a propósito —
-- no hace requests propios, solo lee el JSON que IG ya le manda al navegador
-- mientras Aaron navega (hacer requests propios es lo que IG detecta y banea).
-- Hasta hoy `handle()` en instagramReader.js filtraba con `looksTray` y DESCARTABA
-- todo payload que no fuera la barra de historias. Cuando Aaron entra a un perfil,
-- IG ya le manda nombre completo, bio, seguidores, publicaciones y categoría en
-- esa respuesta — y el reader la miraba y la soltaba. No hace falta pedir nada
-- nuevo: solo dejar de tirar lo que ya llega.
--
-- POR QUÉ TABLA APARTE y no columnas en unmatched_social_activity: esa fila se
-- BORRA cuando la cuenta se resuelve a un contacto (ingest/route.ts la elimina al
-- promover). Los datos de perfil tienen que sobrevivir a eso — sirven igual en la
-- ficha de la persona y para decidir si una cuenta es una PERSONA o una ORG.
--
-- EL USO REAL: 130 cuentas en la bandeja y CERO con nombre (medido 27-jul). El
-- conteo de seguidores + `is_business` + `category` es justamente lo que separa
-- "un amigo" de "una fan page": nadie con 50.000 seguidores y categoría
-- "Gimnasio" es un contacto personal. Eso es lo que hoy traba la bandeja.

create table if not exists public.social_profiles (
  id             text primary key,          -- sha1(user|platform|handle)
  user_id        text not null,
  platform       text not null default 'instagram',
  handle         text not null,             -- canónico, sin @

  full_name      text,
  biography      text,
  /** Categoría de negocio que declara IG ("Gimnasio", "Restaurante"). Señal
   *  fuerte de que la cuenta es una ORG y no una persona. */
  category       text,
  external_url   text,

  followers_count integer,
  following_count integer,
  posts_count     integer,

  is_verified    boolean,
  is_business    boolean,

  /** Contacto resuelto, cuando la cuenta ya es alguien de su red. */
  person_id      text,

  captured_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create unique index if not exists idx_social_profiles_user_handle
  on public.social_profiles(user_id, platform, handle);
create index if not exists idx_social_profiles_user_person
  on public.social_profiles(user_id, person_id)
  where person_id is not null;

alter table public.social_profiles enable row level security;

drop policy if exists "select own social_profiles" on public.social_profiles;
create policy "select own social_profiles" on public.social_profiles for select
  using (auth.uid()::text = user_id);
drop policy if exists "insert own social_profiles" on public.social_profiles;
create policy "insert own social_profiles" on public.social_profiles for insert
  with check (auth.uid()::text = user_id);
drop policy if exists "update own social_profiles" on public.social_profiles;
create policy "update own social_profiles" on public.social_profiles for update
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
