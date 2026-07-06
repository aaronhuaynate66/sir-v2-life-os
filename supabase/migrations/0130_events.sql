-- SIR V2 — Telemetría de interacciones (tagging de eventos + errores).
--
-- Aaron quería saber CUÁNDO se dispara un error o una interacción dentro de la
-- plataforma. Sentry (reportApiError) cubre excepciones inesperadas SOLO si hay
-- SENTRY_DSN; esta tabla cubre EVENTOS de negocio taggeados a mano: qué acción
-- se disparó, si salió ok, cuánto tardó y su contexto. Fail-open por diseño:
-- loguear un evento nunca debe romper ni demorar el request que lo emite.

create table if not exists public.events (
  id          text primary key default gen_random_uuid()::text,
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,            -- ej: 'rehearse' | 'derive' | 'capture' | ...
  ok          boolean,                  -- true = éxito, false = fallo, null = info
  route       text,                     -- ruta / superficie que lo emitió
  duration_ms integer,                  -- latencia opcional
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists events_user_idx on public.events (user_id, created_at desc);
create index if not exists events_type_idx on public.events (type, created_at desc);

alter table public.events enable row level security;
-- Append-only: sin policy de update a propósito.
create policy "select own events" on public.events for select using (auth.uid() = user_id);
create policy "insert own events" on public.events for insert with check (auth.uid() = user_id);
create policy "delete own events" on public.events for delete using (auth.uid() = user_id);
