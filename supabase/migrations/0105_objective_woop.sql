-- 0105 — Objetivo: Obstáculo + Plan si-entonces (WOOP / MCII). La pieza con más
-- evidencia para que un objetivo se cumpla (Oettingen/Gollwitzer, d≈0.65):
-- nombrar el obstáculo principal + un plan "si pasa X, entonces hago Y".
-- Vive en objective_plan (1 por objetivo, ya existe). Aditiva + idempotente.
alter table public.objective_plan add column if not exists obstacle  text;
alter table public.objective_plan add column if not exists plan_if   text;
alter table public.objective_plan add column if not exists plan_then text;
