-- 0140 — "Memoria que aprende" (Fase 3d): lecciones durables sobre Aaron.
--
-- Distinto de las memorias por-persona (relacionales) y de las correlaciones
-- N-de-1 (métricas auto-computadas). Acá viven LECCIONES generales y durables que
-- SIR destila de lo que Aaron cuenta: preferencias ("prefiero findes largos para
-- viajar"), patrones ("cuando duermo <6h me irrito"), principios ("este año el
-- Mundial va antes que todo"), hechos estables. SIR las RECUERDA y las aplica al
-- aconsejar (se inyectan en el contexto de /api/sir/ask y afines).
--
-- Se capturan con la tool `registrar_aprendizaje` del ingest de relato (web o
-- WhatsApp). `reinforced_count` sube si Aaron repite/confirma la misma lección.
-- Aditiva, idempotente, RLS por dueño.

create table if not exists public.learnings (
  id               text primary key default gen_random_uuid()::text,
  user_id          uuid not null references auth.users(id) on delete cascade,
  text             text not null,
  kind             text not null default 'pattern'
                     check (kind in ('preference', 'pattern', 'principle', 'fact')),
  source           text not null default 'relato',   -- relato | manual | derived
  confidence       text not null default 'medium'
                     check (confidence in ('high', 'medium', 'low')),
  is_active        boolean not null default true,     -- Aaron puede archivar una lección
  reinforced_count int not null default 1,            -- sube si se repite/confirma
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists learnings_user_active_idx on public.learnings (user_id, is_active);

alter table public.learnings enable row level security;
create policy "select own learnings" on public.learnings for select using (auth.uid() = user_id);
create policy "insert own learnings" on public.learnings for insert with check (auth.uid() = user_id);
create policy "update own learnings" on public.learnings for update using (auth.uid() = user_id);
create policy "delete own learnings" on public.learnings for delete using (auth.uid() = user_id);

comment on table public.learnings is
  'Fase 3d — lecciones durables que SIR aprende de Aaron (preferencias/patrones/principios/hechos) y aplica al aconsejar. Distinto de memorias por-persona y de correlaciones N-de-1.';
