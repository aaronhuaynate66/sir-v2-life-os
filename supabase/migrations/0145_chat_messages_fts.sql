-- ============================================================
-- SIR V2 — Migration 0145: full-text search sobre el sustrato de chat
-- ============================================================
-- El cerebro (askSir/getPersonConversation) hoy ve solo la VENTANA RECIENTE de
-- chat_messages (últimos ~60) + memorias derivadas. Para preguntas sobre algo
-- VIEJO y específico ("¿qué me dijo mi papá del terreno en 2022?") no hay forma
-- de encontrar ese mensaje entre los 428k del historial.
--
-- Este índice GIN sobre to_tsvector('spanish', content) habilita búsqueda
-- full-text rápida sobre el contenido real de los mensajes. El cableado a askSir
-- va en un PR aparte (después de que este índice esté aplicado en prod, para no
-- correr búsquedas sin índice en el hot-path).
--
-- Aditivo. La expresión del índice DEBE coincidir con la del query
-- (to_tsvector('spanish', content) @@ plainto_tsquery('spanish', …)).
-- ============================================================

create index if not exists chat_messages_content_fts_idx
  on public.chat_messages
  using gin (to_tsvector('spanish', content));

comment on index public.chat_messages_content_fts_idx is
  'FTS (español) sobre chat_messages.content para que SIR busque en el historial completo. Ver src/lib/chat-messages/search.ts (cableado en PR posterior).';
