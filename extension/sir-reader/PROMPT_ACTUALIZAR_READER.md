# Tarea para el agente de la otra PC — actualizar el SIR Reader a v0.7.0

Hola. La extensión **SIR Reader** que corre en esa PC se actualizó. Esta tarea es
corta: traer el código nuevo, recargar la extensión y verificar que captura.

---

## ⚠️ ANTES DE HACER `git pull` — LEER ESTO

Hay una **divergencia conocida** entre el repo y esa PC.

En algún momento se te pidió implementar la captura de **"Seguido por … que
sigues"** (el campo `followedBy`, ver `PROMPT_SEGUIDORES_EN_COMUN.md`). Eso
**funcionó** — en la base hay filas reales en `social_page_followers`. Pero ese
código **nunca se commiteó al repo**: hoy `instagramReader.js` en `main` no tiene
ni una referencia a `followedBy`.

Traducción: **un `git pull` limpio te borra esa funcionalidad.**

Antes de actualizar:

```bash
cd sir-v2-life-os
git status
git diff -- extension/sir-reader/ > /tmp/reader-local.patch
```

1. Si `git status` muestra `extension/sir-reader/content/instagramReader.js`
   modificado → **guardá ese diff** (el comando de arriba lo deja en un archivo).
2. Hacé el pull (abajo).
3. **Re-aplicá tu implementación de `followedBy` sobre el código nuevo** y
   mandanos el diff para commitearlo de una vez y que esto no se repita.

Si `git status` sale limpio, no había nada local y podés seguir tranquilo.

---

## Paso 1 — Traer el código

```bash
cd sir-v2-life-os
git pull
```

Verificá que quedó en la versión nueva:

```bash
grep '"version"' extension/sir-reader/manifest.json   # debe decir 0.7.0
```

> El `config.js` con el token es local y **no** se toca con el pull (no está en
> el repo). Si por algo quedó vacío, volvé a pegar el `READER_INGEST_TOKEN`.

## Paso 2 — Recargar la extensión

En el Chrome logueado con Instagram: `chrome://extensions` → botón **recargar**
(⟳) en SIR Reader. Confirmá que la tarjeta diga **0.7.0**.

## Paso 3 — Qué cambió (y qué NO hay que hacer)

**Nuevo: captura de datos de perfil.** Cuando Aaron entra a un perfil de
Instagram, el reader ahora levanta **nombre real, bio, seguidores, publicaciones,
categoría y si es cuenta de negocio**.

Esto **NO cambia la postura pasiva** y es importante que se entienda:

- El reader **NO abre perfiles**, **NO recorre listas** y **NO hace ningún
  request propio**. Sigue intachable la regla del `README.md`: *la línea que no
  cruzamos*.
- Instagram **ya mandaba** todos esos datos en la respuesta que carga la página
  cuando Aaron entra a un perfil por su cuenta. El reader antes la miraba y la
  tiraba (filtraba solo la barra de historias). Ahora la lee.
- O sea: **cero requests nuevos, cero riesgo nuevo.**

**Lo que NO hay que hacer:** no automatices visitas a perfiles, no hagas scroll
por listas de seguidores, no abras historias. Si se te ocurre "acelerar" la
captura recorriendo cuentas, **no lo hagas** — eso es exactamente lo que hace que
IG limite o bloquee la cuenta de Aaron.

## Paso 4 — Verificar que funciona

Abrí la consola de la pestaña de Instagram (F12 → Console) y entrá a **cualquier
perfil** (el de un amigo, una página, lo que sea). Deberías ver:

```
[SIR Reader] social→ 1 señal(es), 0 seguido(s) ok
```

Para confirmar del lado del servidor, la respuesta del POST trae un contador
nuevo: **`profilesSaved`**. Si es ≥ 1, el perfil se guardó.

Si entrás a 3-4 perfiles y `profilesSaved` sigue en 0, avisá con:
- la URL del endpoint que IG usó (pestaña Network, filtrá por `graphql` o
  `web_profile_info`),
- y un pedazo del JSON de respuesta (sin datos personales de terceros).

Instagram cambia sus shapes seguido; el extractor es tolerante pero puede
necesitar un ajuste.

---

## Lo que Aaron tiene que hacer (no vos)

Que **navegue Instagram normal** en ese Chrome. Nada especial: entrar a los
perfiles de la gente que le importa. Cada perfil que abre queda registrado.

El porqué: hoy hay **130 cuentas en la bandeja "¿quién es quién?" y ninguna con
nombre**. La barra de historias solo da el handle, y los handles no son parlantes
(`@yayocastaneda.pe`, `@voxpopuli.consultoria`). El nombre real vive en el perfil.

**Si además querés resolver muchas de golpe:** seguí el runbook
`CORRER_LISTA_SEGUIDOS.md` (5 minutos) — captura el catálogo completo de
"Siguiendo" y rellena nombres en lote. Eso sigue siendo la vía más rápida y no
cambió con esta actualización.
