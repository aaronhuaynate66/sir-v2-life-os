-- ============================================================
-- SIR V2 — Migration 0146: person_cycles.source += 'chat_inferred'
-- ============================================================
-- Habilita el TERCER escritor de person_cycles: la inferencia PASIVA del
-- ciclo desde el chat de WhatsApp importado (C4). Hasta ahora la fuente era
-- 'aaron' (Aaron lo observa/reporta) o 'self_report' (la persona lo confirma);
-- ambas son DATO EXACTO. 'chat_inferred' es el modelo PROBABILÍSTICO: cuando
-- alguien menciona en el chat "me vino la regla" / "ando con SPM", el import
-- registra un evento de ciclo con confidence='low'.
--
-- Decisión de Aaron (2026-07-13, ADR 0009 + este hilo): SIR corre los DOS
-- modelos en paralelo para mujeres — el exacto (manual/self_report) y el
-- inferido (chat) — y el exacto CALIBRA al inferido (ancla el forecast). El
-- guardrail de #629 ("no preguntar la fecha a no-parejas") se respeta: esto NO
-- pregunta nada, solo usa lo que la gente ya dijo en el chat. El registro se
-- adapta por vínculo (careBond): romance solo con pareja; para otras mujeres es
-- inteligencia de timing/energía neutra, sin intimidad.
--
-- Aditiva, idempotente: dropea y recrea el CHECK constraint de `source`.
-- ============================================================

alter table public.person_cycles
  drop constraint if exists person_cycles_source_check;

alter table public.person_cycles
  add constraint person_cycles_source_check
  check (source in ('aaron', 'self_report', 'chat_inferred'));

-- ============================================================
-- Verificación post-aplicación (SQL Editor):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.person_cycles'::regclass and contype = 'c';
--   -- person_cycles_source_check debe incluir 'chat_inferred'.
-- ============================================================
