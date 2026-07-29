-- SIR V2 — 0177: que la identidad de un mensaje no dependa de espacios que el
-- export no puede llevar.
--
-- POR QUÉ (medido el 29-jul-2026 corriendo el importador de verdad, no de memoria):
-- la 0176 unificó el hash y arregló el tiempo y el canal, pero al importar un
-- export real de 113 mensajes entraron 2 filas nuevas. Los 2 eran así:
--
--     "Recién leí tu mensaje\n"          ← guardado con salto al final
--     "Menu Criollo\n \nEntradas"        ← una línea interna que es solo un espacio
--
-- El export de WhatsApp es un .txt donde cada línea del mensaje es una línea del
-- archivo, y el parser las recorta al reconstruirlo. O sea: el formato NO PUEDE
-- preservar los espacios al borde de una línea. Esas filas vuelven del export sin
-- el espacio, hashean distinto y se insertan de nuevo — en CADA import, para
-- siempre.
--
-- Son 512 de 285,003 (471 multilínea + 41 con espacios alrededor). Poco, pero es
-- una fuga que COMPONE: cada re-import agrega otras 512.
--
-- La regla: la identidad no puede depender de algo que el transporte no puede
-- llevar. El contenido se sigue GUARDANDO tal cual —no se pierde fidelidad—, solo
-- el hash mira la forma normalizada.
--
-- Idempotente: correrla de nuevo no cambia nada.

create extension if not exists pgcrypto with schema extensions;

-- ── Normalización, espejo EXACTO de contenidoParaId() en append.ts ────────────
-- Se usa el mismo algoritmo con regex (y no split/trim) justamente para que las
-- dos implementaciones sean la misma operación y no dos aproximaciones parecidas.
create or replace function public.sir_contenido_para_id(p_content text)
returns text
language sql immutable as $$
  select btrim(
    regexp_replace(coalesce(p_content, ''), E'[ \t\r]*\n[ \t\r]*', E'\n', 'g'),
    E' \t\r\n'
  );
$$;

-- Se REEMPLAZA la del 0176 para que hashee el contenido normalizado.
create or replace function public.sir_chat_message_id(
  p_user_id uuid, p_person_id text, p_canal text,
  p_sent_at timestamptz, p_sender text, p_content text
) returns text
language sql immutable as $$
  select 'cm_' || encode(extensions.digest(
    p_user_id::text || '|' || p_person_id || '|' || p_canal || '|' ||
    coalesce(to_char(p_sent_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI'), '') || '|' ||
    p_sender || '|' || public.sir_contenido_para_id(p_content)
  , 'sha1'), 'hex');
$$;

-- ── Autotest: si el hash de Postgres no es idéntico al de JS, ABORTAR ─────────
-- Vectores calculados con chatMessageId() de append.ts. Los dos primeros son los
-- MISMOS que validó la 0176 — la normalización no toca un contenido ya limpio, y
-- que sigan dando el mismo hash es la prueba de que este cambio solo afecta a las
-- filas con el espaciado problemático.
do $$
declare
  v_u uuid := '11111111-1111-1111-1111-111111111111';
  v_iso timestamptz := '2026-07-16T18:44:00.000Z';
  v_casos text[][] := array[
    -- contenido, emisor, id esperado
    array['Amor no te olvides enviar las facturas', 'user',  'cm_429b2ea7e62749105a804abb28b2ca1fb248b187'],
    -- El emoji va literal y no como escape \U…: menos supuestos sobre cómo el
    -- servidor interpreta los escapes, y el archivo ya es UTF-8.
    array['Buenos días 😘😘😘', 'other', 'cm_5ae3a983a953df64ae03a4af25cb5ce548d0ff1e'],
    array[E'Recién leí tu mensaje\n', 'other', 'cm_9e88e3ee9be1f6e3e14700fb1d5c7c44680f6394'],
    array[E'Menu Criollo\n \nEntradas', 'other', 'cm_826d9bafda92c3b086c430fa6a1a325adc170c15'],
    array[E'  hola  \n  chau  ', 'user', 'cm_f0fc39606a7b1111489a3ca7cd607add60c1cef9'],
    array[E'a\nb\nc', 'user', 'cm_68db8801ce542fc47defcbd7ec031e9f8eec6af1'],
    array[E'uno\t\r\ndos', 'other', 'cm_52b48292f36e2c8a0617e648defb5d8057f671ea']
  ];
  v_caso text[];
  v_obtenido text;
begin
  foreach v_caso slice 1 in array v_casos loop
    v_obtenido := public.sir_chat_message_id(v_u, 'per_test_1', 'whatsapp', v_iso, v_caso[2], v_caso[1]);
    if v_obtenido <> v_caso[3] then
      raise exception 'Autotest falló para %: esperado % obtenido %',
        quote_literal(v_caso[1]), v_caso[3], v_obtenido;
    end if;
  end loop;
  raise notice 'Autotest del hash OK — la normalización SQL coincide con append.ts';
end $$;

-- ── 1) Borrar los pares que ahora colapsan ────────────────────────────────────
-- Antes de reescribir hay que sacar las filas que van a compartir id, o el UPDATE
-- revienta por llave primaria duplicada. Se conserva el ctid más bajo (la más
-- vieja), que es la que tenía el espaciado original.
with numeradas as (
  select ctid,
         row_number() over (
           partition by user_id, person_id, source,
                        coalesce(to_char(sent_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI'), ''),
                        sender, public.sir_contenido_para_id(content)
           order by ctid
         ) as rn
  from chat_messages
)
delete from chat_messages
where ctid in (select ctid from numeradas where rn > 1);

-- ── 2) Reescribir los ids que cambian ─────────────────────────────────────────
-- El WHERE acota el UPDATE a las ~512 filas afectadas (para el resto la
-- normalización es identidad) y hace la migración idempotente.
update chat_messages
set id = public.sir_chat_message_id(user_id, person_id, source, sent_at, sender, content)
where id <> public.sir_chat_message_id(user_id, person_id, source, sent_at, sender, content);
