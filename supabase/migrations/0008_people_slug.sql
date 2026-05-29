-- ============================================================
-- SIR V2 — Migration 0008: people.slug
-- ============================================================
-- Agrega columna `slug` a people para soportar URLs /relaciones/[slug]
-- en lugar de /relaciones/[uuid]. Slugs son auto-generados desde el
-- nombre (lowercase, sin acentos, espacios -> '-') y editables desde la UI.
--
-- Uniqueness: (user_id, slug) WHERE slug IS NOT NULL. Cada usuario tiene
-- su namespace de slugs, asi que dos usuarios pueden tener "diana-carolina".
-- El indice es PARCIAL para permitir multiples NULL (idempotencia y
-- transicion gradual).
--
-- Backfill: dejado como UPDATE idempotente. Hoy people esta vacia en
-- esta instancia; si en el futuro hay rows, el UPDATE genera slugs desde
-- name solo para los que no tengan slug. La generacion server-side es
-- una version simplificada de generateSlug() en src/lib/people/slug.ts
-- (regexp_replace + lower). El cliente usa la version completa al crear
-- personas nuevas.
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
-- (Mismo flujo que 0001-0007.)
-- ============================================================

-- ─── 1. Columna nueva nullable ──────────────────────────────────────
alter table public.people
  add column if not exists slug text;

-- ─── 2. Indice unico parcial por (user_id, slug) ────────────────────
create unique index if not exists uniq_people_user_slug
  on public.people(user_id, slug)
  where slug is not null;

-- ─── 3. Backfill idempotente ────────────────────────────────────────
-- Genera slug a partir de name para rows que no tengan slug. La regex
-- normaliza minusculas + cualquier secuencia no-alfanumerica a un guion.
-- Hoy people esta vacia, asi que esta UPDATE no toca nada.
update public.people
   set slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
 where slug is null
   and name is not null;

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- -- columna existe + nullable:
-- select column_name, data_type, is_nullable from information_schema.columns
-- where table_name = 'people' and column_name = 'slug';
--
-- -- indice unico parcial:
-- select indexname, indexdef from pg_indexes
-- where indexname = 'uniq_people_user_slug';
--
-- -- backfill (debe retornar 0 rows si la tabla esta vacia):
-- select count(*) as rows, count(slug) as with_slug from public.people;
