-- ============================================================
-- SIR V2 — Migration 0031: gasto por intención en finance_movements (P1)
-- ============================================================
-- Agrega la "intención" del gasto, ORTOGONAL a la categoría:
--   - category : qué se compró (vivienda/comida/transporte/…)  [ya existe]
--   - intent   : cuán prescindible era (obligatorio/necesario/no_esencial) [nuevo]
--
-- Es el dato accionable para ver el "gasto hormiga" y habilitar la correlación
-- emocional↔financiera (P3: estrés↑ → gasto no-esencial↑).
--
-- Solo se setea en salidas de dinero (expense/debt) desde la UI; el resto de
-- movimientos lo dejan null y simplemente no entran al desglose por intención.
--
-- ADITIVA, no-destructiva, idempotente. NO toca datos existentes. La RLS de
-- finance_movements (policies por user_id de 0001) ya cubre la columna nueva
-- → no hay que tocar policies.
--
-- ACCIÓN: aplicar vía el runner (CI `supabase db push`) o, mientras no esté
-- activado, manualmente en el SQL Editor de Supabase. El cliente es tolerante:
-- hasta que corras esto, intent simplemente no persiste (el upsert lo incluye
-- pero la columna ausente lo ignora — el resto del movimiento sí se guarda).
-- ============================================================

alter table public.finance_movements
  add column if not exists intent text
  check (intent is null or intent in ('obligatorio', 'necesario', 'no_esencial'));

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='finance_movements'
--     and column_name='intent';
-- ============================================================
