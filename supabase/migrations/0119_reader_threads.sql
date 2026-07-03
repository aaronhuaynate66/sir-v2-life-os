-- 0119 — SIR Reader: cursor de ingesta por hilo (dedup incremental).
--
-- POR QUÉ: la extensión/cliente manda deltas de una conversación abierta (Teams
-- primero). Para que "dejar el chat abierto" acumule solo lo NUEVO sin duplicar,
-- guardamos por hilo el último timestamp visto + una ventana de hashes recientes
-- (para los mensajes sin fecha). El endpoint /api/reader/ingest lee este cursor,
-- corre planIngest (puro) y lo actualiza. Ver docs/READER_ARCHITECTURE.md.
--
-- ADITIVA, idempotente, RLS por user_id. Lo aplica el runner.
create table if not exists public.reader_threads (
  user_id          uuid not null references auth.users(id) on delete cascade,
  platform         text not null,             -- 'teams' | 'slack' | ...
  thread_id        text not null,             -- id del hilo en la plataforma
  thread_name      text,                      -- nombre visible (para atribuir persona)
  last_ts          timestamptz,               -- cursor incremental
  recent_hashes    text[] not null default '{}', -- ventana de dedup (mensajes sin ts)
  last_ingested_at timestamptz not null default now(),
  primary key (user_id, platform, thread_id)
);

alter table public.reader_threads enable row level security;
drop policy if exists "select own reader_threads" on public.reader_threads;
create policy "select own reader_threads" on public.reader_threads for select using (auth.uid() = user_id);
drop policy if exists "insert own reader_threads" on public.reader_threads;
create policy "insert own reader_threads" on public.reader_threads for insert with check (auth.uid() = user_id);
drop policy if exists "update own reader_threads" on public.reader_threads;
create policy "update own reader_threads" on public.reader_threads for update using (auth.uid() = user_id);
drop policy if exists "delete own reader_threads" on public.reader_threads;
create policy "delete own reader_threads" on public.reader_threads for delete using (auth.uid() = user_id);
