-- ============================================================
-- SIR V2 — Migration 0047: person_profile_axes (3 ejes narrativos persistidos)
-- ============================================================
-- GEMA V1 portada: la ficha de persona se estructura en TRES ejes narrativos
-- (profesional / social / personal). En SIR v1 eran texto editable; v2 ya tiene
-- la síntesis IA cacheada de "Lo personal" en `person_synthesis` (0010). Lo que
-- faltaba era PERSISTIR los otros dos ejes (profesional + social) en vez de
-- derivarlos al vuelo en cada render.
--
-- Esta tabla guarda UN row por persona (upsert) con el texto narrativo de los
-- ejes PROFESIONAL y SOCIAL. El eje PERSONAL sigue viviendo en person_synthesis
-- (síntesis IA, con historial/versionado). Juntos = los 3 ejes persistidos.
--
-- Los textos profesional/social se generan DETERMINÍSTICAMENTE (sin LLM, cero
-- latencia, sin riesgo de timeout/502) a partir de las capturas LinkedIn/
-- Instagram, en el momento de la CAPTURA (no en cada carga). El render prefiere
-- el texto persistido y cae al cómputo en vivo si no hay row (backward-compat).
--
-- `*_source` distingue 'auto' (generado del cómputo determinístico) de 'manual'
-- (editado por el usuario — un futuro editor inline no se pisará al recapturar).
--
-- ADITIVA, no-destructiva, idempotente. NO toca datos existentes. Si la
-- migración no se corrió, la ficha sigue mostrando el eje computado en vivo
-- (el helper de fetch devuelve null y el componente cae al fallback). No rompe.
--
-- ACCIÓN: se aplica vía el runner de migraciones (CI `supabase db push`) o, si
-- el runner aún no está activado, manualmente en el SQL Editor de Supabase.
-- ============================================================

-- ─── 1. Tabla ───────────────────────────────────────────────────────
create table if not exists public.person_profile_axes (
  id                            uuid primary key default uuid_generate_v4(),
  user_id                       uuid not null references auth.users(id) on delete cascade,
  person_id                     text not null references public.people(id) on delete cascade,

  -- Eje PROFESIONAL (síntesis determinística desde la captura LinkedIn + el
  -- campo people.education reconciliado). null si nunca se computó.
  professional_text             text,
  professional_source           text not null default 'auto'
                                  check (professional_source in ('auto', 'manual')),
  professional_observation_ids  text[] not null default '{}',
  professional_generated_at     timestamptz,

  -- Eje SOCIAL (síntesis determinística desde la captura Instagram: identidad,
  -- alcance, bio, seguidores en común). null si nunca se computó.
  social_text                   text,
  social_source                 text not null default 'auto'
                                  check (social_source in ('auto', 'manual')),
  social_observation_ids        text[] not null default '{}',
  social_generated_at           timestamptz,

  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),

  -- Un único row por persona (clave del upsert).
  unique (user_id, person_id)
);

-- ─── 2. RLS (privado por usuario) ───────────────────────────────────
alter table public.person_profile_axes enable row level security;

drop policy if exists "select own person_profile_axes" on public.person_profile_axes;
create policy "select own person_profile_axes"
  on public.person_profile_axes for select
  using (auth.uid() = user_id);

drop policy if exists "insert own person_profile_axes" on public.person_profile_axes;
create policy "insert own person_profile_axes"
  on public.person_profile_axes for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own person_profile_axes" on public.person_profile_axes;
create policy "update own person_profile_axes"
  on public.person_profile_axes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own person_profile_axes" on public.person_profile_axes;
create policy "delete own person_profile_axes"
  on public.person_profile_axes for delete
  using (auth.uid() = user_id);

-- ============================================================
-- Verificación post-aplicación (pegar en SQL Editor):
-- ============================================================
-- select table_name from information_schema.tables
--   where table_schema='public' and table_name='person_profile_axes';
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename='person_profile_axes';
-- select policyname from pg_policies
--   where schemaname='public' and tablename='person_profile_axes' order by policyname;
-- select column_name, data_type, is_nullable from information_schema.columns
--   where table_name='person_profile_axes' order by ordinal_position;
-- ============================================================
