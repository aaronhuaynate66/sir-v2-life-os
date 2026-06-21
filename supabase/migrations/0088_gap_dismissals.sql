-- 0088 — Descartes del Knowledge Gap Engine, cross-device.
--
-- POR QUÉ: el "no sé / saltar" de los huecos vivía en localStorage → valía solo
-- por dispositivo (descartabas en la compu y volvía a aparecer en el cel). Esta
-- tabla persiste los descartes por usuario para que valgan en todos lados.
-- Una fila por (user_id, gap_key). RLS por user_id. Lo aplica el runner.

create table if not exists public.gap_dismissals (
  user_id    uuid not null references auth.users(id) on delete cascade,
  gap_key    text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, gap_key)
);

alter table public.gap_dismissals enable row level security;
drop policy if exists "select own gap_dismissals" on public.gap_dismissals;
create policy "select own gap_dismissals" on public.gap_dismissals for select using (auth.uid() = user_id);
drop policy if exists "insert own gap_dismissals" on public.gap_dismissals;
create policy "insert own gap_dismissals" on public.gap_dismissals for insert with check (auth.uid() = user_id);
drop policy if exists "delete own gap_dismissals" on public.gap_dismissals;
create policy "delete own gap_dismissals" on public.gap_dismissals for delete using (auth.uid() = user_id);
