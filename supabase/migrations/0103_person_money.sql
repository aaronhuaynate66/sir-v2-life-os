-- 0103 — Registro de plata por persona. Préstamos/transferencias/saldos entre
-- Aaron y una persona, con fecha/hora, concepto y dirección. Lo que el chat NO
-- captura (los comprobantes Yape/Plin viven en imágenes); acá queda como dato.
-- direction: 'out' = Aaron→persona (le pasó), 'in' = persona→Aaron (le devolvió).
-- RLS por usuario.
create table if not exists public.person_money (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  person_id    text not null,
  direction    text not null default 'out',        -- 'out' | 'in'
  amount       numeric not null default 0,
  currency     text not null default 'PEN',
  concept      text,
  kind         text not null default 'transfer',   -- 'transfer' | 'loan' | 'balance'
  occurred_on  date,
  occurred_time text,                               -- 'HH:MM' o '12:23 p.m.' libre
  op_ref       text,                                -- nº de operación del comprobante
  settled      boolean not null default false,
  created_at   timestamptz not null default now()
);
alter table public.person_money enable row level security;
create index if not exists person_money_user_person_idx on public.person_money (user_id, person_id);
drop policy if exists "select own person_money" on public.person_money;
create policy "select own person_money" on public.person_money for select using (auth.uid() = user_id);
drop policy if exists "insert own person_money" on public.person_money;
create policy "insert own person_money" on public.person_money for insert with check (auth.uid() = user_id);
drop policy if exists "update own person_money" on public.person_money;
create policy "update own person_money" on public.person_money for update using (auth.uid() = user_id);
drop policy if exists "delete own person_money" on public.person_money;
create policy "delete own person_money" on public.person_money for delete using (auth.uid() = user_id);
