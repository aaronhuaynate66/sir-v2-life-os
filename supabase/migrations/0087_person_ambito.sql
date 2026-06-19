-- 0087 — Ámbito de la persona: la LÍNEA entre tu gente y tus contactos de trabajo.
--
-- POR QUÉ (Aaron): SIR mezclaba relaciones personales (familia/amigos) con
-- contactos de trabajo (colegas + leads de las empresas donde vende). Ambos con
-- máximo detalle, pero el LENTE es distinto: a lo personal se le aplica salud
-- relacional/afecto; a un lead, lente comercial (deals). Sin esta línea, el
-- score personal se diluye y el gap-engine le pregunta el cumpleaños a un lead.
--
-- ambito: 'personal' | 'colega' (interno) | 'lead' (externo/comercial).
-- La cercanía "lead propio (Marlab)" vs "lead del empleador (K2)" se deriva del
-- deal vinculado (deals.seller), no de acá. Aditivo, nullable. Lo aplica el runner.

alter table public.people add column if not exists ambito text;
