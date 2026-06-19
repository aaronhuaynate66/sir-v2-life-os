-- 0086 — Archivo del historial CRUDO de conversación por persona (bitácora 1).
--
-- POR QUÉ: el import de WhatsApp consolida en una observación pero DESCARTA el
-- texto crudo (_chat.txt) → no hay "registro completo" ni búsqueda dentro del
-- historial. Esta tabla guarda el crudo (un archivo por persona+fuente, se
-- reemplaza con el export más completo) para poder BUSCAR por texto/fecha.
-- El timeline de eventos ya existe (Bitacora.tsx); esto es la capa de crudo.
--
-- NOTA: raw_text se capa en el cliente/route (~3MB, tramo más reciente) para no
-- pegar contra el límite de body serverless. El archivo full de chats enormes
-- vía Storage bucket queda como follow-up. RLS por user_id. Lo aplica el runner.

create table if not exists public.conversation_archives (
  id            text primary key default gen_random_uuid()::text,
  user_id       uuid not null references auth.users(id) on delete cascade,
  person_id     text not null,
  source        text not null default 'whatsapp',
  date_first    text,
  date_last     text,
  message_count integer,
  content_hash  text,
  raw_text      text not null,
  truncated     boolean not null default false,
  updated_at    timestamptz not null default now()
);

create unique index if not exists uniq_conv_archive_user_person_source
  on public.conversation_archives (user_id, person_id, source);

alter table public.conversation_archives enable row level security;
drop policy if exists "select own conv_archives" on public.conversation_archives;
create policy "select own conv_archives" on public.conversation_archives for select using (auth.uid() = user_id);
drop policy if exists "insert own conv_archives" on public.conversation_archives;
create policy "insert own conv_archives" on public.conversation_archives for insert with check (auth.uid() = user_id);
drop policy if exists "update own conv_archives" on public.conversation_archives;
create policy "update own conv_archives" on public.conversation_archives for update using (auth.uid() = user_id);
