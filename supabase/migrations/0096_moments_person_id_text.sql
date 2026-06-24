-- 0096 — FIX: relationship_moments.person_id quedó como uuid (mig 0091), pero
-- people.id es TEXT desde 0002 (ids 'per_...'). Resultado: solo se podían crear
-- momentos para personas cuyo id ERA un uuid (ej. Diana); para el resto
-- (familia con ids 'per_...') el insert fallaba con "invalid input syntax for
-- type uuid". Pasamos person_id a text para que coincida con people.id.
-- Idempotente: solo altera si el tipo aún es uuid.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='relationship_moments'
      and column_name='person_id' and data_type='uuid'
  ) then
    alter table public.relationship_moments alter column person_id type text using person_id::text;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='moment_participants'
      and column_name='person_id' and data_type='uuid'
  ) then
    alter table public.moment_participants alter column person_id type text using person_id::text;
  end if;
end $$;
