-- SIR V2 — ai_usage: latencia + estado por intento (router auto-ajustable).
-- Habilita medir salud de proveedores (p50 latencia + tasa de éxito) para que
-- el router degrade a los lentos/caídos. Filas viejas quedan válidas (status ok).

ALTER TABLE ai_usage
  ADD COLUMN IF NOT EXISTS latency_ms integer,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ok';

-- Consulta típica del router: últimas filas por fecha.
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage (created_at DESC);
