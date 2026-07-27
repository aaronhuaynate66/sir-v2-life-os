# SIR Reader (extensión de navegador — Fase 1)

Lee, **pasivo**, tus conversaciones de **Microsoft Teams**, **WhatsApp Web** y tu **correo de Outlook Web (OWA)** en el navegador donde ya estás logueado, y las manda a tu SIR. Solo lee lo que **ya se ve en pantalla** mientras usas el chat/inbox normal — sin auto-scroll, sin requests de fondo, sin scraping. El token solo vive en la extensión; lo único que sale del navegador va a **tu** SIR.

- Los **chats** (Teams / WhatsApp) van a `/api/reader/ingest`.
- El **correo** (Outlook Web) va a `/api/email/ingest` — la misma normalización y el mismo backend que el sync por Microsoft Graph, pero **sin** necesitar acceso admin a Azure. Es una **fuente alternativa** al flujo Graph (que sigue existiendo).
- Las **señales de timing** de **Instagram / LinkedIn** van a `/api/social/ingest` (ver abajo).

## Antes de empezar (una vez)

1. **En el server (Vercel):** asegurate de que exista la env var **`READER_INGEST_TOKEN`** con un valor secreto (inventá una cadena larga, ej. 40+ caracteres random). Si tienes más de un usuario en la base, seteá también `READER_INGEST_USER_ID` con tu user id. *(Este es un secreto de backend — va en env, no en la UI.)*
2. Guarda ese mismo token: lo vas a pegar en la extensión. **El mismo token sirve para chats y para correo** (el endpoint `/api/email/ingest` acepta `READER_INGEST_TOKEN`; si quieres un token aparte para correo, seteá `EMAIL_INGEST_TOKEN` y usá ese).

## Cargar la extensión (en cualquier PC con Chrome/Edge)

1. Copia la carpeta **`extension/sir-reader`** a esa PC. Dos formas:
   - **Git:** en una terminal de la otra PC, cloná el repo y quedate con la carpeta:
     ```bash
     git clone https://github.com/aaronhuaynate66/sir-v2-life-os.git
     cd sir-v2-life-os/extension/sir-reader
     ```
     (o si el repo ya está ahí: `git pull` y anda a `extension/sir-reader`).
   - **A mano:** copia la carpeta `sir-reader` por USB / Drive.
2. Abre Chrome (o Edge) → `chrome://extensions`.
3. Prendé **"Modo de desarrollador"** (arriba a la derecha).
4. Click **"Cargar descomprimida"** (Load unpacked) → elegí la carpeta **`sir-reader`**.
5. Aparece "SIR Reader". Fijala en la barra (ícono de pieza de rompecabezas → pin).

## Configurar

1. Click en el ícono de **SIR Reader**.
2. **URL de tu SIR:** `https://sir-v2-life-os.vercel.app` (o tu dominio).
3. **Token:** pega el `READER_INGEST_TOKEN`.
4. Dejá **Teams**, **WhatsApp Web** y/o **Outlook Web (correo)** en ON.
5. **Guardar.**

## Usar

- **Chats:** abre **teams.microsoft.com** o **web.whatsapp.com** (logueado) y **entra a un chat**.
- **Correo:** abre **outlook.office.com** (o `outlook.office365.com` / `outlook.cloud.microsoft`), logueado. Anda viendo tu bandeja normal; abre algún correo para que también capture el cuerpo completo.
- Anda mirando/scrolleando normal. La extensión detecta lo nuevo y lo manda en lotes (cada ~4s).
- Volvé a abrir el popup: vas a ver **"Mensajes enviados"** subir. Si hay algo mal, muestra el error.
- En SIR: chats y correos aparecen como observaciones `dm_conversation` (correo agrupado por remitente) → alimentan *Lo personal*, recencia, tono, memorias, y puedes preguntarle a SIR sobre esos hilos.

## Instagram / LinkedIn — señales de TIMING (Parte A del reader social)

Para que SIR no te deje pedirle algo a alguien en **mal momento** (caso: contacto **de viaje**), la extensión lee —**pasivo, por interceptación de red**— el JSON que IG/LinkedIn **ya le mandan a tu navegador mientras vos navegas normal**. NO hace requests propios ni "ve" stories por su cuenta (eso IG detecta y banea): solo lee lo que ya cargaste.

- **Instagram** (`www.instagram.com`): del tray de stories y de la story que abres, saca `handle` + ¿tiene story activa? + el texto visible. El server deriva la señal: texto con pistas de viaje (✈️, "escapadita", aeropuerto…) → **de viaje**; si no, una story reciente → **por acá/activa**.
- **Instagram — datos de PERFIL** (v0.7.0, issue #994): cuando **entras a un perfil**, saca además **nombre real, bio, seguidores, publicaciones, categoría y si es cuenta de negocio** → tabla `social_profiles`. Sigue siendo pasivo: IG ya mandaba todo eso en la respuesta que carga la página; antes el interceptor la descartaba por no ser el tray. **Cero requests nuevos.** Es la vía principal para que la bandeja "¿quién es quién?" tenga NOMBRES (la barra de historias solo da el handle), y el conteo de seguidores + categoría es lo que separa una persona de una fan page.
- **LinkedIn** (`www.linkedin.com`): cuando ves el perfil de un contacto, saca su `headline`. Si **cambió** respecto al guardado → señal **cambió de trabajo**.
- El server (`/api/social/ingest`, mismo `x-reader-token`) resuelve el handle → persona y arma el veredicto **"buen/mal momento para contactar a X"** (aparece en la ficha, el push y `/negociar` · `/tacticas` · Ensayo).

**Matcheo:**
- **Instagram:** la persona debe tener seteado su **`instagram_handle`** (sin @); si no, la señal llega pero queda `unmatched`.
- **LinkedIn: auto-bootstrap.** No necesitas cargar la URL a mano — la primera vez que ves el perfil de un contacto, SIR lo matchea por **nombre** y le **rellena `linkedin_url` solo**. (Si dos personas tienen el mismo nombre exacto, ese queda ambiguo y no se auto-setea: ahí sí carga la URL a mano.)

**Refresco PROACTIVO (dejá IG abierto):** si dejas una pestaña de **instagram.com** abierta en la PC, la extensión cada ~2.5h (con jitter) **refresca el tray** de una pestaña de IG que no estés usando → capta quién tiene **story activa y de cuándo** para TODOS tus follows de una, y de ahí SIR arma el ritmo ("suele postear/estar activa de noche → buen momento a esa hora"). Se apaga con `enabled.igRefresh=false`.

**La línea que NO cruzamos:** solo leemos el **tray** (existencia + timestamp de la story) y perfiles — **nunca abrimos las stories automáticamente**. Abrirlas dejaría el "visto" (la persona vería que la miraste, y a horas raras) y es el patrón que IG más castiga. Riesgo: bajo (es tu sesión real, baja frecuencia), no cero — es tu cuenta, tu decisión.

**Guardrail:** solo contactos con los que ya tienes relación, solo lo que ellos difunden, y solo para cuidar el timing — no vigilancia. No se guarda contenido crudo: solo la señal + un detalle corto.

## Si no captura (ajuste de selectores)

Teams, WhatsApp y Outlook cambian su HTML seguido. Si el contador no sube:
1. En la pestaña, abre la consola (F12 → Console) y filtrá por `SIR Reader`.
2. Si dice *"no encontré el contenedor…"*, los selectores necesitan ajuste → se actualizan en `content/teams.js`, `content/whatsapp.js` o `content/outlook.js` y recargas la extensión (botón ↻ en `chrome://extensions`). El botón **"Probar detección"** del popup también corre en OWA y te da una muestra + HTML crudo de fila para afinar los selectores.
3. **IG/LinkedIn:** el shape interno del JSON de IG (tray/reels) y de LinkedIn (voyager) cambia seguido. El extractor es un deep-scan tolerante, pero si deja de capturar hay que ajustar `content/instagramReader.js` / `content/linkedinReader.js`. Para depurar: en la consola de la pestaña de IG/LinkedIn vas a ver `instagram reader activo`/`linkedin reader activo`; agregá un `console.debug` en `handle()` para ver los JSON que llegan y de ahí afinar los campos.

## Límites honestos

- **Pasivo por diseño:** solo captura lo que vos ves. Si quieres traer historial viejo, scrolleá hacia arriba (vos, natural) y lo va leyendo.
- **Teams/WhatsApp/Outlook = tu data, tu sesión → riesgo bajo.**
- **IG/LinkedIn = pasivo por interceptación de red → el enfoque de MENOR riesgo** (según el research): no hace requests propios, solo lee lo que ya cargaste al navegar. Aun así IG/LinkedIn son sensibles a la automatización; mantenelo pasivo (nada de auto-abrir stories ni polling). FB queda afuera.
- **Correo, dedup honesto:** el mismo correo se re-scrapea al re-abrir el inbox; se deduplica por `messageId` cuando OWA lo expone, y si no por `remitente+asunto+fecha`. Las horas relativas de OWA ("10:32", "ayer") son un ancla aproximado; el dedup fuerte es el `messageId`. Ver el correo en la lista (preview) y después abierto (cuerpo completo) puede sumar una vez el cuerpo más rico.
- **Idempotente:** reenviar el mismo mensaje no duplica (SIR deduplica por hash).
