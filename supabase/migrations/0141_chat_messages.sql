-- 0141 — chat_messages: sustrato canónico del chat, a nivel MENSAJE.
--
-- El problema que resuelve: hasta ahora un export de WhatsApp se destilaba a UNA
-- observación con RESUMEN + una muestra de los últimos 1000 mensajes clipeados a
-- 300 chars, y el chat crudo se tiraba. Cada motor (síntesis, forecast, ensayo,
-- calendario) leía un shard derivado distinto; no existía el hilo real que varias
-- aristas pudieran consultar, ni forma de correr algoritmos/probabilística sobre
-- la serie de mensajes reales sin pasar por un LLM.
--
-- Esta tabla es la FUENTE ÚNICA: cada mensaje entero (texto completo, sin clipear),
-- append-only, incremental (subís un export más largo → solo se agrega el delta),
-- dedupe idempotente por `id` (hash determinístico de persona+fuente+fecha+emisor+texto).
-- Sobre ella se construyen las destilaciones (Fase B) — algoritmos primero, LLM al final.
--
-- Aditivo: no toca nada existente. RLS por dueño. Ver src/lib/chat-messages.

create table if not exists public.chat_messages (
  id          text primary key,                                   -- hash determinístico → dedupe idempotente
  user_id     uuid not null references auth.users(id) on delete cascade,
  person_id   text not null references public.people(id) on delete cascade,
  source      text not null default 'whatsapp',                   -- whatsapp | reader | channel
  sender      text not null,                                      -- 'user' (dueño) | 'other' (la persona)
  author_name text,                                               -- nombre crudo del participante (trazabilidad)
  sent_at     timestamptz,                                        -- fecha+hora del mensaje (null si no es resoluble)
  content     text not null,                                      -- texto COMPLETO del mensaje, sin clipear
  is_media    boolean not null default false,                    -- adjunto/omitido de media ("[media]")
  created_at  timestamptz not null default now()
);

-- El índice principal: leer el hilo de una persona en orden cronológico (ventanas
-- por fecha para ciclo/forecast/ensayo). user_id primero para aislar por dueño.
create index if not exists chat_messages_person_sent_idx
  on public.chat_messages (user_id, person_id, sent_at);

alter table public.chat_messages enable row level security;
create policy "select own chat_messages" on public.chat_messages for select using (auth.uid() = user_id);
create policy "insert own chat_messages" on public.chat_messages for insert with check (auth.uid() = user_id);
create policy "update own chat_messages" on public.chat_messages for update using (auth.uid() = user_id);
create policy "delete own chat_messages" on public.chat_messages for delete using (auth.uid() = user_id);

comment on table public.chat_messages is
  'Sustrato canónico del chat a nivel mensaje (texto completo, append-only, dedupe por id). Fuente única para todos los motores. Ver src/lib/chat-messages.';
