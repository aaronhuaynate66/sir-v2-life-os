-- SIR V2 — 0178: un paso de objetivo puede quedar DESCARTADO.
--
-- POR QUÉ (decisión de Aaron, 30-jul-2026: "cierra los 39 pasos, ese trato ya no
-- va"). El objetivo "Cerrar Boticas Jhodaal como cliente de Marlab" tenía 20 pasos
-- fechados, todos en 'pendiente', de un acuerdo que nunca se firmó: Dayana siguió
-- con otra gente el 17-jul. Había que sacarlos del plan, y los dos estados que
-- existían mentían:
--
--   · 'hecho'     → el rollup daría 100% de un proyecto que nunca arrancó.
--   · 'pendiente' → quedan vencidos para siempre y siguen contando como deuda.
--
-- Un descartado está CERRADO SIN HABERSE HECHO. No cuenta ni en el numerador ni en
-- el denominador del avance (ver computeGoalAdvance), no es "próxima hoja"
-- (nextPendingLeaf), no vence en el brief y no se agenda.
--
-- El vocabulario ya existía en el repo: `experiments.status` usa
-- 'activo' | 'hecho' | 'descartado' desde antes.

do $$
declare
  v_con text;
begin
  -- Se busca el constraint por su DEFINICIÓN y no por su nombre: el original de la
  -- 0040 es inline, así que lo nombró Postgres. Si el nombre no fuera el esperado,
  -- un `drop constraint <nombre>` se saltaría, el viejo seguiría rechazando
  -- 'descartado' y la migración pasaría en verde sin servir de nada.
  for v_con in
    select conname from pg_constraint
    where conrelid = 'public.objective_steps'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%pendiente%'
  loop
    execute format('alter table public.objective_steps drop constraint %I', v_con);
  end loop;

  alter table public.objective_steps
    add constraint objective_steps_status_check
    check (status in ('pendiente', 'en_progreso', 'hecho', 'descartado'));
end $$;

-- Autotest: si por lo que sea el check viejo sobrevivió, esto falla acá y no
-- después, cuando el script intente descartar los 20 pasos y no pueda.
do $$
begin
  begin
    insert into public.objective_steps (id, user_id, objective_id, title, status)
    select 'zz_probe_descartado', user_id, objective_id, 'probe', 'descartado'
    from public.objective_steps limit 1;
  exception when check_violation then
    raise exception 'El check de status NO acepta descartado — quedó un constraint viejo.';
  end;
  delete from public.objective_steps where id = 'zz_probe_descartado';
end $$;

-- Verificación (SQL Editor):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'objective_steps_status_check';
