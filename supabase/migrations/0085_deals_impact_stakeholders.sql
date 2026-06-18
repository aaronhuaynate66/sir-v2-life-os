-- 0085 — Eje de impacto + stakeholders internos en deals.
--
-- POR QUÉ (Aaron): un deal del grupo donde trabaja (K2/Sienna) no le impacta
-- financieramente (no cobra bono) sino RELACIONAL/PROFESIONALMENTE: avanzar el
-- pipeline mejora su standing y su vínculo con Francisco y con Alex (GG de K2).
-- El filtro rector de SIR mide impacto en ÉL, que acá no es plata.
--
-- impact_types: por qué le importa (financiero/profesional/relacional/emocional).
-- internal_stakeholders: personas de SU lado a las que el deal acerca (≠ contacto
--   cliente). Person ids → habilita el espejo positivo (avance → plus relacional).
-- Aditivo, nullable. Lo aplica el runner en el merge.

alter table public.deals add column if not exists impact_types text[] not null default '{}';
alter table public.deals add column if not exists why_matters text;
alter table public.deals add column if not exists internal_stakeholders text[] not null default '{}';
