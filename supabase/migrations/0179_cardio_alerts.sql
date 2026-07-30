-- 0179 — Memoria de los avisos cardíacos que YA sonaron.
--
-- POR QUÉ. Aaron pidió (30-jul-2026) que lo cardíaco sea proactivo: "si detectas
-- una alerta o anomalía pues avisarla en el momento". Un aviso que interrumpe sin
-- memoria se convierte en el muro del que él mismo se quejó del brief ("así todo
-- junto no siento que me ayude", "que me recuerdes todos los días que mi mamá está
-- empinchada no me ayuda en nada"). Y en un tema donde el ruido ASUSTA, un canal
-- que grita todos los días se gasta: la vez que suene de verdad, ya no le cree.
--
-- UNA FILA POR (usuario, fingerprint). El fingerprint es la identidad ESTABLE del
-- aviso, sin números ni fechas ('cardio:aguda', 'cardio:consultar'): si mañana la
-- VFC es 19 en vez de 18 sigue siendo el mismo aviso y no tiene que sonar otra
-- vez. Mismo criterio que `topicKey` en el brief (mig 0166), por la misma razón:
-- si la clave lleva el número, el silencio no sobrevive al día siguiente.
--
-- Es ESTADO PRESENTE, no histórico: la pregunta que se le hace es "¿cuándo sonó
-- esto por última vez?", no "¿cuántas veces sonó?".

create table if not exists public.cardio_alerts (
  user_id      text not null,
  /** Identidad estable del aviso: 'cardio:aguda' | 'cardio:consultar' | … */
  fingerprint  text not null,

  /** Última vez que este aviso se ENVIÓ de verdad (no cuando se evaluó). */
  last_sent_at timestamptz not null default now(),
  /** El nivel del veredicto que lo disparó, para depurar sin adivinar. */
  level        text,
  /** El texto que se mandó, recortado. Sirve para ver qué leyó Aaron. */
  sample_text  text,

  sent_count   integer not null default 1,
  updated_at   timestamptz not null default now(),
  primary key (user_id, fingerprint)
);

create index if not exists idx_cardio_alerts_user on public.cardio_alerts(user_id);

alter table public.cardio_alerts enable row level security;

-- Solo lectura para el dueño; la escritura la hace el service-role del server
-- (mismo patrón que reader_heartbeats en 0175).
drop policy if exists "select own cardio_alerts" on public.cardio_alerts;
create policy "select own cardio_alerts" on public.cardio_alerts for select
  using (auth.uid()::text = user_id);
