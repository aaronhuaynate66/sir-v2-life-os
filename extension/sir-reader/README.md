# SIR Reader (extensión de navegador — Fase 1)

Lee, **pasivo**, tus conversaciones de **Microsoft Teams** y **WhatsApp Web** en el navegador donde ya estás logueado, y las manda a tu SIR (`/api/reader/ingest`). Solo lee lo que **ya se ve en pantalla** mientras usás el chat normal — sin auto-scroll, sin requests de fondo, sin scraping. El token solo vive en la extensión; lo único que sale del navegador va a **tu** SIR.

## Antes de empezar (una vez)

1. **En el server (Vercel):** asegurate de que exista la env var **`READER_INGEST_TOKEN`** con un valor secreto (inventá una cadena larga, ej. 40+ caracteres random). Si tenés más de un usuario en la base, seteá también `READER_INGEST_USER_ID` con tu user id. *(Este es un secreto de backend — va en env, no en la UI.)*
2. Guardá ese mismo token: lo vas a pegar en la extensión.

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
4. Dejá **Teams** y/o **WhatsApp Web** en ON.
5. **Guardar.**

## Usar

- Abrí **teams.microsoft.com** o **web.whatsapp.com** (logueado) y **entrá a un chat**.
- Andá mirando/scrolleando normal. La extensión detecta los mensajes nuevos y los manda en lotes (cada ~4s).
- Volvé a abrir el popup: vas a ver **"Mensajes enviados"** subir y el último hilo. Si hay algo mal, muestra el error.
- En SIR: aparecen como observaciones `dm_conversation` → alimentan *Lo personal*, recencia, tono, memorias, y podés preguntarle a SIR sobre esos hilos.

## Si no captura (ajuste de selectores)

Teams y WhatsApp cambian su HTML seguido. Si el contador no sube:
1. En la pestaña de Teams/WhatsApp, abrí la consola (F12 → Console) y filtrá por `SIR Reader`.
2. Si dice *"no encontré el contenedor de mensajes"*, los selectores necesitan ajuste → los actualizamos en `content/teams.js` o `content/whatsapp.js` y recargás la extensión (botón ↻ en `chrome://extensions`).

## Límites honestos

- **Pasivo por diseño:** solo captura lo que vos ves. Si querés traer historial viejo, scrolleá hacia arriba (vos, natural) y lo va leyendo.
- **Teams/WhatsApp = tu data, tu sesión → riesgo bajo.** LinkedIn/IG/FB quedan afuera a propósito (riesgo de cuenta) — esos van on-demand por captura.
- **Idempotente:** reenviar el mismo mensaje no duplica (SIR deduplica por hash).
