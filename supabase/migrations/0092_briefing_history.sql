-- 0092 — Historial de briefs de IA. El briefing diario era efímero; ahora cada
-- uno que se genera queda guardado para mirar atrás (Aaron quería revisar lo que
-- SIR ya le dijo). kind extensible ('daily' por ahora). RLS por usuario.
create table if not exists public.briefing_history (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null default 'daily',
  content    text not null,
  created_at timestamptz not null default now()
);
alter table public.briefing_history enable row level security;
create index if not exists briefing_history_user_idx on public.briefing_history (user_id, created_at desc);
drop policy if exists "select own briefs" on public.briefing_history;
create policy "select own briefs" on public.briefing_history for select using (auth.uid() = user_id);
drop policy if exists "insert own briefs" on public.briefing_history;
create policy "insert own briefs" on public.briefing_history for insert with check (auth.uid() = user_id);
drop policy if exists "delete own briefs" on public.briefing_history;
create policy "delete own briefs" on public.briefing_history for delete using (auth.uid() = user_id);
