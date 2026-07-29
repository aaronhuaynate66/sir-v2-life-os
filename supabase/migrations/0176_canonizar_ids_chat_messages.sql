-- SIR V2 — 0176: canonizar los ids de chat_messages.
--
-- POR QUÉ (bug real, 29-jul-2026): `chat_messages.id` es un hash determinístico
-- de lo que define "el mismo mensaje", y es TODO el mecanismo de dedupe (upsert
-- con ON CONFLICT DO NOTHING). Había DOS implementaciones de ese hash: la
-- canónica (src/lib/chat-messages/append.ts, que hashea el minuto) y una copia
-- en scripts/import-whatsapp.mjs (que hasheaba el ISO crudo, con segundos y
-- milisegundos). Se separaron sin que nada avisara, y el re-import duplicó ~71k
-- mensajes de Diana.
--
-- La copia ya se eliminó (el script ahora importa la función canónica). Pero las
-- filas que esa copia escribió quedaron con ids que la función canónica NO
-- reproduce: 54,386 de las 74,024 de Diana, 6,301 de las 12,490 de Miluska. Si
-- se dejaran así, el próximo import las volvería a insertar como filas nuevas —
-- exactamente el bug que estamos cerrando, pero al revés.
--
-- Esta migración recalcula el id de TODAS las filas con la fórmula canónica y
-- borra los duplicados que colapsan. Es idempotente: correrla de nuevo no cambia
-- nada, porque los ids ya serían los canónicos.
--
-- OJO: acá `canal` = `source` para todas las filas. Las filas de `source=reader`
-- que en realidad son de WhatsApp necesitan además un corrimiento de hora, y eso
-- lo hace scripts/repair-chat-ids.mjs DESPUÉS de esta migración (ver canalDe en
-- append.ts).

create extension if not exists pgcrypto with schema extensions;

-- ── Fórmula canónica, espejo exacto de chatMessageId() en append.ts ────────────
-- 'cm_' || sha1( user_id | person_id | canal | minuto | sender | content )
-- El minuto es minuteKey(): UTC recortado a "YYYY-MM-DDTHH:MI", '' si es null.
create or replace function public.sir_chat_message_id(
  p_user_id uuid, p_person_id text, p_canal text,
  p_sent_at timestamptz, p_sender text, p_content text
) returns text
language sql immutable as $$
  select 'cm_' || encode(extensions.digest(
    p_user_id::text || '|' || p_person_id || '|' || p_canal || '|' ||
    coalesce(to_char(p_sent_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI'), '') || '|' ||
    p_sender || '|' || p_content
  , 'sha1'), 'hex');
$$;

-- ── Autotest: si el hash de Postgres no es idéntico al de JS, ABORTAR ─────────
-- Vectores calculados con chatMessageId() de append.ts. Sin esto, una diferencia
-- de encoding (UTF-8, formato del minuto, casteo del uuid) reescribiría 289k ids
-- con basura en silencio y el dedupe quedaría roto para siempre.
do $$
declare
  v_esperado_1 text := 'cm_429b2ea7e62749105a804abb28b2ca1fb248b187';
  v_esperado_2 text := 'cm_5ae3a983a953df64ae03a4af25cb5ce548d0ff1e';
  v_obtenido_1 text;
  v_obtenido_2 text;
begin
  v_obtenido_1 := public.sir_chat_message_id(
    '11111111-1111-1111-1111-111111111111'::uuid, 'per_test_1', 'whatsapp',
    '2026-07-16T18:44:00.000Z'::timestamptz, 'user', 'Amor no te olvides enviar las facturas');
  if v_obtenido_1 <> v_esperado_1 then
    raise exception 'Autotest 1 falló: el hash de Postgres no coincide con el de JS. esperado=% obtenido=%',
      v_esperado_1, v_obtenido_1;
  end if;

  -- Con acentos y emoji: verifica que se hashean los mismos bytes UTF-8 que en JS.
  v_obtenido_2 := public.sir_chat_message_id(
    '11111111-1111-1111-1111-111111111111'::uuid, 'per_test_1', 'whatsapp',
    '2026-07-16T18:44:00.000Z'::timestamptz, 'other', 'Buenos días 😘😘😘');
  if v_obtenido_2 <> v_esperado_2 then
    raise exception 'Autotest 2 (acentos/emoji) falló: esperado=% obtenido=%',
      v_esperado_2, v_obtenido_2;
  end if;

  raise notice 'Autotest del hash OK — la fórmula SQL coincide con append.ts';
end $$;

-- ── 1) Borrar duplicados por CLAVE CANÓNICA ───────────────────────────────────
-- Antes de reescribir hay que sacar los pares que van a colapsar al mismo id, o
-- el UPDATE reventaría por llave primaria duplicada. Se conserva el ctid más
-- bajo (la fila más vieja). Esto también barre los 14 residuales que la limpieza
-- del 29-jul no vio: ella comparó `sent_at` exacto, así que los pares que solo
-- diferían en los segundos le pasaron por debajo.
with numeradas as (
  select ctid,
         row_number() over (
           partition by user_id, person_id, source,
                        coalesce(to_char(sent_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI'), ''),
                        sender, content
           order by ctid
         ) as rn
  from chat_messages
)
delete from chat_messages
where ctid in (select ctid from numeradas where rn > 1);

-- ── 2) Reescribir los ids a la fórmula canónica ───────────────────────────────
-- Solo las filas que difieren (el WHERE hace la migración idempotente y evita
-- reescribir 289k filas que ya están bien).
update chat_messages
set id = public.sir_chat_message_id(user_id, person_id, source, sent_at, sender, content)
where id <> public.sir_chat_message_id(user_id, person_id, source, sent_at, sender, content);
