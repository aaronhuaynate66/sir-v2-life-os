-- 0158 — person_daily_signals.affection / positivity_ratio: señal de AFECTO EXPRESADO.
--
-- Índice de Afecto Expresado (IAE, docs/research/indice-afecto-relacional.md). General:
-- para CUALQUIER persona, mide la densidad diaria de expresiones afectivas/positivas
-- (0..1) + un ratio de positividad estilo Gottman. Dimensión SEPARADA del compuesto
-- conductual (que es fricción/retiro/etc.). Disparador de conversación, no veredicto.
-- Aditivo, nullable → filas viejas quedan en NULL hasta el próximo import/forecast.

alter table public.person_daily_signals
  add column if not exists affection       numeric,
  add column if not exists positivity_ratio numeric;

comment on column public.person_daily_signals.affection is
  'Afecto expresado por la persona ese día: densidad 0..1 (IAE). Aditivo, no entra al compuesto conductual. Ver lib/forecast-conductual/affection.ts.';
comment on column public.person_daily_signals.positivity_ratio is
  'Ratio de positividad estilo Gottman (A+1)/(N+1) del día. Contexto, ≥0.';
