-- ============================================================
-- SIR V2 — Migration 0144: sir_pending_actions (captura de notas por chat)
-- ============================================================
-- Cuando SIR (por Telegram) detecta que Aaron DICTÓ una nota/acción (ej.
-- "anota que hablé con Pablo, quiere avanzar"), NO escribe en silencio: propone
-- la acción y espera confirmación por botones inline. Entre el mensaje y el tap
-- del botón hay dos invocaciones serverless distintas → la acción propuesta se
-- persiste acá, referenciada por su id en el callback_data del botón.
--
-- Efímera por naturaleza (se borra al confirmar/descartar). Aditiva, RLS
-- owner-only (el webhook usa service-role y la filtra por user_id a mano igual).
-- Fail-open: si la tabla no existe aún, la captura degrada a Q&A (no rompe).
-- ============================================================

create table if not exists public.sir_pending_actions (
  id          text primary key default gen_random_uuid()::text,
  user_id     text not null,
  action      jsonb not null,          -- ProposedActionResolved serializada
  created_at  timestamptz not null default now()
);

create index if not exists idx_sir_pending_actions_user
  on public.sir_pending_actions(user_id, created_at desc);

alter table public.sir_pending_actions enable row level security;

drop policy if exists "select own sir_pending_actions" on public.sir_pending_actions;
create policy "select own sir_pending_actions"
  on public.sir_pending_actions for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own sir_pending_actions" on public.sir_pending_actions;
create policy "insert own sir_pending_actions"
  on public.sir_pending_actions for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "delete own sir_pending_actions" on public.sir_pending_actions;
create policy "delete own sir_pending_actions"
  on public.sir_pending_actions for delete
  using (auth.uid()::text = user_id);

comment on table public.sir_pending_actions is
  'Acción propuesta por SIR esperando confirmación del usuario (captura de notas por chat, mig 0144). Efímera: se borra al confirmar/descartar. Ver src/lib/sir/pendingActions.ts.';
