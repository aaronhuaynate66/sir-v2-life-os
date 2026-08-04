-- 0183 — RECETAS: el "a raíz de qué" que le faltaba a la medicación.
--
-- ═══ POR QUÉ ═════════════════════════════════════════════════════════════════
--
-- Aaron, 3-ago-2026, tras la consulta del maxilofacial: *"seria bueno que lleves un
-- control en sir de lo que estoy tomando... ahi deberia de aparecer todas las
-- medicinas que tome en algun momento... quiero todo eso ordenado con fecha y hora,
-- y con una mejora que seria a raiz de la receta que me han dado un recordatorio de
-- esas medicinas por telegram o notificaciones push y el conteo de todas esas
-- medicinas... para tener un super registro historico... y a raiz de que."*
--
-- Lo que había (medido, no supuesto): `med_intakes` con 33 tomas —todas Ergonex,
-- registradas a mano por él— y `med_registry` con 3 medicamentos. O sea: un contador
-- de tomas y un catálogo de "qué es esta pastilla". **Nada más.** Concretamente NO
-- existía: receta, tratamiento con duración, motivo, horario, ni médico. Sin duración
-- ni pauta no hay de dónde salga un recordatorio, y sin motivo el histórico no
-- responde la pregunta que él hace: *¿a raíz de qué tomé esto?*
--
-- El caso que lo motivó: Dr(a) Campos, 3-ago-2026, por "trastornos de la articulación
-- temporomaxilar" (presuntivo) tras una agresión → ORFENADRINA 100 mg y ETORICOXIB
-- 120 mg, 1 cada 24 h por 7 días. Eso es UNA receta con DOS ítems, un motivo y una
-- fecha de fin. Nada de eso caía en el modelo viejo.
--
-- ═══ DECISIONES, PARA NO REDISCUTIRLAS ═══════════════════════════════════════
--
-- 1. **`user_id text`, no `uuid`.** El repo tiene las dos convenciones y esto es
--    fricción real: `med_intakes.user_id` es `uuid` con FK a auth.users, pero
--    `reminders`, `chat_feedback` y `sir_conversations` usan `text`. Se elige `text`
--    porque estas filas se escriben también con service-role (carga retroactiva,
--    crons, ingesta de una receta por Telegram) y ahí no hay `auth.uid()`. El vínculo
--    con las tomas NO necesita join de user_id: cuelga de `prescription_item_id`.
--
-- 2. **La duración vive en el ÍTEM, no solo en la receta.** En una misma receta el
--    antibiótico dura 7 días y el analgésico 3. Ponerla solo arriba obligaría a
--    inventar una duración común. `med_prescriptions.ends_on` queda como el cierre
--    del tratamiento completo (el máximo), y cada ítem lleva su `duration_days`.
--
-- 3. **`indication` guarda el texto LITERAL del médico** ("Tomar 01 cada 24 horas por
--    7 días"). Los campos estructurados (`every_hours`, `times_per_day`) son para que
--    la máquina calcule; el literal es para que Aaron lea lo que de verdad le dijeron
--    y no una interpretación nuestra. Si los dos discrepan, gana el literal.
--
-- 4. **`schedule time[]` es opcional a propósito.** Con el cron corriendo 1×/día
--    (plan Hobby) un "tómalo a las 14:00" con la app cerrada no se entrega a las
--    14:00. Guardar la hora objetivo sirve para el futuro y para mostrarla, pero el
--    aviso de hoy se agrupa en el tick de la mañana. Prometer precisión horaria que
--    la infra no puede dar sería el mismo silencio que este repo ya arrastró.
--
-- 5. **Policy de UPDATE incluida.** `med_intakes` y `med_registry` nacieron sin ella
--    (0089, 0090) y por eso una toma no se puede corregir, solo borrar. No repetir
--    ese hueco: una receta se suspende, se corrige el motivo, se ajusta la fecha.

-- ─── La receta / el tratamiento ──────────────────────────────────────────────
create table if not exists public.med_prescriptions (
  id             text primary key default gen_random_uuid()::text,
  user_id        text not null,
  -- El "a raíz de qué", en las palabras que se entiendan al releerlo en un año.
  reason         text,
  -- El diagnóstico formal si lo hay, separado del motivo en prosa.
  diagnosis      text,
  prescribed_by  text,                       -- el médico
  provider       text,                       -- la clínica / institución
  -- De dónde salió esta fila: importa para saber cuánto confiar en ella.
  source         text not null default 'manual'
                 check (source in ('manual', 'receta', 'correo', 'foto', 'retroactivo')),
  started_on     date not null,
  ends_on        date,                        -- null = sin fin definido (crónico / a demanda)
  status         text not null default 'activa'
                 check (status in ('activa', 'completada', 'suspendida')),
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.med_prescriptions is
  'Receta o tratamiento: agrupa N medicamentos bajo un motivo, un médico y un rango de fechas. Es el "a raíz de qué" del histórico de medicación. Ver 0183.';

-- ─── Cada medicamento de esa receta ──────────────────────────────────────────
create table if not exists public.med_prescription_items (
  id               text primary key default gen_random_uuid()::text,
  prescription_id  text not null references public.med_prescriptions(id) on delete cascade,
  user_id          text not null,
  -- Se enlaza con `med_registry` por NOMBRE, igual que `med_intakes`: sin FK dura,
  -- porque un medicamento recetado puede no estar todavía en el catálogo.
  med_name         text not null,
  dose             text,                     -- "100 mg", "120 mg"
  every_hours      int check (every_hours is null or every_hours between 1 and 168),
  times_per_day    int check (times_per_day is null or times_per_day between 1 and 12),
  duration_days    int check (duration_days is null or duration_days between 1 and 3650),
  total_units      numeric,                  -- la "cantidad total" que dice la receta
  indication       text,                     -- el texto LITERAL del médico
  schedule         time[],                   -- horas objetivo, si se definen
  created_at       timestamptz not null default now()
);

comment on table public.med_prescription_items is
  'Un medicamento dentro de una receta, con su pauta. La duración va acá y no solo en la receta: en una misma receta el antibiótico dura 7 días y el analgésico 3. Ver 0183.';

-- ─── El puente: una toma sabe a qué curso pertenece ──────────────────────────
-- Aditiva y nullable, sin backfill: las 33 tomas de Ergonex que ya existen no
-- pertenecen a ninguna receta y forzarlas a una sería inventar.
alter table public.med_intakes
  add column if not exists prescription_item_id text
  references public.med_prescription_items(id) on delete set null;

comment on column public.med_intakes.prescription_item_id is
  'A qué ítem de receta pertenece esta toma. NULL = toma suelta (a demanda, o anterior a que existieran las recetas).';

-- ─── El puente con los recordatorios ─────────────────────────────────────────
-- `on delete set null` y NO cascade: si se borra la receta, el histórico de avisos
-- que YA se entregaron no se debe borrar — es registro de lo que pasó.
alter table public.reminders
  add column if not exists med_prescription_id text
  references public.med_prescriptions(id) on delete set null;

comment on column public.reminders.med_prescription_id is
  'Recordatorio generado por una receta. Permite borrar en bloque los PENDIENTES si el tratamiento se suspende, sin tocar los ya entregados.';

-- ─── Índices ─────────────────────────────────────────────────────────────────
create index if not exists med_prescriptions_by_user
  on public.med_prescriptions (user_id, started_on desc);
-- Parcial: la consulta caliente es "¿qué tratamiento tengo activo?".
create index if not exists med_prescriptions_activas
  on public.med_prescriptions (user_id, ends_on)
  where status = 'activa';
create index if not exists med_prescription_items_by_presc
  on public.med_prescription_items (prescription_id);
-- Para el progreso del curso ("vas 5 de 7"). El índice viejo (user_id, taken_at)
-- no cubre esta consulta.
create index if not exists med_intakes_by_item
  on public.med_intakes (prescription_item_id, taken_at)
  where prescription_item_id is not null;
create index if not exists reminders_by_prescription
  on public.reminders (med_prescription_id)
  where med_prescription_id is not null;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.med_prescriptions enable row level security;
alter table public.med_prescription_items enable row level security;

drop policy if exists "own prescriptions select" on public.med_prescriptions;
create policy "own prescriptions select" on public.med_prescriptions
  for select using (auth.uid()::text = user_id);
drop policy if exists "own prescriptions insert" on public.med_prescriptions;
create policy "own prescriptions insert" on public.med_prescriptions
  for insert with check (auth.uid()::text = user_id);
drop policy if exists "own prescriptions update" on public.med_prescriptions;
create policy "own prescriptions update" on public.med_prescriptions
  for update using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
drop policy if exists "own prescriptions delete" on public.med_prescriptions;
create policy "own prescriptions delete" on public.med_prescriptions
  for delete using (auth.uid()::text = user_id);

drop policy if exists "own presc items select" on public.med_prescription_items;
create policy "own presc items select" on public.med_prescription_items
  for select using (auth.uid()::text = user_id);
drop policy if exists "own presc items insert" on public.med_prescription_items;
create policy "own presc items insert" on public.med_prescription_items
  for insert with check (auth.uid()::text = user_id);
drop policy if exists "own presc items update" on public.med_prescription_items;
create policy "own presc items update" on public.med_prescription_items
  for update using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
drop policy if exists "own presc items delete" on public.med_prescription_items;
create policy "own presc items delete" on public.med_prescription_items
  for delete using (auth.uid()::text = user_id);

-- El hueco de 0089: sin policy de UPDATE una toma no se puede corregir ni reasignar
-- a un curso. Se cierra acá.
drop policy if exists "own med intakes update" on public.med_intakes;
create policy "own med intakes update" on public.med_intakes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
