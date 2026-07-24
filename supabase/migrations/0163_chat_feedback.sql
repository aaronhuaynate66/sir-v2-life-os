-- 0163 — chat_feedback: la señal 👍/👎 del chat, ATRIBUIBLE (Ola 2, slice 2).
--
-- Hoy el 👍/👎 se guarda en `suggestions` con solo `title = pregunta.slice(0,120)`
-- — sin la respuesta ni el contexto que SIR usó → la señal no es aprovechable
-- (no se puede saber A QUÉ respuesta ni con qué grounding se refiere). Esta tabla
-- captura el turno COMPLETO: pregunta + respuesta + contexto usado + rating +
-- corrección. Es el sustrato del harness de eval (golden-set: 👎=negativos,
-- 👍=positivos) y del few-shot desde correcciones. No reemplaza el flujo actual
-- (suggestions sigue alimentando su panel); esto captura en paralelo.
--
-- user_id TEXT (mismo patrón que sir_conversations): permite escribir también
-- bajo service-role (feedback por Telegram a futuro) pasando el owner id.

create table if not exists public.chat_feedback (
  id          text primary key default gen_random_uuid()::text,
  user_id     text not null,
  question    text,                       -- el turno de usuario previo
  answer      text not null,              -- la respuesta de SIR calificada
  rating      text not null check (rating in ('up', 'down')),
  correction  text,                       -- qué esperaba (solo en 👎)
  context     jsonb,                      -- snapshot del grounding: {people, memories, receipts}
  channel     text not null default 'web',
  created_at  timestamptz not null default now()
);

create index if not exists idx_chat_feedback_user_created
  on public.chat_feedback(user_id, created_at desc);
create index if not exists idx_chat_feedback_rating
  on public.chat_feedback(user_id, rating);

alter table public.chat_feedback enable row level security;

drop policy if exists "select own chat_feedback" on public.chat_feedback;
create policy "select own chat_feedback" on public.chat_feedback for select
  using (auth.uid()::text = user_id);
drop policy if exists "insert own chat_feedback" on public.chat_feedback;
create policy "insert own chat_feedback" on public.chat_feedback for insert
  with check (auth.uid()::text = user_id);
drop policy if exists "update own chat_feedback" on public.chat_feedback;
create policy "update own chat_feedback" on public.chat_feedback for update
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
