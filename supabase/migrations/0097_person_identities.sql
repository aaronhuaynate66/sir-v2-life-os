-- 0097 — Identidades / alias por red. Cada persona puede llamarse distinto en
-- cada red (ej. Esteban Huaynate está guardado como "Papa" en WhatsApp). Esta
-- tabla mapea (red, identificador) → persona, para HOMOLOGAR zips/capturas a la
-- persona correcta la PRIMERA vez (chat_identities ya cubre el re-import por
-- huella de participantes). identifier_norm = normalizado (sin acentos, lower,
-- sin símbolos) para match exacto e insensible. unique(user,red,norm) impide
-- ambigüedad: un mismo identificador NO puede apuntar a dos personas — clave
-- para no fusionar (caso "Papa": Esteban vs Fernando son nombres DISTINTOS).
create table if not exists public.person_identities (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  person_id       text not null,
  network         text not null,   -- 'whatsapp' | 'instagram' | 'twitter' | 'linkedin' | 'phone' | 'other'
  identifier      text not null,   -- como lo ve el humano (ej. "Papa", "@nick")
  identifier_norm text not null,
  created_at      timestamptz not null default now(),
  unique (user_id, network, identifier_norm)
);
alter table public.person_identities enable row level security;
create index if not exists person_identities_user_person_idx on public.person_identities (user_id, person_id);
create index if not exists person_identities_lookup_idx on public.person_identities (user_id, network, identifier_norm);

drop policy if exists "select own person_identities" on public.person_identities;
create policy "select own person_identities" on public.person_identities for select using (auth.uid() = user_id);
drop policy if exists "insert own person_identities" on public.person_identities;
create policy "insert own person_identities" on public.person_identities for insert with check (auth.uid() = user_id);
drop policy if exists "delete own person_identities" on public.person_identities;
create policy "delete own person_identities" on public.person_identities for delete using (auth.uid() = user_id);
