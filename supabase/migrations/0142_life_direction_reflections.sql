-- 0142 — "Tu rumbo": persistir la reflexión de dirección de vida (E5).
--
-- Hasta hoy la reflexión IA de "Tu rumbo" (/api/self/rumbo, Narrative Intelligence
-- Capa 2) era EFÍMERA: se generaba on-demand y vivía solo en estado React. Al
-- recargar se perdía y había que regenerarla (gasto de LLM), y no se podía ver
-- CÓMO cambió el rumbo con el tiempo.
--
-- Esta tabla la hace durable: una reflexión "vigente" por día (day_key en TZ Lima;
-- regenerar el mismo día ACTUALIZA, no acumula). Día a día queda el historial, que
-- habilita leer la evolución ("antes tu rumbo decía…"). Aditiva, RLS por dueño.

create table if not exists public.life_direction_reflections (
  id         text primary key default gen_random_uuid()::text,
  user_id    uuid not null references auth.users(id) on delete cascade,
  day_key    text not null,                       -- 'YYYY-MM-DD' (Lima): 1 vigente por día
  insight    text not null,                       -- la reflexión generada
  anchor     text,                                -- el norte al momento de generar (contexto)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day_key)
);

create index if not exists life_direction_reflections_user_day_idx
  on public.life_direction_reflections (user_id, day_key desc);

alter table public.life_direction_reflections enable row level security;
create policy "select own rumbo reflections" on public.life_direction_reflections for select using (auth.uid() = user_id);
create policy "insert own rumbo reflections" on public.life_direction_reflections for insert with check (auth.uid() = user_id);
create policy "update own rumbo reflections" on public.life_direction_reflections for update using (auth.uid() = user_id);
create policy "delete own rumbo reflections" on public.life_direction_reflections for delete using (auth.uid() = user_id);

comment on table public.life_direction_reflections is
  'E5 — reflexión IA de "Tu rumbo" persistida (1 vigente por día, TZ Lima). Antes efímera; ahora durable para ver la evolución del rumbo. Ver /api/self/rumbo.';
