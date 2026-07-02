-- ============================================================
-- SIR V2 — Migration 0111: person_briefings (cache de síntesis IA)
-- ============================================================
-- Cachea la prosa generada por Claude Sonnet para el panel
-- "Cómo estás con [persona]" en la ficha, para evitar re-generar
-- 3-4 líneas cada vez que Aaron abre una ficha (cada request Claude
-- cuesta ~$0.01 y ~2s).
--
-- Estrategia de invalidación:
--   - TTL de 24h (más de eso puede quedar desactualizado con nueva data).
--   - `input_hash` computado por el server sobre (moments.length +
--     personLogs.length + personCycles.length + últimas fechas) — si
--     cambia, el cache está frío incluso antes de las 24h.
--
-- Una fila por (user_id, person_id) — last write wins. La UI dispara
-- regenerar con un botón.
-- ============================================================

create table if not exists public.person_briefings (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null,
  person_id     text not null references public.people(id) on delete cascade,
  -- Prosa generada (3-4 líneas neutrales).
  synthesis     text not null,
  -- Hash de los inputs con los que se generó (para invalidar cuando cambia).
  input_hash    text not null,
  -- Modelo usado (para auditar / poder distinguir generaciones futuras).
  model_used    text default 'claude-sonnet-4-5',
  generated_at  timestamptz not null default now()
);

-- Un cache por (usuario, persona).
create unique index if not exists person_briefings_uniq
  on public.person_briefings (user_id, person_id);

-- ─── RLS ────────────────────────────────────────────────────────────
alter table public.person_briefings enable row level security;

drop policy if exists "select own person_briefings" on public.person_briefings;
create policy "select own person_briefings"
  on public.person_briefings for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own person_briefings" on public.person_briefings;
create policy "insert own person_briefings"
  on public.person_briefings for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own person_briefings" on public.person_briefings;
create policy "update own person_briefings"
  on public.person_briefings for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "delete own person_briefings" on public.person_briefings;
create policy "delete own person_briefings"
  on public.person_briefings for delete
  using (auth.uid()::text = user_id);
