-- 0153 — suggestions: el LEDGER de retroalimentación de SIR.
--
-- El hueco central que encontró la auditoría: la superficie donde SIR MÁS
-- aconseja —el chat /sir— no cierra ningún loop. Confirmar/descartar una acción
-- propuesta era estado efímero de React (sir/page.tsx), nunca persistía; SIR
-- sugería al vacío y no se enteraba de si servía.
--
-- Esta tabla registra CADA sugerencia que SIR emite y su ciclo de vida:
--   estado (pending→accepted/dismissed/done) + feedback explícito (👍/👎) +
--   outcome (worked/didnt). Es la pieza fundacional del "cerebro que se
--   retroalimenta": sobre ella se ajusta el scoring del consejo por lo que
--   REALMENTE funcionó (no por lo que se repitió).
--
-- Aditivo. RLS por dueño (user_id text, mismo patrón que contact_activity).

create table if not exists public.suggestions (
  id          text primary key,
  user_id     text not null,
  surface     text not null,                 -- chat | momentos | panel | forecast
  kind        text not null,                 -- tipo de acción propuesta, o 'answer'
  title       text,                          -- etiqueta humana corta (para el panel "qué aprende SIR")
  payload     jsonb,                          -- la acción propuesta / snapshot de contexto
  status      text not null default 'pending', -- pending | accepted | dismissed | done
  feedback    text,                          -- up | down | null (pulgar explícito)
  outcome     text,                          -- worked | didnt | unknown | null
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists suggestions_user_created_idx
  on public.suggestions (user_id, created_at desc);

alter table public.suggestions enable row level security;
create policy "select own suggestions" on public.suggestions for select using (auth.uid()::text = user_id);
create policy "insert own suggestions" on public.suggestions for insert with check (auth.uid()::text = user_id);
create policy "update own suggestions" on public.suggestions for update using (auth.uid()::text = user_id);
create policy "delete own suggestions" on public.suggestions for delete using (auth.uid()::text = user_id);

comment on table public.suggestions is
  'Ledger de sugerencias de SIR con su ciclo de vida (estado + feedback + outcome). Cierra el loop de retroalimentación del chat. Ver src/lib/suggestions.';
