# Instalar SIR Reader en esta PC (handoff para un agente)

**Objetivo:** dejar corriendo la extensión **SIR Reader** en el Chrome/Edge de ESTA
PC (que tiene **Microsoft Teams** abierto y logueado), para que vaya leyendo, de
forma **pasiva**, las conversaciones de Teams y las mande a **SIR**
(`https://sir-v2-life-os.vercel.app`). No hay que scrapear ni auto-scrollear: la
extensión solo lee lo que ya se ve en pantalla mientras Teams está abierto.

> **También lee el correo** de **Outlook Web** (`outlook.office.com`) con la misma
> postura pasiva — útil cuando **no** hay acceso admin a Azure/Graph. El correo va
> a `/api/email/ingest` (mismo token). Si solo te pidieron Teams, dejá el resto en
> ON igual: no molesta, y captura correo si el humano abre OWA en ese Chrome.

> **Datos que el humano (Aaron) te tiene que pasar aparte** (no están en el repo):
> - `READER_INGEST_TOKEN` — el token secreto (una cadena larga). Va en `config.js`.
> - Confirmar la **URL de SIR** (por defecto `https://sir-v2-life-os.vercel.app`).

---

## Paso 1 — Traer la extensión

En una terminal:

```bash
git clone https://github.com/aaronhuaynate66/sir-v2-life-os.git
cd sir-v2-life-os/extension/sir-reader
```

(Si el repo ya está en la PC: `git pull` y andá a `extension/sir-reader`.)
La carpeta que vas a cargar es **`sir-reader`** (la que tiene `manifest.json`).

## Paso 2 — Poner el token (sin tocar la UI)

Editá **`config.js`** y pegá el token en `token`. Dejá `sirUrl` como está (o la URL que te dieron):

```js
self.__SIR_CONFIG = {
  sirUrl: 'https://sir-v2-life-os.vercel.app',
  token: 'PEGÁ_ACÁ_EL_READER_INGEST_TOKEN',
};
```

> No commitees este cambio (el token es secreto). Es solo local en esta PC.

## Paso 3 — Cargar la extensión en el Chrome logueado

Tiene que ser el **mismo Chrome/perfil donde Teams está logueado** (no un Chrome nuevo).

**Vía interfaz (la confiable):**
1. En ese Chrome, abrí `chrome://extensions` (en Edge: `edge://extensions`).
2. Activá **"Modo de desarrollador"** (Developer mode), arriba a la derecha.
3. Click **"Cargar descomprimida"** (Load unpacked).
4. En el selector de archivos, elegí la carpeta **`sir-reader`** (la ruta del Paso 1).
5. Debe aparecer **"SIR Reader"** en la lista, sin errores. Si aparece un error rojo, abrilo y reportalo.

*(Alternativa por línea de comandos, solo si podés cerrar Chrome del todo: cerrá TODO Chrome y relanzalo con `--load-extension="RUTA_ABSOLUTA_A/sir-reader"` apuntando al mismo `--user-data-dir` del perfil logueado. Es más frágil; preferí la vía interfaz.)*

## Paso 4 — Verificar que anda

1. En ese Chrome, andá a **`teams.microsoft.com`** (ya logueado) y **abrí un chat con mensajes**.
2. Scrolleá/mirá el chat normal unos segundos (así se renderizan mensajes → la extensión los ve).
3. Click en el ícono de **SIR Reader** (barra de extensiones). En el popup, mirá **"Mensajes enviados"**: debería ser **> 0** y mostrar el último hilo. Si hay error, lo muestra ahí.
4. Confirmación del otro lado: en SIR (`/relaciones` o "Preguntá a SIR"), esos hilos aparecen como conversaciones a los pocos segundos.

## Cómo saber que quedó bien

- Popup: **"Mensajes enviados" > 0** y **sin** línea de error roja.
- Si dice **"Falta el token"** → revisá el Paso 2 (`config.js`) y recargá la extensión (botón ↻ en `chrome://extensions`).
- Si el contador **no sube** aunque veas mensajes: en el popup, click **"Probar detección (en la pestaña activa)"** (estando en la pestaña de Teams/WhatsApp con un chat abierto). Te dice si encontró el hilo, el contenedor y cuántos mensajes extrajo, con una muestra y una pista del DOM. **Copiá ESE reporte y pásalo** — con eso se ajustan los selectores exactos. (También podés mirar la consola: F12 → Console → filtro `SIR Reader`.)

## Reglas (no las cambies)

- **Pasivo:** solo leer lo que ya está en pantalla. **Nada** de auto-scroll, requests automáticos ni crawl de fondo.
- **Solo Teams, WhatsApp Web y Outlook Web (correo).** No actives LinkedIn/Instagram/Facebook: violan el ToS y arriesgan la cuenta.
- El token es **secreto**: no lo pegues en el repo, chats públicos, ni logs.
- Idempotente: reenviar mensajes no duplica (SIR deduplica por hash), así que no pasa nada si recargás la extensión.

## Qué le reportás al humano

- ✅ "SIR Reader cargada, popup muestra N mensajes enviados, sin errores."
- ⚠️ Si algo falla: el texto del error del popup **o** las líneas `[SIR Reader]` de la consola de Teams.
