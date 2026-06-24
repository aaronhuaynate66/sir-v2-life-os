-- 0099 — Consumo de IA (#125). La API de Anthropic NO expone saldo restante,
-- pero cada respuesta trae usage (input/output tokens). Logueamos ESE consumo
-- propio por feature → dashboard "cuánto gastó SIR" para anticipar la recarga.
-- Append-only, RLS por usuario.
create table if not exists public.ai_usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  feature       text not null,
  model         text,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  created_at    timestamptz not null default now()
);
alter table public.ai_usage enable row level security;
create index if not exists ai_usage_user_time_idx on public.ai_usage (user_id, created_at desc);

drop policy if exists "select own ai_usage" on public.ai_usage;
create policy "select own ai_usage" on public.ai_usage for select using (auth.uid() = user_id);
drop policy if exists "insert own ai_usage" on public.ai_usage;
create policy "insert own ai_usage" on public.ai_usage for insert with check (auth.uid() = user_id);
