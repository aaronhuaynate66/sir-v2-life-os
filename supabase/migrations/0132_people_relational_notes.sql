-- 0132 — Notas relacionales por persona: fricción | fortalezas | metas en común.
--
-- CONTEXTO. SIR tenía las columnas `relationships.tensions/strengths/shared_goals`
-- (text[], desde 0001), pero la tabla `relationships` quedó semi-vestigial: NINGÚN
-- flujo moderno de creación de personas la escribe (el seed batch, la captura y el
-- relato-ingest solo crean filas en `people`). Auditado (07-07): la mayoría de las
-- personas reales NO tienen fila en `relationships`, y materializar una fila "bare"
-- para colgar una tensión dispara efectos no deseados (alertas no_contact, dip del
-- peace-score, señales de alineación) porque varios motores usan "existe fila" como
-- guarda. Conclusión: guardar las notas sobre la ENTIDAD CONFIABLE, `people`.
--
-- Esta columna las lleva a `people` como jsonb — MISMO patrón que `people.special_dates`
-- (0010): un campo más de la fila people, persistido por el sync engine vía
-- updatePerson(), sin tabla ni endpoint aparte. Toda persona tiene su fila people,
-- así la feature funciona para TODAS (seed batch incluido).
--
-- Shape: { "tensions": string[], "strengths": string[], "sharedGoals": string[] }.
-- Son anotaciones ESTRATÉGICAS que Aaron carga a mano en la ficha (no derivadas de
-- IA) — inteligencia relacional cruda para que el contacto no sea genérico.
--
-- Aditiva. NOT NULL con default '{}'. Idempotente. Cero backfill: las filas viejas
-- quedan con '{}' (= sin notas) y siguen funcionando igual. Las columnas viejas de
-- `relationships` quedan como estaban (no se tocan ni se dropean).

alter table public.people
  add column if not exists relational_notes jsonb not null default '{}'::jsonb;

comment on column public.people.relational_notes is
  'Notas relacionales estratégicas cargadas a mano: { tensions[], strengths[], sharedGoals[] }. Mismo patrón que special_dates (jsonb en people, vía updatePerson). Reemplaza las columnas vestigiales relationships.tensions/strengths/shared_goals.';

-- Verificación:
-- select count(*) filter (where relational_notes <> '{}'::jsonb) as con_notas from public.people;
