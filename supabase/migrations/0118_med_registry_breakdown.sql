-- 0118 — Desglose de los medicamentos (composición + para qué).
--
-- POR QUÉ: una toma es solo un nombre + hora. Para que SIR CRUCE bien (una toma
-- de ergotamina = migraña ese día; la hora = el inicio), necesita saber QUÉ es
-- cada medicamento. Aaron sube ese desglose en "mis medicamentos": composición,
-- clase y para qué. Antes, "toda toma" se contaba como migraña y contaminaba los
-- cruces con FC/sueño; con el desglose, solo los antimigrañosos cuentan.
--
-- ADITIVA, idempotente, sin backfill (columnas nullable). Lo aplica el runner.
alter table public.med_registry add column if not exists component  text;  -- composición
alter table public.med_registry add column if not exists drug_class text;  -- clase (antimigrañoso/analgésico/…)
alter table public.med_registry add column if not exists treats     text;  -- para qué (migraña/dolor/…)
alter table public.med_registry add column if not exists note       text;
