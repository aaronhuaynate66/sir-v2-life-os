-- ============================================================
-- SIR V2 — Migration 0150: contact_activity (señales de TIMING relacional)
-- ============================================================
-- "No me vuelva a pasar" (Aaron, jul-2026): pedirle algo a alguien en mal
-- momento (ej. de viaje). Guarda señales de DISPONIBILIDAD/estado de un contacto
-- —"de viaje", "ocupada", "cambió de trabajo", "por acá/activa"— con cuándo se
-- observó y cuándo deja de ser relevante. SIR las fusiona en un veredicto de
-- "buen/mal momento para contactar a X".
--
-- Fuentes: manual (Aaron marca lo que ve), o la futura extensión pasiva que lee
-- IG/LinkedIn de su sesión (Parte A). No guarda contenido crudo de terceros:
-- solo la SEÑAL de timing derivada + un detalle corto opcional.
-- ============================================================

create table if not exists public.contact_activity (
  id          text primary key default gen_random_uuid()::text,
  user_id     text not null,
  person_id   text not null references public.people(id) on delete cascade,
  -- Tipo de señal. 'available'/'posting_burst' suman a favor; el resto marca
  -- cautela o mal momento (ver lib/contact-timing/assess.ts).
  kind        text not null check (kind in (
                'traveling', 'busy', 'away', 'focus',
                'available', 'posting_burst', 'job_change', 'life_event', 'other'
              )),
  -- Detalle humano corto ("escapadita de finde", "arrancó en OpenMed"). Opcional.
  detail      text,
  -- De dónde salió la señal.
  source      text not null default 'manual' check (source in (
                'manual', 'instagram', 'linkedin', 'whatsapp', 'inferred'
              )),
  observed_at timestamptz not null default now(),
  -- Cuándo deja de ser relevante (una story ~24h, un viaje unos días). null =
  -- el motor usa un TTL por tipo desde observed_at.
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists contact_activity_by_person
  on public.contact_activity (user_id, person_id, observed_at desc);

-- ─── RLS ────────────────────────────────────────────────────────────
alter table public.contact_activity enable row level security;

drop policy if exists "select own contact_activity" on public.contact_activity;
create policy "select own contact_activity"
  on public.contact_activity for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own contact_activity" on public.contact_activity;
create policy "insert own contact_activity"
  on public.contact_activity for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own contact_activity" on public.contact_activity;
create policy "update own contact_activity"
  on public.contact_activity for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "delete own contact_activity" on public.contact_activity;
create policy "delete own contact_activity"
  on public.contact_activity for delete
  using (auth.uid()::text = user_id);
