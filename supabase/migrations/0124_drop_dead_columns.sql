-- SIR V2 — Auditoría de data muerta (2026-07-04): descarte de columnas vacías.
--
-- Descarta SOLO las 3 columnas PROVADAMENTE VACÍAS: ningún código las escribió
-- nunca (cero data que perder), solo ocupaban el esquema y confundían. Verificado
-- a mano (cero writers en todo src/).
--
-- IMPORTANTE — NO se tocan las columnas que SÍ guardan data tuya, aunque el
-- inventario las marcó "sin uso": detector_data (output del detector en cada
-- captura), person_money.op_ref, med_registry.note, person_cycles.source,
-- person_synthesis.input_tokens/output_tokens/generated_reason, y la incierta
-- daily_briefs.narrative (el export la lee; puede tener texto en filas viejas).
-- Descartar ésas sería pérdida real e irreversible.

alter table public.memories        drop column if exists quality_score;       -- huérfana (mig 0010): nunca escrita ni leída
alter table public.journal_entries drop column if exists mentioned_goal_ids;  -- nunca escrita: solo vivía en el SELECT/interface
alter table public.observations    drop column if exists user_edits;          -- huérfana (mig 0010): cero escritores
