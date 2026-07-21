-- 0152 — unmatched_social_activity: señales sociales que NO se pudieron asignar.
--
-- El problema: /api/social/ingest DESCARTABA en silencio toda señal que no
-- matcheaba a una persona (handle no seteado aún, o el full_name de IG no calza).
-- Para el círculo de Aaron eso es pérdida de data: si un amigo postea "de viaje"
-- pero su handle todavía no está, la señal se perdía para siempre.
--
-- Esta tabla RETIENE las señales no-asignadas que tienen una IDENTIDAD (handle o
-- nombre) para deduplicarlas. Sirve de doble propósito:
--   1. Bandeja "¿quién es quién?": el reader ve handles con story que sigues pero
--      que no son contactos aún; Aaron asigna handle→persona (setea el handle) y
--      de ahí en más matchea solo. Es la idea de Aaron de "quién es quién".
--   2. No-pérdida: apenas la persona se vuelve matcheable (se asigna el handle o
--      se carga como contacto), las señales guardadas se AUTO-PROMUEVEN a
--      contact_activity con su momento real.
-- Deduplicada por (persona-identidad + kind) → una fila por cuenta+tipo, no crece
-- por cada re-captura.
--
-- Aditivo. RLS por dueño. Ver src/app/api/social/ingest.

-- user_id es TEXT (mismo patrón que contact_activity 0150 y el resto del reader).
create table if not exists public.unmatched_social_activity (
  id          text primary key,                                   -- hash determinístico → dedupe idempotente
  user_id     text not null,
  platform    text not null,                                      -- instagram | linkedin
  handle      text,                                               -- handle IG crudo capturado (si vino)
  name        text,                                               -- nombre crudo capturado (para re-matchear)
  kind        text not null,                                      -- available | traveling | job_change
  detail      text,                                               -- snippet de la story / headline nuevo
  observed_at timestamptz not null default now(),                 -- momento real de la actividad
  created_at  timestamptz not null default now()
);

-- Barremos por dueño para intentar promover las pendientes en cada ingesta.
create index if not exists unmatched_social_user_idx
  on public.unmatched_social_activity (user_id, observed_at desc);

alter table public.unmatched_social_activity enable row level security;
create policy "select own unmatched_social" on public.unmatched_social_activity for select using (auth.uid()::text = user_id);
create policy "insert own unmatched_social" on public.unmatched_social_activity for insert with check (auth.uid()::text = user_id);
create policy "delete own unmatched_social" on public.unmatched_social_activity for delete using (auth.uid()::text = user_id);

comment on table public.unmatched_social_activity is
  'Señales sociales específicas (traveling/job_change) que no matchearon a una persona; se auto-promueven a contact_activity cuando la persona se vuelve matcheable. Ver src/app/api/social/ingest.';
