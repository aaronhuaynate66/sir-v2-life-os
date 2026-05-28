-- ============================================================
-- SIR V2 — Migration 0005: Captura báscula (Vision API)
-- ============================================================
-- Tres cosas:
--   1. Storage bucket privado "scale-captures" para los screenshots.
--   2. RLS de storage.objects: cada usuario sólo ve su carpeta {userId}/.
--   3. health_metrics:
--      - Expandir enum de `type` con 12 metricas de body composition.
--      - Agregar `capture_id` y `source_image_path` para tracking
--        (nullable -> no rompe filas existentes).
--      - Indice secundario para queries por captura.
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
-- ============================================================

-- ─── 1. Storage bucket privado ──────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('scale-captures', 'scale-captures', false)
on conflict (id) do nothing;

-- ─── 2. RLS sobre storage.objects ────────────────────────────────────
-- Convencion: el path empieza con {userId}/... y storage.foldername lo
-- expone como (storage.foldername(name))[1].

drop policy if exists "Users insert own scale captures" on storage.objects;
create policy "Users insert own scale captures"
  on storage.objects for insert
  with check (
    bucket_id = 'scale-captures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users read own scale captures" on storage.objects;
create policy "Users read own scale captures"
  on storage.objects for select
  using (
    bucket_id = 'scale-captures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own scale captures" on storage.objects;
create policy "Users delete own scale captures"
  on storage.objects for delete
  using (
    bucket_id = 'scale-captures'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─── 3a. Expandir enum de health_metrics.type ──────────────────────
alter table public.health_metrics drop constraint if exists health_metrics_type_check;
alter table public.health_metrics add constraint health_metrics_type_check check (
  type in (
    -- existentes (no cambian)
    'weight', 'blood_pressure', 'heart_rate', 'steps', 'calories', 'hydration', 'custom',
    -- body composition (Mi Scale, Renpho, Garmin, Withings, Fitbit, etc.)
    'bmi',
    'body_fat_percent',
    'muscle_mass_kg',
    'bone_mass_kg',
    'water_percent',
    'protein_percent',
    'visceral_fat_level',
    'metabolic_rate_kcal',
    'skeletal_muscle_mass_kg',
    'metabolic_age',
    'body_score',
    'ideal_weight_kg'
  )
);

-- ─── 3b. Columnas de tracking de captura ────────────────────────────
alter table public.health_metrics add column if not exists capture_id text;
alter table public.health_metrics add column if not exists source_image_path text;

-- ─── 3c. Indice para queries por captura ────────────────────────────
create index if not exists idx_health_metrics_user_capture
  on public.health_metrics(user_id, capture_id)
  where capture_id is not null;

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- -- bucket creado:
-- select id, name, public from storage.buckets where id = 'scale-captures';
--
-- -- policies de storage:
-- select policyname, tablename from pg_policies
-- where schemaname = 'storage' and policyname like '%scale captures%'
-- order by policyname;
--
-- -- enum expandido:
-- select pg_get_constraintdef(oid) from pg_constraint
-- where conname = 'health_metrics_type_check';
--
-- -- columnas nuevas:
-- select column_name, data_type, is_nullable from information_schema.columns
-- where table_name = 'health_metrics' and column_name in ('capture_id', 'source_image_path');
--
-- -- indice nuevo:
-- select indexname from pg_indexes where indexname = 'idx_health_metrics_user_capture';
