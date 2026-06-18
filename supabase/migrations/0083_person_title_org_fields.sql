-- 0083 — Cargo en persona + campos de empresa (RUC/dirección/matriz/tier).
--
-- POR QUÉ: registrar leads B2B de forma ordenada. Hoy una persona tenía
-- "empresa" pero no su CARGO/rol; y org_profiles no tenía datos de cliente
-- (RUC para validar SUNAT, dirección fiscal, empresa matriz, tier/tamaño).
--
-- Aditivo, idempotente, nullable. Reads pre-migración tolerantes (los adapters
-- caen a undefined si la columna no existe todavía). Lo aplica el runner en el
-- merge a main.

alter table public.people add column if not exists title text;

alter table public.org_profiles add column if not exists ruc text;
alter table public.org_profiles add column if not exists address text;
alter table public.org_profiles add column if not exists parent_org text;
alter table public.org_profiles add column if not exists tier text;
