-- 0173 — Oportunidades y enfriamientos detectados en las conversaciones.
--
-- Cierra el reclamo de Aaron del 28-jul: "se creaba una ventana de oportunidad
-- con Miluska y ni siquiera apareció como oportunidad, lead". El detector
-- (lib/opportunities) ya existe y está calibrado; esta tabla es lo que lo hace
-- LLEGAR — sin persistencia el brief tendría que re-escanear y re-juzgar 19.000
-- mensajes cada mañana, y no habría forma de que un descarte de Aaron aguante.
--
-- POR QUÉ TABLA Y NO CÁLCULO AL VUELO (tres razones concretas):
--   1. El juez cuesta una llamada LLM por candidato. Guardar el veredicto evita
--      pagarlo de nuevo cada mañana por la misma señal.
--   2. `state` hace que el descarte SOBREVIVA: si Aaron dice "no es negocio", la
--      señal no vuelve mañana. Sin esto el brief repetiría lo descartado, que es
--      exactamente la queja que originó el 🔕 (mig 0166).
--   3. Deja traza de lo que el detector propuso y qué se hizo — se puede medir su
--      precisión con decisiones reales en vez de opinar.
--
-- El id es determinístico por (usuario, persona, tipo, momento de la cita): el
-- cron puede correr N veces al día sin duplicar ni pisar el estado.

create table if not exists public.opportunity_signals (
  id           text primary key,          -- sha1(user|person|kind|quote_at)
  user_id      text not null,
  person_id    text not null,
  person_name  text not null,

  /** 'oportunidad_sin_registrar' | 'enfriamiento'. */
  kind         text not null,
  /** La frase textual que la disparó. Va SIEMPRE al brief: Aaron verifica el
   *  dato, no confía en el veredicto (regla de honestidad de cobertura). */
  quote        text not null,
  quote_at     timestamptz not null,
  /** Palabras del lexicón que marcaron el candidato — para poder decir con qué
   *  se buscó, y para depurar falsos positivos después. */
  matched      text[],
  /** Lo que el JUEZ entendió que le piden ("una cotización de servicios
   *  digitales"). Es lo que se muestra; la cita queda como respaldo. */
  what         text not null,

  days_since_quote integer,
  days_since_last  integer,
  confidence   text,

  /** 'pending' (esperando a Aaron) · 'registered' (se creó el deal) ·
   *  'dismissed' (dijo que no es negocio → no vuelve). */
  state        text not null default 'pending',
  /** Deal creado al registrarla, si la registró. */
  deal_id      text,

  detected_at  timestamptz not null default now(),
  resolved_at  timestamptz
);

-- Lo que el brief consulta cada mañana: las pendientes, más frescas primero.
create index if not exists idx_opportunity_pending
  on public.opportunity_signals(user_id, detected_at desc)
  where state = 'pending';
create index if not exists idx_opportunity_person
  on public.opportunity_signals(user_id, person_id);

alter table public.opportunity_signals enable row level security;

drop policy if exists "select own opportunity_signals" on public.opportunity_signals;
create policy "select own opportunity_signals" on public.opportunity_signals for select
  using (auth.uid()::text = user_id);
drop policy if exists "insert own opportunity_signals" on public.opportunity_signals;
create policy "insert own opportunity_signals" on public.opportunity_signals for insert
  with check (auth.uid()::text = user_id);
drop policy if exists "update own opportunity_signals" on public.opportunity_signals;
create policy "update own opportunity_signals" on public.opportunity_signals for update
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
