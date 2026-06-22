-- 0091 — "Momentos / Decisiones": eventos relacionales con ESTADO. A diferencia
-- de person_logs (interacción puntual) u observations (captura), esto registra
-- algo que pasó y queda ABIERTO hasta que se resuelve — una decisión pendiente
-- ("le propuse mudarse, lo está pensando"), un hito, una conversación clave.
-- SIR lo trae al brief/día-X mientras siga 'abierto'. RLS por usuario.
create table if not exists public.relationship_moments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  person_id      uuid not null,
  title          text not null,
  detail         text,
  status         text not null default 'abierto',   -- 'abierto' | 'resuelto'
  occurred_on    date not null default (now() at time zone 'America/Lima')::date,
  follow_up_on   date,
  resolution     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.relationship_moments enable row level security;
create index if not exists relationship_moments_user_person_idx
  on public.relationship_moments (user_id, person_id, occurred_on desc);
create index if not exists relationship_moments_user_status_idx
  on public.relationship_moments (user_id, status, follow_up_on);

drop policy if exists "select own moments" on public.relationship_moments;
create policy "select own moments" on public.relationship_moments for select using (auth.uid() = user_id);
drop policy if exists "insert own moments" on public.relationship_moments;
create policy "insert own moments" on public.relationship_moments for insert with check (auth.uid() = user_id);
drop policy if exists "update own moments" on public.relationship_moments;
create policy "update own moments" on public.relationship_moments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "delete own moments" on public.relationship_moments;
create policy "delete own moments" on public.relationship_moments for delete using (auth.uid() = user_id);
