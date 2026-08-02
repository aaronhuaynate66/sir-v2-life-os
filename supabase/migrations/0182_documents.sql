-- 0182 — ENTREGABLES: los documentos que SIR produce y Aaron usa.
--
-- POR QUÉ. Aaron, 2-ago-2026: *"así solo acá no me sirve"*.
--
-- SIR le arma cosas que él tiene que usar afuera —un informe para FEDEPOL, una
-- cotización comercial— y hasta hoy terminaban en `docs/*.md` del repo, donde él
-- no entra nunca. El mapeo de las 40 páginas de la app lo confirmó: **no existía
-- ningún lugar para un documento**. Cero tablas, cero rutas.
--
-- Los parches que había, y por qué no alcanzan:
--   · `people.notes` renderiza completo, pero es "notas SOBRE la persona" y viaja
--     a los prompts de IA — un informe de 3,000 caracteres ahí pesa en cada
--     respuesta sobre esa persona.
--   · `deals.notes` dice "dossier completo" pero la UI lo corta a 160 chars.
--   · `goals.description` NO se renderiza en el detalle del objetivo.
--   · `/captura/documento` hace lo inverso: fragmenta el PDF en `memories` y no
--     guarda el documento.
--
-- QUÉ ES ESTO. Un entregable es algo que Aaron va a MANDAR o LLEVAR a alguien.
-- No es una memoria (eso es lo que SIR recuerda), ni una nota sobre una persona
-- (eso la describe a ella). Se distingue porque tiene destinatario y estado: se
-- redacta, se revisa, se envía.
--
-- NO alimenta a la IA a propósito: es texto que Aaron escribe hacia afuera, no
-- contexto sobre su vida. Meterlo al recall inflaría los prompts con borradores.

create table if not exists public.documents (
  id            text primary key default gen_random_uuid()::text,
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  -- informe | cotizacion | carta | propuesta | nota | otro
  kind          text not null default 'nota',
  -- borrador | listo | enviado. Lo que hace que esto sea un entregable y no
  -- una nota: un documento "listo" que sigue sin enviarse es un pendiente.
  status        text not null default 'borrador',
  -- El cuerpo, tal cual se va a mandar. Texto plano o markdown liviano.
  body          text not null default '',
  -- Contexto interno que NO va en el envío (la tabla de quién es quién, las
  -- advertencias). Separado del body para poder copiar el body sin editarlo.
  internal_note text,
  -- A quién va y para qué. Los tres son opcionales: un documento puede colgar
  -- de una persona, de un objetivo, de una oportunidad, o de nada todavía.
  person_id     text,
  objective_id  text,
  deal_id       text,
  -- Si además hay un archivo (PDF, imagen) en un bucket.
  storage_bucket    text,
  source_file_path  text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_documents_user on public.documents (user_id);
create index if not exists idx_documents_person on public.documents (user_id, person_id);
create index if not exists idx_documents_objective on public.documents (user_id, objective_id);
-- Para el panel "qué tengo listo y sin mandar".
create index if not exists idx_documents_pendientes on public.documents (user_id, status)
  where status <> 'enviado';

alter table public.documents enable row level security;

drop policy if exists "select own documents" on public.documents;
create policy "select own documents" on public.documents for select using (auth.uid() = user_id);
drop policy if exists "insert own documents" on public.documents;
create policy "insert own documents" on public.documents for insert with check (auth.uid() = user_id);
drop policy if exists "update own documents" on public.documents;
create policy "update own documents" on public.documents for update using (auth.uid() = user_id);
drop policy if exists "delete own documents" on public.documents;
create policy "delete own documents" on public.documents for delete using (auth.uid() = user_id);

-- `updated_at` a mano en cada UPDATE (mismo criterio que `deals`: sin trigger,
-- para no sumar otra función que mantener).
