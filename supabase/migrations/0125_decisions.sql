-- SIR V2 — Decisiones persistidas (14·M5): outside view contra la planning fallacy.
--
-- /decidir evaluaba decisiones y las tiraba. Para traer "algo parecido en marzo:
-- elegiste hold y funcionó/te arrepentiste" hay que GUARDARLAS y capturar su
-- resultado en el tiempo. Dedupe por título normalizado (re-evaluar la misma
-- decisión la ACTUALIZA, no duplica). El resultado (outcome) se backfillea después.

create table if not exists public.decisions (
  id          text primary key default gen_random_uuid()::text,
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- Título normalizado (lower/trim) para no duplicar la misma decisión.
  dedupe_key  text not null,
  title       text not null,
  description text,
  verdict     text not null,            -- go | caution | hold
  weighted    numeric,
  top_risk    text,                     -- label de la dimensión de mayor riesgo
  outcome     text,                     -- cómo salió (backfill posterior)
  outcome_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index if not exists decisions_user_created_idx on public.decisions (user_id, created_at desc);

alter table public.decisions enable row level security;
create policy "select own decisions" on public.decisions for select using (auth.uid() = user_id);
create policy "insert own decisions" on public.decisions for insert with check (auth.uid() = user_id);
create policy "update own decisions" on public.decisions for update using (auth.uid() = user_id);
create policy "delete own decisions" on public.decisions for delete using (auth.uid() = user_id);
