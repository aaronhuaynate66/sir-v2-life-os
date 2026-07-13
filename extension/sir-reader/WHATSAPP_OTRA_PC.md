# Correr SIR Reader sobre WhatsApp Web en OTRA PC

**Objetivo:** dejar corriendo la extensión **SIR Reader** en el Chrome/Edge de OTRA
PC — una donde **WhatsApp Web ya está abierto y logueado** — para ir **jalando los
chats hacia SIR** (`https://sir-v2-life-os.vercel.app`).

La captura es **PASIVA**: la extensión solo lee lo que **ya está renderizado** en el
chat que tenés abierto. No scrapea, no auto-scrollea, no manda requests de fondo.
Para traer un chat, **vos** lo abrís y scrolleás hacia arriba; la extensión lee lo
que va apareciendo y lo manda a SIR.

Esta guía la puede seguir un **agente que gestiona esa PC** o una **persona no
técnica**. Andá paso por paso.

> **Dato que te tiene que pasar Aaron (no está en el repo):**
> - `READER_INGEST_TOKEN` — el token secreto (una cadena larga). Va en `config.js`
>   o en el popup. **No lo inventes**: pedíselo a Aaron.
> - La **URL de SIR** ya viene seteada a producción (`https://sir-v2-life-os.vercel.app`).
>   No hace falta tocarla salvo que Aaron te diga otra.

---

## Paso 1 — Traer la extensión a esa PC

Necesitás la carpeta **`extension/sir-reader/`** del repo (la que tiene
`manifest.json`) en esa PC. Dos formas:

**Con Git** (si esa PC tiene git y acceso al repo):

```bash
git clone https://github.com/aaronhuaynate66/sir-v2-life-os.git
cd sir-v2-life-os/extension/sir-reader
```

(Si el repo ya está en esa PC: `git pull` y andá a `extension/sir-reader`.)

**A mano:** copiá la carpeta `sir-reader` entera por USB / Drive / lo que sea.
Anotá la **ruta absoluta** de esa carpeta (la vas a necesitar en el Paso 3).

## Paso 2 — Poner el token

Tenés **dos opciones**; con hacer UNA alcanza.

**Opción A — editar `config.js` (recomendada para un agente):**
Abrí el archivo **`config.js`** dentro de `sir-reader/` y pegá el token que te dio
Aaron en `token`. Dejá `sirUrl` como está:

```js
self.__SIR_CONFIG = {
  sirUrl: 'https://sir-v2-life-os.vercel.app',
  token: '<READER_INGEST_TOKEN>', // ← reemplazá esto por el token real que te pasó Aaron
};
```

> El `<READER_INGEST_TOKEN>` es un placeholder: **ponés el valor real** que te dio
> Aaron (sin los signos `<` `>`). **No commitees ni compartas** este cambio — el
> token es secreto y vive solo local en esta PC.

**Opción B — por el popup (más fácil para una persona):**
Podés dejar `config.js` como está y cargar el token después desde la UI de la
extensión (ver Paso 4). Si lo hacés por el popup, el popup **pisa** lo de `config.js`.

## Paso 3 — Cargar la extensión sin empaquetar en Chrome/Edge

Tiene que ser el **mismo Chrome/Edge (mismo perfil) donde WhatsApp Web está
logueado** — no un navegador nuevo.

1. Abrí `chrome://extensions` (en Edge: `edge://extensions`).
2. Activá **"Modo de desarrollador"** (Developer mode), arriba a la derecha.
3. Click en **"Cargar extensión sin empaquetar"** (Load unpacked).
4. En el selector, elegí la carpeta **`sir-reader`** (la ruta del Paso 1).
5. Debe aparecer **"SIR Reader"** en la lista, **sin errores**. Si sale un error
   rojo, abrilo y reportalo.
6. Opcional: fijá el ícono en la barra (ícono de pieza de rompecabezas → pin) para
   verlo fácil.

## Paso 4 — (Si elegiste la Opción B) cargar el token por el popup

Solo si NO pusiste el token en `config.js`:

1. Click en el ícono de **SIR Reader**.
2. **URL de tu SIR:** dejá `https://sir-v2-life-os.vercel.app`.
3. **Token:** pegá el `READER_INGEST_TOKEN`.
4. Dejá **WhatsApp Web** en **ON**.
5. Click **Guardar**.

## Paso 5 — Abrir WhatsApp Web y jalar los chats

1. En ese mismo navegador, andá a **`web.whatsapp.com`** (ya logueado).
2. **Abrí un chat** de la lista (uno con mensajes). La extensión captura lo que
   está **renderizado en ese hilo abierto**.
3. Para traer historial, **scrolleá hacia arriba** en el chat, despacio: WhatsApp
   va renderizando mensajes más viejos a medida que subís, y la extensión los va
   leyendo y mandando a SIR. Si no scrolleás, solo capturás lo que se ve de entrada.
4. **Conviene ir chat por chat:** abrí un chat, scrolleá hasta donde quieras traer,
   esperá unos segundos (manda en lotes cada ~4s), y pasá al siguiente. Cambiar de
   chat rápido sin dejar que renderice = menos mensajes capturados.

> **Importante:** es PASIVO. No hay un botón de "importar todo". El historial que
> entra a SIR es exactamente el que vos hacés aparecer en pantalla scrolleando.

## Paso 6 — Verificar que está funcionando

Dos formas de confirmar:

**A — El popup de la extensión:**
Click en el ícono de **SIR Reader**. Mirá **"Mensajes enviados"**:
- Debería ser **> 0** y subir a medida que abrís chats y scrolleás.
- Muestra el **último hilo** enviado y la plataforma.
- Si hay un problema, aparece una **línea de error roja** (ej. "Falta el token",
  o un `HTTP 4xx/5xx`).

**B — La consola del navegador (F12):**
Con la pestaña de WhatsApp Web activa, abrí **F12 → Console** y filtrá por
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
mensajes extrajo, con una muestra. **Copiá ese reporte y pasáselo a Aaron** — con
eso se ajustan los selectores.

Si dice **"Falta el token"**: revisá el Paso 2/4 y **recargá la extensión** (botón
↻ en `chrome://extensions`) después de editar `config.js`.

## Notas importantes

- **Los selectores de WhatsApp pueden cambiar.** WhatsApp actualiza su HTML seguido.
  Si la extensión **deja de capturar** (contador no sube, o log "no encontré el
  contenedor…"), corré "Probar detección" y **avisale a Aaron** con el reporte —
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
  recargás la extensión o re-scrolleás un chat, no pasa nada.

## Qué reportarle a Aaron

- ✅ "SIR Reader cargada en la otra PC, popup muestra N mensajes enviados, sin
  errores. Jalando chats: [lista]."
- ⚠️ Si algo falla: el texto del error del popup, **o** el reporte de "Probar
  detección", **o** las líneas `[SIR Reader]` de la consola.
