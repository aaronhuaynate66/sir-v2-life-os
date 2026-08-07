-- 0185 — `med_intakes.dose_slot`: QUÉ dosis se tomó, no cuándo se tocó el botón.
--
-- ═══ EL BUG QUE CIERRA, MEDIDO EL 6-ago-2026 ═════════════════════════════════
--
-- Aaron: *"hoy solo tomé clonazepam y topiramato, le marqué pero no parece que haya
-- cambiado algo, no sé si quedó bien registrado"*. Tenía razón, y la cadena era:
--
--   1. 06:32 — `reminders-due` preguntó "¿Tomaste la de ANOCHE (22:00)?" (la del 5-ago).
--   2. 09:31 — tocó "Todas (4)". Se guardó `taken_at = ahora` = **6-ago** 09:31.
--      La dosis del 5 quedó escrita en el día 6.
--   3. 21:22 — `evening-push` le dijo **"22:00 — ya registraste todo lo de esta toma"**
--      con las 4 en ✓, porque el candado de idempotencia era (ítem, DÍA) y el día 6
--      ya tenía filas. La dosis real del 6 quedó BLOQUEADA como duplicado.
--
-- Resultado: el registro decía 4 dosis el 6-ago cuando tomó 2, y no tenía la del 5.
--
-- La raíz es que `taken_at` respondía "¿cuándo tocó el botón?" y nadie guardaba
-- "¿QUÉ dosis es ésta?". Son dos preguntas distintas y hacían falta las dos.
--
-- ═══ Y AHORA HAY UN CASO QUE LO EXIGE ════════════════════════════════════════
--
-- El 6-ago se registró su suplemento de calcio (`presci_solgar_camgzn`): **2 tomas
-- por día**, desayuno y almuerzo. Con el candado por DÍA, marcar el del desayuno
-- habría hecho aparecer el del almuerzo como "ya registrado". El bug latente dejó de
-- ser latente.
--
-- `dose_slot` es la ETIQUETA de la toma en hora de Lima ('2026-08-03T08:00'), no un
-- instante: no lleva offset porque no es un momento, es "la toma de las 08:00 del 3".
-- Texto y no timestamptz justamente para que nadie la convierta de zona.

alter table public.med_intakes
  add column if not exists dose_slot text;

comment on column public.med_intakes.dose_slot is
  'Etiqueta de la toma en hora de Lima: YYYY-MM-DDTHH:MM. Identifica QUÉ dosis es, '
  'a diferencia de taken_at que dice cuándo se registró. NULL en las filas viejas y '
  'en las cargas manuales sin pauta.';

-- ═══ LA IDEMPOTENCIA, EN LA BASE Y NO SOLO EN EL CÓDIGO ══════════════════════
--
-- "Dos taps no son dos dosis" era una comprobación en la app (leer y después
-- insertar), que con dos taps casi simultáneos puede duplicar. Acá queda garantizado.
--
-- Índice PARCIAL a propósito: Postgres trata cada NULL como distinto, así que sin el
-- `where` las filas viejas (dose_slot NULL) no chocarían igual — pero el parcial deja
-- explícito que la garantía aplica solo a las tomas CON pauta, y no le pone un índice
-- inútil a las 33 cargas manuales de Ergonex.
create unique index if not exists uq_med_intakes_slot
  on public.med_intakes (user_id, prescription_item_id, dose_slot)
  where dose_slot is not null and prescription_item_id is not null;

-- ── BACKFILL de las filas que YA tienen pauta ────────────────────────────────
--
-- Solo las 6 filas con `prescription_item_id` (las de Telegram, ya corregidas a mano
-- el 6-ago). Para ellas `taken_at` ES el instante de la pauta, así que el slot se
-- deriva sin inventar nada: se pasa a hora de Lima y se corta a la hora.
--
-- Las 33 de Ergonex quedan en NULL a propósito: son cargas manuales de un
-- medicamento a demanda (sin `schedule`), no tienen "toma del día" a la que pertenecer.
update public.med_intakes
   set dose_slot = to_char(taken_at at time zone 'America/Lima', 'YYYY-MM-DD"T"HH24:MI')
 where prescription_item_id is not null
   and dose_slot is null;
