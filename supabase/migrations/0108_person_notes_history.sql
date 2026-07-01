-- 0108 — Historial versionado del campo `people.notes`.
--
-- CONTEXTO. Hasta hoy, `people.notes` era un texto libre que se SOBREESCRIBÍA
-- en cada edit. Aaron cargó info sobre Mariana ayer (30 jun: "vino a entrevista
-- + ganó el puesto + empieza 13 jul") y no la ve en su ficha porque el texto
-- que estaba antes se piso. No hay forma de "qué anoté sobre esta persona y
-- cuándo".
--
-- Esta migración cierra el gap:
--   1. Tabla `person_notes_history` con snapshots del texto ANTERIOR cada
--      vez que `notes` cambia.
--   2. Trigger `BEFORE UPDATE ON people` que dispara el snapshot automático.
--      Server-side y silencioso — no hace falta que el cliente cablee nada.
--
-- La Bitácora en la ficha va a listar estos snapshots como entries del
-- timeline ("Notas editadas · hace 2h · '<snippet>'").
--
-- Aditiva. Idempotente. NO retroactiva (la nota actual queda como está; el
-- historial empieza a acumular desde este punto).

create table if not exists public.person_notes_history (
  id           text primary key default gen_random_uuid()::text,
  user_id      uuid not null references auth.users(id) on delete cascade,
  person_id    text not null references public.people(id) on delete cascade,
  /** Texto del `notes` ANTERIOR (el que estaba antes del edit que disparó
   *  este snapshot). Puede ser NULL si el campo estaba vacío. */
  snapshot     text,
  /** Longitud del snapshot para queries rápidas del "cuánto se escribió". */
  snapshot_len integer generated always as (coalesce(char_length(snapshot), 0)) stored,
  /** Timestamp del cambio (cuándo se sobreescribió el snapshot anterior). */
  changed_at   timestamptz not null default now(),
  /** Origen del cambio (para leer en la bitácora):
   *   - 'inline_edit' — el usuario editó la card de identidad en la ficha
   *   - 'router'      — /relato ejecutó una acción que editó notes
   *   - 'seed_batch'  — /captura/batch aplicó un batch JSON
   *   - 'sync'        — pull remoto sobrescribió (raro, pero puede pasar)
   *   - 'unknown'     — default si el trigger no puede inferirlo */
  change_source text not null default 'unknown'
);

create index if not exists idx_person_notes_history_person
  on public.person_notes_history (user_id, person_id, changed_at desc);

alter table public.person_notes_history enable row level security;

drop policy if exists "select own person_notes_history" on public.person_notes_history;
create policy "select own person_notes_history" on public.person_notes_history
  for select using (auth.uid() = user_id);

drop policy if exists "insert own person_notes_history" on public.person_notes_history;
create policy "insert own person_notes_history" on public.person_notes_history
  for insert with check (auth.uid() = user_id);

-- No update/delete policies: el historial es INMUTABLE (fuente de verdad
-- de "qué escribí y cuándo"). Si por algún caso Aaron necesita borrar una
-- entrada, va vía service_role.

-- ─── Trigger: snapshot automático BEFORE UPDATE ON people ─────────
--
-- Se dispara SOLO cuando `notes` cambió (IS DISTINCT FROM cubre NULL).
-- Guarda el `OLD.notes` (lo que va a dejar de existir) con change_source
-- por defecto 'unknown' — la UI puede setear `set_config('sir.change_source', 'inline_edit', true)`
-- antes del UPDATE para que quede tageado. Sin ese set, queda 'unknown'
-- (aún así el snapshot se guarda, no se pierde el historial).

create or replace function public.snapshot_person_notes() returns trigger
language plpgsql security definer as $$
declare
  src text;
begin
  if NEW.notes is distinct from OLD.notes then
    -- Leer el source seteado por el cliente (si lo hizo). Fail-safe si no.
    begin
      src := current_setting('sir.change_source', true);
    exception when others then
      src := null;
    end;
    insert into public.person_notes_history (user_id, person_id, snapshot, change_source)
    values (
      OLD.user_id,
      OLD.id,
      OLD.notes,
      coalesce(nullif(src, ''), 'unknown')
    );
  end if;
  return NEW;
end $$;

drop trigger if exists person_notes_snapshot_before_update on public.people;
create trigger person_notes_snapshot_before_update
  before update on public.people
  for each row execute function public.snapshot_person_notes();

-- ─── Verificación (pegar en SQL Editor) ────────────────────────────
--
-- -- El trigger existe:
-- select tgname from pg_trigger where tgname = 'person_notes_snapshot_before_update';
--
-- -- Simular un edit (ajustá person_id):
-- update people set notes = notes || ' [test]' where id = '<person_id>';
-- select id, snapshot, snapshot_len, changed_at, change_source
-- from person_notes_history where person_id = '<person_id>' order by changed_at desc limit 5;
