-- ============================================================
-- SIR V2 — Migration 0004: Timeline indexes (Fase 3a Issue #71)
-- ============================================================
-- Indices necesarios para las queries cursor-based de /timeline en las
-- 4 tablas que NO tenian indice por su columna temporal canonica.
--
-- Las tablas memories, self_metrics, health_metrics, sleep_records,
-- finance_movements ya cuentan con indices de timestamp (creados en 0001).
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
-- (Mismo flujo que migrations 0001/0002/0003. NO se aplica via CI.)
-- ============================================================

-- ─── signals: order by detected_at desc ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_signals_user_detected_at
  ON public.signals(user_id, detected_at DESC);

-- ─── goals: filtros por created_at o updated_at (con .or) ───────────
CREATE INDEX IF NOT EXISTS idx_goals_user_updated_at
  ON public.goals(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_goals_user_created_at
  ON public.goals(user_id, created_at DESC);

-- ─── people: order by created_at desc (eventos "agregaste a X") ────
CREATE INDEX IF NOT EXISTS idx_people_user_created_at
  ON public.people(user_id, created_at DESC);

-- ─── relationships: order by updated_at desc ───────────────────────
CREATE INDEX IF NOT EXISTS idx_relationships_user_updated_at
  ON public.relationships(user_id, updated_at DESC);

-- ============================================================
-- Verificacion post-aplicacion. Pegar en SQL Editor y correr:
-- ============================================================
-- SELECT schemaname, tablename, indexname
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
--
-- Resultado esperado: las 5 entradas listadas arriba presentes.
