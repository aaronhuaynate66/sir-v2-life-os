-- ============================================================
-- SIR V2 — Migration 0068: métrica medible en objective_steps (E4 · KR numéricos)
-- ============================================================
-- Da a un Resultado Clave (kind='key_result') una métrica numérica opcional:
-- valor actual / meta / unidad (ej. "ahorrar S/5000, vas S/3200 → 64%"). Cuando
-- metric_target > 0, el progreso del KR se calcula como current/target (tiene
-- prioridad sobre el rollup de tareas). Sin métrica, el comportamiento previo
-- (rollup de tareas / status) se mantiene.
--
-- ADITIVA + idempotente. NO aplicar a mano: el runner (CI) ya está activo.
-- ============================================================

alter table public.objective_steps add column if not exists metric_target  numeric;
alter table public.objective_steps add column if not exists metric_current numeric;
alter table public.objective_steps add column if not exists metric_unit    text;
