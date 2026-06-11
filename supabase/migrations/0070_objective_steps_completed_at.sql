-- ============================================================
-- SIR V2 — Migration 0070: fecha real de completado en objective_steps
-- ============================================================
-- Marca CUÁNDO se completó un paso/tarea (status 'hecho'). Antes el calendario
-- ubicaba las tareas hechas en su fecha OBJETIVO (proxy); con esto las ubica en
-- el día real en que las terminaste ("qué se hizo"). Si falta (data vieja), se
-- cae al proxy de la fecha objetivo — degrada limpio.
--
-- ADITIVA + idempotente. NO aplicar a mano: el runner (CI) ya está activo.
-- ============================================================

alter table public.objective_steps add column if not exists completed_at timestamptz;
