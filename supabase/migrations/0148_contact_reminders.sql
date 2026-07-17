-- ============================================================
-- SIR V2 — Migration 0148: contact_reminders (recordar antes de contactar)
-- ============================================================
-- Diferenciador #3 del benchmark (jul-2026): repetición espaciada RELACIONAL.
-- A diferencia de `reminders` (time-based: "recordame en 3 días"), esto se
-- dispara por EVENTO — antes de tu PRÓXIMO contacto con la persona:
--   "prometiste mandarle el contacto de X" (once → se marca hecho tras usarlo)
--   "pregúntale siempre por su mamá enferma" (standing → contexto permanente)
-- SIR lo resurge en el momento justo (ficha "antes de contactar", nudge).
-- ============================================================

create table if not exists public.contact_reminders (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null,
  person_id     text not null references public.people(id) on delete cascade,
  text          text not null,
  -- 'once' = compromiso puntual (se marca hecho); 'standing' = contexto que
  -- querés recordar antes de CADA contacto (no se auto-cierra).
  kind          text not null default 'once' check (kind in ('once', 'standing')),
  status        text not null default 'pending' check (status in ('pending', 'done')),
  created_at    timestamptz not null default now(),
  done_at       timestamptz,
  -- Última vez que SIR te lo mostró (para futura lógica de espaciado suave).
  last_surfaced_at timestamptz
);

create index if not exists contact_reminders_pending_by_person
  on public.contact_reminders (user_id, person_id) where status = 'pending';

-- ─── RLS ────────────────────────────────────────────────────────────
alter table public.contact_reminders enable row level security;

drop policy if exists "select own contact_reminders" on public.contact_reminders;
create policy "select own contact_reminders"
  on public.contact_reminders for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own contact_reminders" on public.contact_reminders;
create policy "insert own contact_reminders"
  on public.contact_reminders for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own contact_reminders" on public.contact_reminders;
create policy "update own contact_reminders"
  on public.contact_reminders for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "delete own contact_reminders" on public.contact_reminders;
create policy "delete own contact_reminders"
  on public.contact_reminders for delete
  using (auth.uid()::text = user_id);
