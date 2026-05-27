-- ============================================================
-- SIR V2 — Migration 0003: Currency support (PEN + USD)
-- ============================================================
-- Adds exchange_rate + amount_pen columns to finance_movements,
-- flips default currency to PEN, and reinterprets all existing
-- legacy rows (currency='USD' from the 0001 default) as PEN with
-- rate 1.0. Per session decision: minor historical reinterpretation
-- accepted consciously to avoid an item-by-item TC wizard.
--
-- Apply via Supabase Dashboard → SQL Editor → Run.
-- ============================================================

-- 1. New columns
alter table public.finance_movements
  add column exchange_rate numeric(10,4) not null default 1.0,
  add column amount_pen numeric(14,2);

-- 2. Default currency for NEW rows is PEN
alter table public.finance_movements
  alter column currency set default 'PEN';

-- 3. Backfill: existing rows reinterpreted as PEN
update public.finance_movements
   set currency = 'PEN',
       exchange_rate = 1.0,
       amount_pen = amount
 where amount_pen is null;

-- 4. amount_pen NOT NULL after backfill
alter table public.finance_movements
  alter column amount_pen set not null;

-- 5. Restrict currency to PEN or USD only
alter table public.finance_movements
  add constraint finance_movements_currency_check
  check (currency in ('PEN', 'USD'));

-- 6. Consistency: PEN rows must have rate=1 and amount_pen=amount.
--    USD rows are unconstrained on amount_pen (it's the conversion).
alter table public.finance_movements
  add constraint finance_movements_pen_consistency_check
  check (
    (currency = 'PEN' and exchange_rate = 1.0 and amount_pen = amount)
    or currency = 'USD'
  );
