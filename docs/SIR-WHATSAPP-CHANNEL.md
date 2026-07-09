# Canal SIR por WhatsApp — MVP inbound (setup)

> **Estado:** código completo (inbound de TEXTO **y VOZ**), **inerte hasta que
> Aaron provisione la app de WhatsApp Cloud API + los secrets**. Decisión GO para
> uso personal en el spike (`docs/SIR-WHATSAPP-SPIKE.md`).

## Qué hace hoy

- Le escribís por WhatsApp al número de SIR ("Vi a Diana hoy, estuvo bajoneada,
  pelea el martes") → SIR lo estructura con el **mismo cerebro** que
  `/api/relato/ingest` (Claude Sonnet + tools) y lo **aplica** (momentos, logs de
  tono, notas, objetivos, recordatorios, ciclo…).
- SIR **responde una confirmación**: "✅ Anotado: 2 momentos, 1 registro (con
  Diana Díaz)". Si algo quedó ambiguo, te pide el nombre completo.
- **$0**: son mensajes de "Servicio" dentro de la ventana de 24h (vos abrís la
  conversación). Sin plantillas. (La transcripción de voz sí consume Whisper, marginal.)
- **TEXTO y VOZ.** Una nota de voz se baja de Meta, se transcribe con Whisper
  (OpenAI) y entra por el mismo pipeline. Reenvío de chats = follow-up.
- **Solo tu número** (allowlist): un desconocido que escriba al número NO escribe
  en tu SIR. Firma HMAC del webhook verificada (viene de Meta, no de un impostor).

## Arquitectura

- `GET /api/whatsapp/webhook` → verificación (Meta manda `hub.challenge`).
- `POST /api/whatsapp/webhook` → firma HMAC → parseo → allowlist → `runRelatoIngest`
  (apply) → `sendWhatsAppText` con la confirmación. Responde 200 al instante y
  procesa en background (`after()`), así Meta no reintenta.
- `lib/whatsapp/inbound.ts` (firma + parseo, puro), `cloud.ts` (envío), `reply.ts`
  (resumen, puro). `lib/relato-ingest/run.ts` = cerebro compartido con la web.

## Pasos de Aaron (una vez)

### 1. Meta / WhatsApp Cloud API
1. <https://developers.facebook.com> → crear una **App** (tipo *Business*).
2. Agregar el producto **WhatsApp**. Meta da un **número de prueba** gratis (o
   registrás uno propio).
3. Copiar el **Phone number ID** y un **Access Token** (para producción, generar
   un **System User token permanente**, no el temporal de 24h).
4. En **App Settings → Basic**, copiar el **App Secret**.
5. **Configuration → Webhook:**
   - Callback URL: `https://<tu-dominio>/api/whatsapp/webhook`
   - Verify token: el mismo string que pongas en `WHATSAPP_VERIFY_TOKEN`.
   - Suscribir el campo **messages**.

### 2. Vercel (env vars — secrets del server)

| Variable | Qué es |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | String random que elegís; debe coincidir con el del webhook de Meta |
| `WHATSAPP_APP_SECRET` | App Secret (firma el body — verificación de que viene de Meta) |
| `WHATSAPP_ACCESS_TOKEN` | Token del System User (permanente) |
| `WHATSAPP_PHONE_NUMBER_ID` | Id del número de SIR en Cloud API |
| `WHATSAPP_ALLOWED_NUMBER` | Tu número (solo dígitos, con código de país; ej. `51987654321`) |
| `WHATSAPP_OWNER_USER_ID` | Tu `user_id` de Supabase (dueño de la data que se escribe) |

Ya deberían existir: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (Whisper, ya está por
los embeddings), `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`.

### 3. Probar
Escribile al número desde tu WhatsApp: *"Hoy almorcé con Diana Díaz, buena
charla"*. Deberías recibir "✅ Anotado: 1 momento, 1 registro (con Diana Díaz)".

## Seguridad / privacidad
- Firma HMAC obligatoria + allowlist de número. Sin config → el webhook responde
  200 sin hacer nada (inerte).
- **Trade de privacidad (del spike):** los mensajes se descifran en la infra de
  Meta (Cloud API; el On-Premises está muerto). Aceptable para uso personal de
  Aaron; NO defendible como "privacidad radical" si SIR fuera producto para
  terceros. Ver `docs/SIR-WHATSAPP-SPIKE.md`.

## Follow-ups (fase 2)
- **Reenvío de chat**: export → pipeline de whatsapp-export ya existente.
- **Nudges proactivos**: fuera de la ventana de 24h → plantillas Utility
  aprobadas por Meta ($). Requiere decisión aparte.
- **Dedupe por `messageId`** por si Meta reintenta (hoy `after()` minimiza reintentos).
