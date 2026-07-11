# SIR Reader (extensión de navegador — Fase 1)

Lee, **pasivo**, tus conversaciones de **Microsoft Teams**, **WhatsApp Web** y tu **correo de Outlook Web (OWA)** en el navegador donde ya estás logueado, y las manda a tu SIR. Solo lee lo que **ya se ve en pantalla** mientras usás el chat/inbox normal — sin auto-scroll, sin requests de fondo, sin scraping. El token solo vive en la extensión; lo único que sale del navegador va a **tu** SIR.

- Los **chats** (Teams / WhatsApp) van a `/api/reader/ingest`.
- El **correo** (Outlook Web) va a `/api/email/ingest` — la misma normalización y el mismo backend que el sync por Microsoft Graph, pero **sin** necesitar acceso admin a Azure. Es una **fuente alternativa** al flujo Graph (que sigue existiendo).

## Antes de empezar (una vez)

1. **En el server (Vercel):** asegurate de que exista la env var **`READER_INGEST_TOKEN`** con un valor secreto (inventá una cadena larga, ej. 40+ caracteres random). Si tenés más de un usuario en la base, seteá también `READER_INGEST_USER_ID` con tu user id. *(Este es un secreto de backend — va en env, no en la UI.)*
2. Guardá ese mismo token: lo vas a pegar en la extensión. **El mismo token sirve para chats y para correo** (el endpoint `/api/email/ingest` acepta `READER_INGEST_TOKEN`; si querés un token aparte para correo, seteá `EMAIL_INGEST_TOKEN` y usá ese).

## Cargar la extensión (en cualquier PC con Chrome/Edge)

1. Copiá la carpeta **`extension/sir-reader`** a esa PC. Dos formas:
   - **Git:** en una terminal de la otra PC, cloná el repo y quedate con la carpeta:
     ```bash
     git clone https://github.com/aaronhuaynate66/sir-v2-life-os.git
     cd sir-v2-life-os/extension/sir-reader
     ```
     (o si el repo ya está ahí: `git pull` y andá a `extension/sir-reader`).
   - **A mano:** copiá la carpeta `sir-reader` por USB / Drive.
2. Abrí Chrome (o Edge) → `chrome://extensions`.
3. Prendé **"Modo de desarrollador"** (arriba a la derecha).
4. Click **"Cargar descomprimida"** (Load unpacked) → elegí la carpeta **`sir-reader`**.
5. Aparece "SIR Reader". Fijala en la barra (ícono de pieza de rompecabezas → pin).

## Configurar

1. Click en el ícono de **SIR Reader**.
2. **URL de tu SIR:** `https://sir-v2-life-os.vercel.app` (o tu dominio).
3. **Token:** pegá el `READER_INGEST_TOKEN`.
4. Dejá **Teams**, **WhatsApp Web** y/o **Outlook Web (correo)** en ON.
5. **Guardar.**

## Usar

- **Chats:** abrí **teams.microsoft.com** o **web.whatsapp.com** (logueado) y **entrá a un chat**.
- **Correo:** abrí **outlook.office.com** (o `outlook.office365.com` / `outlook.cloud.microsoft`), logueado. Andá viendo tu bandeja normal; abrí algún correo para que también capture el cuerpo completo.
- Andá mirando/scrolleando normal. La extensión detecta lo nuevo y lo manda en lotes (cada ~4s).
- Volvé a abrir el popup: vas a ver **"Mensajes enviados"** subir. Si hay algo mal, muestra el error.
- En SIR: chats y correos aparecen como observaciones `dm_conversation` (correo agrupado por remitente) → alimentan *Lo personal*, recencia, tono, memorias, y podés preguntarle a SIR sobre esos hilos.

## Si no captura (ajuste de selectores)

Teams, WhatsApp y Outlook cambian su HTML seguido. Si el contador no sube:
1. En la pestaña, abrí la consola (F12 → Console) y filtrá por `SIR Reader`.
2. Si dice *"no encontré el contenedor…"*, los selectores necesitan ajuste → se actualizan en `content/teams.js`, `content/whatsapp.js` o `content/outlook.js` y recargás la extensión (botón ↻ en `chrome://extensions`). El botón **"Probar detección"** del popup también corre en OWA y te da una muestra + HTML crudo de fila para afinar los selectores.

## Límites honestos

- **Pasivo por diseño:** solo captura lo que vos ves. Si querés traer historial viejo, scrolleá hacia arriba (vos, natural) y lo va leyendo.
- **Teams/WhatsApp/Outlook = tu data, tu sesión → riesgo bajo.** LinkedIn/IG/FB quedan afuera a propósito (riesgo de cuenta) — esos van on-demand por captura.
- **Correo, dedup honesto:** el mismo correo se re-scrapea al re-abrir el inbox; se deduplica por `messageId` cuando OWA lo expone, y si no por `remitente+asunto+fecha`. Las horas relativas de OWA ("10:32", "ayer") son un ancla aproximado; el dedup fuerte es el `messageId`. Ver el correo en la lista (preview) y después abierto (cuerpo completo) puede sumar una vez el cuerpo más rico.
- **Idempotente:** reenviar el mismo mensaje no duplica (SIR deduplica por hash).
