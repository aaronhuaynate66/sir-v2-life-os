-- 0174 — Ejercicios de una sesión: series, reps y CARGA.
--
-- POR QUÉ (salió del research de #993, y pesa desde hoy). `training_sessions`
-- (0169) guarda tipo, duración, intensidad y notas — pero NO el peso levantado.
-- Sin carga no se puede responder la pregunta que decide el Mundial de Aaron:
--
--   Su categoría es 80 kg+ y su estrategia DECIDIDA es recomponer (más músculo,
--   mismo peso), no bajar. Para saber si eso está pasando hay que ver si la carga
--   sube. "Entrené fuerza 60 min, intensidad alta" no lo dice: se puede entrenar
--   fuerza tres meses moviendo siempre el mismo peso y no ganar nada.
--
-- El bloque 1 (BASE, fuerza pesada 3×/semana) arrancó el 28-jul y quedan ~14
-- semanas. Medir la progresión ahora o perder la ventana.
--
-- MODELO: una fila por EJERCICIO por sesión, con las series como jsonb
-- ([{reps, kg}, …]). Es como se dicta de verdad ("banca 3x12 con 80") y deja
-- consultar un ejercicio a través del tiempo —que es lo que la progresión
-- necesita— sin explotar en una fila por serie.
--
-- El volumen (Σ series × reps × kg) NO se guarda: se deriva en
-- `lib/entrenamiento/ejercicios.ts`. Un dato calculado que se persiste es un dato
-- que se desincroniza.

create table if not exists public.training_exercises (
  id           text primary key default gen_random_uuid()::text,
  user_id      text not null,
  session_id   text not null references public.training_sessions(id) on delete cascade,

  /** Nombre tal como lo dijo Aaron ("press banca", "sentadilla"). */
  name         text not null,
  /** Nombre normalizado (minúsculas, sin tildes) → agrupa el mismo ejercicio
   *  escrito distinto entre sesiones. Es la clave de la progresión. */
  name_key     text not null,

  /** Series: [{"reps": 12, "kg": 80}, …]. Una entrada por serie. */
  sets         jsonb not null default '[]'::jsonb,
  /** 'kg' | 'lb'. Se guarda como lo dijo; la comparación normaliza a kg. */
  unit         text not null default 'kg' check (unit in ('kg', 'lb')),

  /** Peso corporal / sin carga (dominadas, fondos): el volumen no aplica igual. */
  bodyweight   boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now()
);

-- La consulta de progresión: "¿cómo viene mi banca?" → por usuario y ejercicio.
create index if not exists idx_training_ex_user_key
  on public.training_exercises(user_id, name_key, created_at desc);
create index if not exists idx_training_ex_session
  on public.training_exercises(session_id);

alter table public.training_exercises enable row level security;

drop policy if exists "select own training_exercises" on public.training_exercises;
create policy "select own training_exercises" on public.training_exercises for select
  using (auth.uid()::text = user_id);
drop policy if exists "insert own training_exercises" on public.training_exercises;
create policy "insert own training_exercises" on public.training_exercises for insert
  with check (auth.uid()::text = user_id);
drop policy if exists "update own training_exercises" on public.training_exercises;
create policy "update own training_exercises" on public.training_exercises for update
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
drop policy if exists "delete own training_exercises" on public.training_exercises;
create policy "delete own training_exercises" on public.training_exercises for delete
  using (auth.uid()::text = user_id);
