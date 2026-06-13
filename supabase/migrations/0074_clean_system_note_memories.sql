-- 0074 — Limpieza: borrar memorias materializadas desde NOTAS DE SISTEMA.
--
-- La materialización de interacciones→memoria (mem_log:<id>) convirtió por error
-- meta-notas generadas por SIR (ej. "Importado del export de WhatsApp · N
-- mensajes") en memorias. Eso es ruido que ensucia el briefing. A partir de
-- ahora se excluyen en shouldMaterializeInteraction; acá borramos las que ya
-- quedaron.
--
-- Acotado y seguro: SOLO memorias cuyo id es mem_log:* (materializadas desde un
-- person_log) Y cuyo contenido empieza con un prefijo de sistema conocido.
-- Idempotente.

delete from public.memories
where id like 'mem_log:%'
  and (
    content ilike 'Importado del export%'
    or content ilike 'Importado de %'
  );
