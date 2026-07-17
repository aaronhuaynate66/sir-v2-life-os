-- ============================================================
-- SIR V2 — Migration 0149: health_exams (historial médico / chequeos)
-- ============================================================
-- Aaron pidió (17-jul-2026) guardar sus chequeos médicos anuales dentro de SIR.
-- A diferencia de health_metrics (serie DIARIA de vitals de Zepp/Apple, que
-- alimenta baselines y anomalías), un chequeo es un REGISTRO puntual anual con
-- otro contexto (medición clínica) — por eso va aparte, para NO contaminar los
-- baselines personales. Guarda el resumen estructurado + link al PDF original.
-- ============================================================

create table if not exists public.health_exams (
  id              text primary key default gen_random_uuid()::text,
  user_id         uuid not null references auth.users(id) on delete cascade,
  exam_date       date not null,
  provider        text,                              -- "Sanna / Pacífico Seguros"
  title           text not null,                     -- "Chequeo preventivo anual"
  summary         text,                              -- prosa breve del resultado
  -- Hallazgos CIE10: [{ "code": "E67.8", "label": "Sobrepeso" }]
  findings        jsonb not null default '[]'::jsonb,
  -- Valores clave/notables: [{ "name","value","unit","range","flag":"high|low|normal" }]
  values          jsonb not null default '[]'::jsonb,
  -- Recomendaciones médicas: ["...", "..."]
  recommendations jsonb not null default '[]'::jsonb,
  -- PDF original en el bucket privado person-documents ({userId}/exams/...).
  storage_path    text,
  created_at      timestamptz not null default now()
);

create index if not exists health_exams_by_user_date
  on public.health_exams (user_id, exam_date desc);

-- ─── RLS ────────────────────────────────────────────────────────────
alter table public.health_exams enable row level security;

drop policy if exists "select own health_exams" on public.health_exams;
create policy "select own health_exams" on public.health_exams for select using (auth.uid() = user_id);

drop policy if exists "insert own health_exams" on public.health_exams;
create policy "insert own health_exams" on public.health_exams for insert with check (auth.uid() = user_id);

drop policy if exists "update own health_exams" on public.health_exams;
create policy "update own health_exams" on public.health_exams for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own health_exams" on public.health_exams;
create policy "delete own health_exams" on public.health_exams for delete using (auth.uid() = user_id);
