-- 0094 — Identidad de chat → persona. Para auto-rutear el re-import de un export
-- de WhatsApp aunque NO traiga el nombre del contacto (o venga como número): la
-- "huella" son los participantes del chat (no cambian). Primer import: se graba
-- la huella→persona; siguientes: se reconoce solo. RLS por usuario.
create table if not exists public.chat_identities (
  user_id     uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null,
  person_id   uuid not null,
  source      text not null default 'whatsapp',
  updated_at  timestamptz not null default now(),
  primary key (user_id, fingerprint)
);
alter table public.chat_identities enable row level security;
drop policy if exists "select own chat_identities" on public.chat_identities;
create policy "select own chat_identities" on public.chat_identities for select using (auth.uid() = user_id);
drop policy if exists "insert own chat_identities" on public.chat_identities;
create policy "insert own chat_identities" on public.chat_identities for insert with check (auth.uid() = user_id);
drop policy if exists "update own chat_identities" on public.chat_identities;
create policy "update own chat_identities" on public.chat_identities for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "delete own chat_identities" on public.chat_identities;
create policy "delete own chat_identities" on public.chat_identities for delete using (auth.uid() = user_id);
