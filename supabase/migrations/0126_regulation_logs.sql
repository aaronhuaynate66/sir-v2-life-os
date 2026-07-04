-- SIR V2 — Registro de regulación emocional (13·M4): aprender qué te funciona.
--
-- La ventana (M1) sugiere una estrategia (M2). Acá registramos cuál APLICASTE y
-- si te AYUDÓ, para que con suficientes repeticiones SIR diga "para vos, X suele
-- ayudar más que Y" — patrón observado personal, NO ley general. Empieza
-- insufficient y solo afirma cuando el n personal lo sostiene.

create table if not exists public.regulation_logs (
  id          text primary key default gen_random_uuid()::text,
  user_id     uuid not null references auth.users(id) on delete cascade,
  strategy    text not null,            -- response_modulation | reappraisal | other
  note        text,
  helped      text,                     -- yes | somewhat | no  (nullable = sin calificar aún)
  applied_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists regulation_logs_user_idx on public.regulation_logs (user_id, applied_at desc);

alter table public.regulation_logs enable row level security;
create policy "select own regulation_logs" on public.regulation_logs for select using (auth.uid() = user_id);
create policy "insert own regulation_logs" on public.regulation_logs for insert with check (auth.uid() = user_id);
create policy "update own regulation_logs" on public.regulation_logs for update using (auth.uid() = user_id);
create policy "delete own regulation_logs" on public.regulation_logs for delete using (auth.uid() = user_id);
