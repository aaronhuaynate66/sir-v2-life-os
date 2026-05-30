-- ============================================================
-- SIR V2 — Migration 0021: tabla append-only relationship_events (Opción B)
-- ============================================================
-- Saca el historial relacional del JSONB `relationships.history` (que crece
-- sin límite y se pushea entero en cada sync) a una tabla append-only,
-- indexada por persona/fecha. Los lectores (timeline) leen las N más
-- recientes de acá -> el "cap" acota lo RENDERIZADO sin truncar el dato.
--
-- NO-LOSSY y NO destructivo:
--   - `relationships.history` queda INTACTO como respaldo (no se toca).
--   - Esta migración COPIA (no mueve) los eventos existentes a la tabla.
--   - El flujo de captura hace dual-write (JSONB + tabla) de ahí en más.
--
-- ADITIVA: solo CREATE TABLE / INDEX / POLICY + un INSERT idempotente
-- (on conflict do nothing). Re-correrla es seguro.
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
-- ============================================================

create table if not exists public.relationship_events (
  id                   text primary key,
  user_id              uuid not null references auth.users(id) on delete cascade,
  person_id            text references public.people(id) on delete cascade,
  relationship_id      text,
  description          text,
  emotional_tone       numeric,
  event_date           timestamptz,
  event_type           text,
  capture_kind         text,
  capture_id           text,
  source_image_path    text,
  topics               jsonb,
  emotional_states     jsonb,
  raw_messages         jsonb,
  reflection_questions jsonb,
  confidence           text,
  created_at           timestamptz not null default now()
);

-- ─── Indexes ────────────────────────────────────────────────────────
create index if not exists idx_relationship_events_user_person_date
  on public.relationship_events(user_id, person_id, event_date desc);
create index if not exists idx_relationship_events_user_date
  on public.relationship_events(user_id, event_date desc);

-- ─── RLS (patrón de las otras tablas: user_id = auth.uid()) ─────────
alter table public.relationship_events enable row level security;

drop policy if exists "select own relationship_events" on public.relationship_events;
create policy "select own relationship_events"
  on public.relationship_events for select using (auth.uid() = user_id);

drop policy if exists "insert own relationship_events" on public.relationship_events;
create policy "insert own relationship_events"
  on public.relationship_events for insert with check (auth.uid() = user_id);

drop policy if exists "update own relationship_events" on public.relationship_events;
create policy "update own relationship_events"
  on public.relationship_events for update using (auth.uid() = user_id);

drop policy if exists "delete own relationship_events" on public.relationship_events;
create policy "delete own relationship_events"
  on public.relationship_events for delete using (auth.uid() = user_id);

-- ─── Copia NO-LOSSY del history existente (JSONB -> filas) ──────────
-- Solo eventos con id y fecha ISO parseable (el regex evita que un date
-- malformado aborte el INSERT; esos eventos ya eran inrenderables en el
-- timeline y siguen intactos en el JSONB de respaldo). Idempotente.
insert into public.relationship_events (
  id, user_id, person_id, relationship_id, description, emotional_tone,
  event_date, event_type, capture_kind, capture_id, source_image_path,
  topics, emotional_states, raw_messages, reflection_questions, confidence
)
select
  (h->>'id'),
  r.user_id,
  r.person_id,
  r.id,
  (h->>'description'),
  nullif(h->>'emotionalTone', '')::numeric,
  (h->>'date')::timestamptz,
  (h->>'type'),
  (h->>'captureKind'),
  (h->>'captureId'),
  (h->>'sourceImagePath'),
  (h->'topics'),
  (h->'emotionalStates'),
  (h->'rawMessages'),
  (h->'reflectionQuestions'),
  (h->>'confidence')
from public.relationships r,
     lateral jsonb_array_elements(r.history) as h
where jsonb_typeof(r.history) = 'array'
  and (h->>'id') is not null
  and (h->>'date') ~ '^\d{4}-\d{2}-\d{2}'
on conflict (id) do nothing;

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- -- tabla + RLS:
-- select tablename, rowsecurity from pg_tables
-- where schemaname='public' and tablename='relationship_events';
-- -- 4 policies:
-- select policyname from pg_policies
-- where schemaname='public' and tablename='relationship_events' order by policyname;
-- -- conteo copiado vs items en el JSONB (deberian coincidir salvo dates malformados):
-- select count(*) as copied from public.relationship_events;
-- select count(*) as in_jsonb from public.relationships r,
--   lateral jsonb_array_elements(r.history) h where jsonb_typeof(r.history)='array';
-- ============================================================
