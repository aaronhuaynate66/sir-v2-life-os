# Correr SIR Reader sobre WhatsApp Web en OTRA PC

**Objetivo:** dejar corriendo la extensión **SIR Reader** en el Chrome/Edge de OTRA
PC — una donde **WhatsApp Web ya está abierto y logueado** — para ir **jalando los
chats hacia SIR** (`https://sir-v2-life-os.vercel.app`).

La captura **NO necesita que hagas nada**. Al cargar la pestaña, el lector lee el
**Store interno** de WhatsApp Web con wa-js y trae solo los chats con actividad del
último mes; después escucha los mensajes nuevos en vivo. Nada de scroll a mano.
Es READ-ONLY: nunca envía mensajes.

> Si quieres más historial o un chat puntual (ej. todo el de Diana), se pide **por
> comando remoto** desde el repo — no se hace a mano acá:
>
>     node scripts/reader-comando.mjs --resync --chat "Diana" --dias 400

Esta guía la puede seguir un **agente que gestiona esa PC** o una **persona no
técnica**. Anda paso por paso.

> **Dato que te tiene que pasar Aaron (no está en el repo):**
> - `READER_INGEST_TOKEN` — el token secreto (una cadena larga). Va en `config.js`
>   o en el popup. **No lo inventes**: pídeselo a Aaron.
> - La **URL de SIR** ya viene seteada a producción (`https://sir-v2-life-os.vercel.app`).
>   No hace falta tocarla salvo que Aaron te diga otra.

---

## Paso 1 — Traer la extensión a esa PC

Necesitas la carpeta **`extension/sir-reader/`** del repo (la que tiene
`manifest.json`) en esa PC. Dos formas:

**Con Git** (si esa PC tiene git y acceso al repo):

```bash
git clone https://github.com/aaronhuaynate66/sir-v2-life-os.git
cd sir-v2-life-os/extension/sir-reader
```

(Si el repo ya está en esa PC: `git pull` y anda a `extension/sir-reader`.)

**A mano:** copia la carpeta `sir-reader` entera por USB / Drive / lo que sea.
Anota la **ruta absoluta** de esa carpeta (la vas a necesitar en el Paso 3).

## Paso 2 — Poner el token

Tienes **dos opciones**; con hacer UNA alcanza.

**Opción A — editar `config.js` (recomendada para un agente):**
Abre el archivo **`config.js`** dentro de `sir-reader/` y pega el token que te dio
Aaron en `token`. Deja `sirUrl` como está:

```js
self.__SIR_CONFIG = {
  sirUrl: 'https://sir-v2-life-os.vercel.app',
  token: '<READER_INGEST_TOKEN>', // ← reemplaza esto por el token real que te pasó Aaron
};
```

> El `<READER_INGEST_TOKEN>` es un placeholder: **pones el valor real** que te dio
> Aaron (sin los signos `<` `>`). **No subas al repo ni compartas** este cambio — el
> token es secreto y vive solo local en esta PC.

**Opción B — por el popup (más fácil para una persona):**
Puedes dejar `config.js` como está y cargar el token después desde la UI de la
extensión (ver Paso 4). Si lo haces por el popup, el popup **pisa** lo de `config.js`.

## Paso 3 — Cargar la extensión sin empaquetar en Chrome/Edge

Tiene que ser el **mismo Chrome/Edge (mismo perfil) donde WhatsApp Web está
logueado** — no un navegador nuevo.

1. Abre `chrome://extensions` (en Edge: `edge://extensions`).
2. Activa **"Modo de desarrollador"** (Developer mode), arriba a la derecha.
3. Click en **"Cargar extensión sin empaquetar"** (Load unpacked).
4. En el selector, elige la carpeta **`sir-reader`** (la ruta del Paso 1).
5. Debe aparecer **"SIR Reader"** en la lista, **sin errores**. Si sale un error
   rojo, ábrelo y repórtalo.
6. Opcional: fija el ícono en la barra (ícono de pieza de rompecabezas → pin) para
   verlo fácil.

## Paso 4 — (Si elegiste la Opción B) cargar el token por el popup

Solo si NO pusiste el token en `config.js`:

1. Click en el ícono de **SIR Reader**.
2. **URL de tu SIR:** deja `https://sir-v2-life-os.vercel.app`.
3. **Token:** pega el `READER_INGEST_TOKEN`.
4. Deja **WhatsApp Web** en **ON**.
5. Click **Guardar**.

## Paso 5 — Abrir WhatsApp Web y dejarlo

1. En ese mismo navegador, anda a **`web.whatsapp.com`** (ya logueado).
2. **Y listo.** No hay que abrir chats ni scrollear: al cargar la pestaña, el lector
   lee el Store interno y manda solo los chats con actividad del último mes; después
   escucha los mensajes nuevos en vivo.
3. Para confirmarlo, abre **F12 → Console** y filtra por `SIR`. Deberías ver
   `WhatsApp Web listo → live + backfill` y después
   `backfill: N totales · M activos · procesando K`.

> **⚠️ LO ÚNICO QUE HAY QUE RECORDAR: si recargas o actualizas la extensión, RECARGA
> TAMBIÉN ESTA PESTAÑA (F5).** Chrome no reinyecta los content scripts en pestañas ya
> abiertas, así que la extensión nueva late y parece sana mientras el lector viejo
> quedó huérfano y no lee nada. Eso dejó al reader muerto del 26 al 30 de julio con el
> latido diciendo "ok". Desde la v0.9.0 la extensión recarga estas pestañas sola al
> actualizarse, pero si algo queda raro, F5 es la primera cosa a probar.

## Paso 6 — Verificar que está funcionando

Dos formas de confirmar:

**A — El popup de la extensión:**
Click en el ícono de **SIR Reader**. Mira **"Mensajes enviados"**:
- Debería ser **> 0** y subir a medida que abres chats y scrolleas.
- Muestra el **último hilo** enviado y la plataforma.
- Si hay un problema, aparece una **línea de error roja** (ej. "Falta el token",
  o un `HTTP 4xx/5xx`).

**B — La consola del navegador (F12):**
Con la pestaña de WhatsApp Web activa, abre **F12 → Console** y filtrá por
`SIR Reader`. Vas a ver logs como:
- `observando whatsapp …` → la extensión enganchó el contenedor de mensajes (bien).
- `enviado <nombre del chat> <N> ok` → mandó N mensajes de ese chat a SIR (éxito).
- `no encontré el contenedor de mensajes … los selectores necesitan ajuste` →
  problema (ver Notas).

**Qué indica éxito:** el contador **"Mensajes enviados" > 0** sin error rojo, y/o
logs `enviado … ok` en la consola. Del lado de SIR, esos chats aparecen como
conversaciones a los pocos segundos.

**Si el contador no sube** aunque veas mensajes: en el popup, click en
**"Probar detección (en la pestaña activa)"** (estando en la pestaña de WhatsApp
Web con un chat abierto). Te dice si encontró el hilo, el contenedor, y cuántos
mensajes extrajo, con una muestra. **Copia ese reporte y pásaselo a Aaron** — con
eso se ajustan los selectores.

Si dice **"Falta el token"**: revisa el Paso 2/4 y **recarga la extensión** (botón
↻ en `chrome://extensions`) después de editar `config.js`.

## Notas importantes

- **Los selectores de WhatsApp pueden cambiar.** WhatsApp actualiza su HTML seguido.
  Si la extensión **deja de capturar** (contador no sube, o log "no encontré el
  contenedor…"), corre "Probar detección" y **avísale a Aaron** con el reporte —
  hay que ajustar `content/whatsapp.js`.
- **Solo texto.** No se scrapea multimedia (fotos, audios, videos, stickers), solo
  el texto de los mensajes.
- **Atribución a personas.** SIR atribuye el chat a un contacto **si el nombre del
  chat coincide con un contacto ya cargado** en SIR. Si el nombre no matchea, el
  mensaje igual entra pero puede no quedar asociado a la persona.
- **Pasivo, sin auto-scroll:** no cambies eso. Nada de scripts de auto-scroll ni
  requests automáticos — solo leemos lo que ya está en pantalla.
- **Solo WhatsApp Web** en esta PC. No actives ni uses la extensión para
  LinkedIn/Instagram/Facebook: violan el ToS y arriesgan la cuenta.
- **El token es secreto:** no lo pegues en el repo, chats públicos ni logs.
- **Idempotente:** reenviar mensajes no duplica (SIR deduplica por hash). Si
  recargas la extensión o re-scrolleas un chat, no pasa nada.

## Qué reportarle a Aaron

- ✅ "SIR Reader cargada en la otra PC, popup muestra N mensajes enviados, sin
  errores. Jalando chats: [lista]."
- ⚠️ Si algo falla: el texto del error del popup, **o** el reporte de "Probar
  detección", **o** las líneas `[SIR Reader]` de la consola.
