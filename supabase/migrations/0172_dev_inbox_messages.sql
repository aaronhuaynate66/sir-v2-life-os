-- 0172 — Registro de TODO mensaje que entra al bot de dev de Telegram.
--
-- POR QUÉ (fallo real, 28-jul-2026): Aaron preguntó "¿no hay nada en backlog que
-- yo haya enviado desde Telegram?" y la respuesta honesta fue **no lo sé**.
--
-- El webhook clasifica cada mensaje en 'request' (→ issue de GitHub) o 'status'
-- (→ Q&A). Pero `classifyDevMessage` cae a 'status' en CUATRO casos que no tienen
-- nada que ver con lo que Aaron escribió: sin ANTHROPIC_API_KEY, respuesta no-OK
-- de la API, JSON que no parsea, o cualquier excepción. Cuando eso pasa, su
-- PEDIDO se contesta como si fuera una pregunta de estado y **desaparece**: no se
-- crea issue, no se avisa, y —lo peor— la conversación del bot de dev no se
-- guardaba en ninguna parte. No había forma de saber qué se perdió ni de contarlo.
--
-- Precedente exacto: el 25-jul el crédito de Anthropic se agotó. Ese día el
-- clasificador habría devuelto 'status' a TODO, pedidos incluidos.
-- Y dos días antes, tres pedidos suyos quedaron 8 días invisibles porque GitHub
-- descartaba la label en silencio (PR #997). Mismo patrón: degradación callada.
--
-- Esta tabla es la red: se escribe ANTES de clasificar, así que aunque todo lo
-- demás falle queda el texto. `needs_review` marca los que el clasificador no
-- pudo juzgar — esos hay que mirarlos a mano, no asumir que eran preguntas.

create table if not exists public.dev_inbox_messages (
  id            text primary key,          -- sha1(chat_id|message_id) — idempotente ante reintentos de Telegram
  chat_id       text not null,
  text          text not null,

  /** 'request' (se anotó como issue) · 'status' (Q&A) · 'unknown' (el
   *  clasificador no pudo correr: sin key, API caída, parse malo). */
  intent        text not null,
  /** Issue creado, cuando fue 'request' y GitHub respondió. null si no se pudo
   *  crear → el pedido existe SOLO acá, hay que rescatarlo a mano. */
  issue_number  integer,
  /** true = nadie juzgó de verdad este mensaje. Revisar a mano. */
  needs_review  boolean not null default false,

  created_at    timestamptz not null default now()
);

create index if not exists idx_dev_inbox_review
  on public.dev_inbox_messages(created_at desc)
  where needs_review = true;

-- RLS activada SIN políticas a propósito: la escribe el webhook con service-role
-- (que salta RLS) y no hay ninguna superficie de la app que deba leerla. Sin
-- políticas, cualquier cliente con anon key queda afuera por defecto.
alter table public.dev_inbox_messages enable row level security;
