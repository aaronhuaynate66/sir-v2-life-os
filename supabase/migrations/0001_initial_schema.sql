-- ============================================================
-- SIR V2 — Initial schema (Sesión 20a)
-- ============================================================
-- Mapping de src/types/index.ts y src/engines/context/types.ts
-- Single-user con RLS preparado para multi-user futuro.
-- Aplicar via Supabase Dashboard → SQL Editor → Run.
-- ============================================================

-- ─── Extensions ─────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── profiles ───────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  full_name     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─── self_metrics ───────────────────────────────────────────
-- Una fila por medición. category enum: energy/mood/stress/focus/motivation/confidence.
create table public.self_metrics (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  category      text not null check (category in ('energy','mood','stress','focus','motivation','confidence')),
  value         numeric(4,1) not null check (value between 0 and 10),
  note          text,
  measured_at   timestamptz not null,
  created_at    timestamptz not null default now()
);
create index on public.self_metrics (user_id, measured_at desc);

-- ─── health_metrics ─────────────────────────────────────────
create table public.health_metrics (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  type          text not null check (type in ('weight','blood_pressure','heart_rate','steps','calories','hydration','custom')),
  value         numeric(10,2) not null,
  unit          text not null,
  note          text,
  measured_at   timestamptz not null,
  created_at    timestamptz not null default now()
);
create index on public.health_metrics (user_id, measured_at desc);

-- ─── sleep_records ──────────────────────────────────────────
create table public.sleep_records (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  date          date not null,
  bedtime       text not null,
  wake_time     text not null,
  duration      numeric(4,2) not null check (duration between 0 and 24),
  quality       int not null check (quality between 1 and 10),
  dreams        text,
  notes         text,
  created_at    timestamptz not null default now()
);
create index on public.sleep_records (user_id, date desc);

-- ─── finance_movements ──────────────────────────────────────
create table public.finance_movements (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  type              text not null check (type in ('income','expense','investment','transfer','debt')),
  amount            numeric(14,2) not null,
  currency          text not null default 'USD',
  category          text not null check (category in ('housing','food','transport','health','entertainment','investment','business','personal','debt','other')),
  description       text not null,
  date              date not null,
  recurrent         boolean not null default false,
  recurrent_period  text,
  related_goal     uuid,
  tags              text[] not null default '{}',
  created_at        timestamptz not null default now()
);
create index on public.finance_movements (user_id, date desc);

-- ─── goals ──────────────────────────────────────────────────
create table public.goals (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  title               text not null,
  description         text not null default '',
  category            text not null check (category in ('financial','personal','relational','health','career','spiritual','creative')),
  priority            text not null check (priority in ('critical','high','medium','low')),
  status              text not null check (status in ('active','paused','completed','abandoned')),
  target_date         date,
  progress            int not null default 0 check (progress between 0 and 100),
  milestones          jsonb not null default '[]'::jsonb,
  related_goals       text[] not null default '{}',
  related_persons     text[] not null default '{}',
  peace_impact        int not null default 5 check (peace_impact between 1 and 10),
  obstacles           text[] not null default '{}',
  next_action         text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.goals (user_id, status);
create index on public.goals (user_id, priority);

-- ─── signals ────────────────────────────────────────────────
create table public.signals (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  source              text not null check (source in ('linkedin','instagram','calendar','biological','financial','relational','manual')),
  type                text not null check (type in ('opportunity','warning','pattern','timing','emotional','relational','biological','financial')),
  content             text not null,
  strength            int not null default 5 check (strength between 1 and 10),
  urgency             text not null check (urgency in ('immediate','soon','monitor','archive')),
  related_persons     text[] not null default '{}',
  related_goals       text[] not null default '{}',
  meaning             text,
  action_required     boolean not null default false,
  suggested_action    text,
  detected_at         timestamptz not null,
  expires_at          timestamptz,
  resolved            boolean not null default false,
  created_at          timestamptz not null default now()
);
create index on public.signals (user_id, resolved, urgency);

-- ─── people ─────────────────────────────────────────────────
create table public.people (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  alias               text,
  relationship        text not null check (relationship in ('family','friend','romantic','professional','mentor','mentee','acquaintance')),
  category            text not null check (category in ('inner_circle','close','network','peripheral')),
  importance_score    int not null check (importance_score between 1 and 10),
  energy_impact       text not null check (energy_impact in ('energizing','draining','neutral')),
  trust_level         int not null check (trust_level between 1 and 10),
  last_contact        date,
  contact_frequency   text not null default '',
  location            text,
  tags                text[] not null default '{}',
  notes               text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.people (user_id, last_contact);

-- ─── relationships ──────────────────────────────────────────
create table public.relationships (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  person_id           uuid not null references public.people(id) on delete cascade,
  type                text not null check (type in ('family','friend','romantic','professional','mentor','mentee','acquaintance')),
  status              text not null check (status in ('active','dormant','strained','ended')),
  depth               int not null default 5 check (depth between 1 and 10),
  reciprocity         int not null default 5 check (reciprocity between 1 and 10),
  history             jsonb not null default '[]'::jsonb,
  shared_goals        text[] not null default '{}',
  tensions            text[] not null default '{}',
  strengths           text[] not null default '{}',
  next_action         text,
  next_action_date    date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.relationships (user_id, person_id);
create index on public.relationships (user_id, status);

-- ─── memories ───────────────────────────────────────────────
create table public.memories (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  type                text not null check (type in ('episodic','semantic','emotional','relational','temporal','predictive')),
  title               text not null,
  content             text not null,
  entities            text[] not null default '{}',
  emotional_charge    numeric(3,1) not null default 0 check (emotional_charge between -10 and 10),
  importance          int not null default 5 check (importance between 1 and 10),
  decay_rate          numeric(4,3) not null default 0.05 check (decay_rate between 0 and 1),
  tags                text[] not null default '{}',
  related_memories    text[] not null default '{}',
  occurred_at         timestamptz not null,
  last_accessed       timestamptz not null default now(),
  created_at          timestamptz not null default now()
);
create index on public.memories (user_id, occurred_at desc);
create index on public.memories (user_id, importance desc);

-- ─── snapshots (rich context history) ───────────────────────
-- Persiste SnapshotSummary (no el RichContextSnapshot completo) por simplicidad.
-- context_json reservado para futuro almacenamiento del snapshot completo si hace falta.
create table public.snapshots (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  trigger_reason      text not null,
  peace_score         numeric(3,1) not null,
  peace_mode          text not null check (peace_mode in ('normal','focused','recovery','strategic')),
  summary             text[] not null default '{}',
  risks               text[] not null default '{}',
  opportunities       text[] not null default '{}',
  context_json        jsonb,
  captured_at         timestamptz not null,
  created_at          timestamptz not null default now()
);
create index on public.snapshots (user_id, captured_at desc);

-- ─── Auto-update updated_at trigger function ────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at      before update on public.profiles      for each row execute function public.set_updated_at();
create trigger trg_goals_updated_at         before update on public.goals         for each row execute function public.set_updated_at();
create trigger trg_people_updated_at        before update on public.people        for each row execute function public.set_updated_at();
create trigger trg_relationships_updated_at before update on public.relationships for each row execute function public.set_updated_at();

-- ─── Auto-create profile on auth.users insert ───────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- profiles
alter table public.profiles enable row level security;
create policy "select own profile" on public.profiles for select using (auth.uid() = id);
create policy "update own profile" on public.profiles for update using (auth.uid() = id);

-- self_metrics
alter table public.self_metrics enable row level security;
create policy "select own self_metrics" on public.self_metrics for select using (auth.uid() = user_id);
create policy "insert own self_metrics" on public.self_metrics for insert with check (auth.uid() = user_id);
create policy "update own self_metrics" on public.self_metrics for update using (auth.uid() = user_id);
create policy "delete own self_metrics" on public.self_metrics for delete using (auth.uid() = user_id);

-- health_metrics
alter table public.health_metrics enable row level security;
create policy "select own health_metrics" on public.health_metrics for select using (auth.uid() = user_id);
create policy "insert own health_metrics" on public.health_metrics for insert with check (auth.uid() = user_id);
create policy "update own health_metrics" on public.health_metrics for update using (auth.uid() = user_id);
create policy "delete own health_metrics" on public.health_metrics for delete using (auth.uid() = user_id);

-- sleep_records
alter table public.sleep_records enable row level security;
create policy "select own sleep_records" on public.sleep_records for select using (auth.uid() = user_id);
create policy "insert own sleep_records" on public.sleep_records for insert with check (auth.uid() = user_id);
create policy "update own sleep_records" on public.sleep_records for update using (auth.uid() = user_id);
create policy "delete own sleep_records" on public.sleep_records for delete using (auth.uid() = user_id);

-- finance_movements
alter table public.finance_movements enable row level security;
create policy "select own finance_movements" on public.finance_movements for select using (auth.uid() = user_id);
create policy "insert own finance_movements" on public.finance_movements for insert with check (auth.uid() = user_id);
create policy "update own finance_movements" on public.finance_movements for update using (auth.uid() = user_id);
create policy "delete own finance_movements" on public.finance_movements for delete using (auth.uid() = user_id);

-- goals
alter table public.goals enable row level security;
create policy "select own goals" on public.goals for select using (auth.uid() = user_id);
create policy "insert own goals" on public.goals for insert with check (auth.uid() = user_id);
create policy "update own goals" on public.goals for update using (auth.uid() = user_id);
create policy "delete own goals" on public.goals for delete using (auth.uid() = user_id);

-- signals
alter table public.signals enable row level security;
create policy "select own signals" on public.signals for select using (auth.uid() = user_id);
create policy "insert own signals" on public.signals for insert with check (auth.uid() = user_id);
create policy "update own signals" on public.signals for update using (auth.uid() = user_id);
create policy "delete own signals" on public.signals for delete using (auth.uid() = user_id);

-- people
alter table public.people enable row level security;
create policy "select own people" on public.people for select using (auth.uid() = user_id);
create policy "insert own people" on public.people for insert with check (auth.uid() = user_id);
create policy "update own people" on public.people for update using (auth.uid() = user_id);
create policy "delete own people" on public.people for delete using (auth.uid() = user_id);

-- relationships
alter table public.relationships enable row level security;
create policy "select own relationships" on public.relationships for select using (auth.uid() = user_id);
create policy "insert own relationships" on public.relationships for insert with check (auth.uid() = user_id);
create policy "update own relationships" on public.relationships for update using (auth.uid() = user_id);
create policy "delete own relationships" on public.relationships for delete using (auth.uid() = user_id);

-- memories
alter table public.memories enable row level security;
create policy "select own memories" on public.memories for select using (auth.uid() = user_id);
create policy "insert own memories" on public.memories for insert with check (auth.uid() = user_id);
create policy "update own memories" on public.memories for update using (auth.uid() = user_id);
create policy "delete own memories" on public.memories for delete using (auth.uid() = user_id);

-- snapshots
alter table public.snapshots enable row level security;
create policy "select own snapshots" on public.snapshots for select using (auth.uid() = user_id);
create policy "insert own snapshots" on public.snapshots for insert with check (auth.uid() = user_id);
create policy "update own snapshots" on public.snapshots for update using (auth.uid() = user_id);
create policy "delete own snapshots" on public.snapshots for delete using (auth.uid() = user_id);
