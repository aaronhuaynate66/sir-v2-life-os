# Tarea para el agente de la otra PC — capturar "Seguido por … que sigues"

## Qué queremos y por qué

Cuando Aaron abre el perfil de una cuenta en Instagram (sobre todo **páginas**:
`@firebrothersperu`, `@daedoperu`, `@voxpopuli.consultoria`…), Instagram le muestra
un renglón como:

> **Seguido por** `fiorellanicolini`, `rodrigo12980` **y 12 personas más que sigues**

Ese renglón es **el único lugar donde existe ese dato**. Ninguna API ni ningún
servicio de terceros lo expone — solo se ve desde la cuenta propia, logueada. Y es
justo lo que necesitamos: saber **quiénes del círculo de Aaron siguen la misma
página** = intereses en común, que es lo que vuelve el grafo un mapa de afinidades
y no solo de trato.

El backend **ya está listo y desplegado**: falta que el reader mande el dato.

## Qué hay que hacer

En `content/instagramReader.js`, cuando se esté en una **página de perfil**
(`instagram.com/<handle>/`), leer ese renglón y agregar al item que ya se emite un
campo nuevo:

```js
{
  platform: 'instagram',
  handle: 'firebrothersperu',        // la cuenta cuyo perfil se está viendo
  name: 'Fire Brothers Perú',
  // NUEVO — opcional; si no se encuentra el renglón, simplemente no se manda:
  followedBy: [
    { handle: 'fiorellanicolini', name: 'Fiorella Nicolini' },
    { handle: 'rodrigo12980' },
  ],
}
```

Se manda por el **mismo** `emit(items)` de siempre, al mismo endpoint
`/api/social/ingest`. No hay endpoint nuevo, no hay token nuevo.

## Cómo encontrarlo en el DOM

- El renglón vive en el header del perfil. El texto arranca con **"Seguido por"**
  (es) o **"Followed by"** (en).
- Los nombres visibles son `<a href="/<handle>/">` dentro de ese contenedor →
  de ahí sale `handle` (el `href` sin barras) y `name` (el texto del link).
- El **"y N personas más"** no trae handles: **ignorarlo**. Con 2-3 nombres por
  página ya alcanza para cruzar; no vale la pena abrir nada.
- Si Aaron hace click y abre el modal de "Seguidores que conoces", ahí sí hay una
  lista completa: si es fácil, capturarla también (mismo `followedBy`). **Nunca
  abrirlo por cuenta propia.**

## Reglas que no se negocian

1. **Pasivo.** Solo se lee lo que Aaron ya tiene en pantalla. Nada de navegar a
   perfiles, abrir modales, hacer scroll automático ni pedir endpoints internos de
   IG. Eso es lo que hace que la cuenta se marque.
2. **Fail-soft.** Si el renglón no está o el DOM cambió, no mandar `followedBy` y
   listo — el item sigue siendo válido sin él.
3. **Sin duplicar trabajo.** El backend deduplica por (usuario, página, seguidor):
   mandar lo mismo diez veces no rompe nada.
4. Subir la versión en `manifest.json` y avisar cuál quedó.

## Cómo saber que funcionó

En la respuesta de `/api/social/ingest` aparece el contador nuevo:

```json
{ "inserted": 3, "matched": 2, "unmatched": 1, "followerRows": 7 }
```

`followerRows > 0` = el dato llegó y se guardó en `social_page_followers`. Del
lado de SIR, esas filas se convierten solas en aristas `follows_org` del grafo
(person → org) en cuanto la página esté asignada a una organización desde la
bandeja "¿quién es quién?".

## Contexto útil

- El reader ya manda `handle`, `name`, `avatarUrl`, `hasActiveStory`, `activityAt`.
  Esto es un campo más en el mismo item.
- Backend: `src/app/api/social/ingest/route.ts` (`recordPageFollowers`), tabla
  `social_page_followers` (mig 0167).
