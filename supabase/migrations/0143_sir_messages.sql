-- ============================================================
-- SIR V2 — Migration 0143: sir_messages (hilo conversacional unificado)
-- ============================================================
-- Fase 2 del asistente multi-canal. Hasta ahora el HILO lineal de la
-- conversación con SIR vivía en localStorage del navegador (solo web, solo ese
-- dispositivo) y Telegram no tenía hilo. sir_conversations (0121) da recall
-- SEMÁNTICO por similitud, pero no el hilo literal ordenado.
--
-- Esta tabla es el HILO CANÓNICO por usuario, agnóstico de canal: web, PWA y
-- Telegram leen y escriben el mismo hilo → "el mismo historial en los 3 lados".
-- Guarda TODO turno (a diferencia de sir_conversations, que filtra para RAG).
--
-- IMPORTANTE — fail-open: el código funciona AUNQUE esta tabla no exista aún
-- (getSirThread devuelve [], appendSirThread no rompe). Seguro deployar el código
-- antes de aplicar la migración. Mismo patrón RLS owner-only que 0121.
-- ============================================================

-- ─── 1. Tabla ───────────────────────────────────────────────────────
create table if not exists public.sir_messages (
  id          text primary key default gen_random_uuid()::text,
  user_id     text not null,
  role        text not null check (role in ('user', 'sir')),
  content     text not null,
  channel     text not null default 'web',
  created_at  timestamptz not null default now()
);

-- ─── 2. Índice para leer el hilo del usuario por orden temporal ─────
create index if not exists idx_sir_messages_user_created
  on public.sir_messages(user_id, created_at desc);

-- ─── 3. RLS (owner-only, mismo patrón que sir_conversations 0121) ──
alter table public.sir_messages enable row level security;

drop policy if exists "select own sir_messages" on public.sir_messages;
create policy "select own sir_messages"
  on public.sir_messages for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own sir_messages" on public.sir_messages;
create policy "insert own sir_messages"
  on public.sir_messages for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "delete own sir_messages" on public.sir_messages;
create policy "delete own sir_messages"
  on public.sir_messages for delete
  using (auth.uid()::text = user_id);

-- ============================================================
-- Verificación post-aplicación (pegar en SQL Editor):
-- ============================================================
-- select tablename, rowsecurity from pg_tables
-- where schemaname = 'public' and tablename = 'sir_messages';
-- select indexname from pg_indexes
-- where schemaname = 'public' and tablename = 'sir_messages';
