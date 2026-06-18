-- 0084 — Oportunidades / Deals (pipeline comercial estructurado).
--
-- POR QUÉ: el "pipeline comercial" era solo un tag sobre personas, sin etapa,
-- ticket, fuente ni cierre. Un lead B2B real (caso Ivis/Sienna: licitación de
-- seguridad jul-ago, 5→20 agentes) no tenía dónde vivir estructurado. Esta
-- tabla es la oportunidad como entidad: reutilizable para K2 y Marlab.
--
-- Patrón API + query directa (como org_profiles 0077): RLS por user_id, sin
-- store Zustand ni sync engine. Lo aplica el runner en el merge a main.

create table if not exists public.deals (
  id                text primary key default gen_random_uuid()::text,
  user_id           uuid not null references auth.users(id) on delete cascade,
  title             text not null,
  -- Cliente (empresa que compra) + contacto decisor + nuestro vendedor.
  client_org        text,
  client_org_slug   text,
  contact_person_id text,
  seller            text,           -- K2 / Marlab / etc.
  -- Posición en el pipeline + estado.
  stage             text not null default 'lead',  -- lead|reunion|relevamiento|propuesta|negociacion|ganado|perdido
  status            text not null default 'open',  -- open|won|lost|paused
  source            text,           -- formulario web, referido, ...
  -- Dimensión económica.
  amount            numeric,
  currency          text default 'PEN',
  tier              text,           -- chico|mediano|grande
  scope             text,           -- "5→20 agentes armados"
  -- Tiempos.
  close_window      text,           -- "jul-ago 2026" (permite rangos)
  next_action       text,
  next_action_date  date,
  -- Equipo + contexto.
  related_persons   text[] not null default '{}',
  notes             text,           -- dossier completo
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_deals_user on public.deals (user_id);
alter table public.deals enable row level security;

drop policy if exists "select own deals" on public.deals;
create policy "select own deals" on public.deals for select using (auth.uid() = user_id);
drop policy if exists "insert own deals" on public.deals;
create policy "insert own deals" on public.deals for insert with check (auth.uid() = user_id);
drop policy if exists "update own deals" on public.deals;
create policy "update own deals" on public.deals for update using (auth.uid() = user_id);
drop policy if exists "delete own deals" on public.deals;
create policy "delete own deals" on public.deals for delete using (auth.uid() = user_id);
