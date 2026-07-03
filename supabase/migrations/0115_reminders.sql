-- ============================================================
-- SIR V2 — Migration 0115: reminders (recordatorios agendados)
-- ============================================================
-- Aaron pidió (03-jul-2026): que desde /relato/ingest pueda decir
-- "recordame en 3 días llamar a X" y SIR lo agenda + dispara push
-- cuando corresponde.
--
-- Un row simple: texto + fecha/hora + estado. Opcional relacionar
-- a persona / objetivo para deep-link.
-- ============================================================

create table if not exists public.reminders (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null,
  text          text not null,
  -- Cuándo debe dispararse. timestamptz para que el cron compare simple.
  due_at        timestamptz not null,
  -- Opcional: persona relacionada (deep-link al hacer click en el push).
  related_person_id text references public.people(id) on delete set null,
  -- Opcional: objetivo relacionado.
  related_goal_id   text,
  -- Cuándo se marcó hecho. NULL = pendiente.
  done_at       timestamptz,
  -- Cuándo se disparó el push (para no re-disparar).
  notified_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists reminders_by_user_pending
  on public.reminders (user_id, due_at) where done_at is null;

create index if not exists reminders_due_notify
  on public.reminders (due_at) where done_at is null and notified_at is null;

-- ─── RLS ────────────────────────────────────────────────────────────
alter table public.reminders enable row level security;

drop policy if exists "select own reminders" on public.reminders;
create policy "select own reminders"
  on public.reminders for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own reminders" on public.reminders;
create policy "insert own reminders"
  on public.reminders for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own reminders" on public.reminders;
create policy "update own reminders"
  on public.reminders for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "delete own reminders" on public.reminders;
create policy "delete own reminders"
  on public.reminders for delete
  using (auth.uid()::text = user_id);
