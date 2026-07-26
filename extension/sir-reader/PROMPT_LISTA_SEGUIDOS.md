# Tarea para el agente de la otra PC — capturar la lista de "Siguiendo" de Instagram

## El problema, medido

Aaron tiene **111 cuentas de Instagram en la bandeja "¿quién es quién?"** y **ninguna
trae nombre**. El reader capta el handle desde la barra de historias, pero Instagram
no expone ahí el nombre real.

Se midió qué tan bien matchea el sistema hoy:

```
111 handles sin asignar
  contra sus 80 contactos:               0 sugerencias
  + 33 nombres sacados de WhatsApp:      0 sugerencias
  parecen negocio/página:               21
  sin ninguna pista:                    90
```

**Cero.** Porque los handles no son parlantes: `@yayocastaneda.pe`,
`@voxpopuli.consultoria`, `@jak_gear`. Adivinar el nombre desde el handle no
funciona, y ampliar la lista de nombres conocidos tampoco cambió nada.

## Dónde SÍ está el nombre

En la lista de **"Siguiendo"** (`instagram.com/<usuario>/following/`): ahí IG muestra,
por cada cuenta, el **handle Y el nombre real**. Con ese catálogo el match pasa a ser
**nombre contra nombre** —"Diana Carolina" ↔ "Diana Carolina"— y la bandeja se
resuelve en lote en vez de una por una.

## Qué hay que hacer

Cuando Aaron abra su propia lista de seguidos, leer los pares visibles y mandarlos al
**mismo endpoint de siempre** (`/api/social/ingest`), en un campo nuevo `following`,
al mismo nivel que `items`:

```js
{
  items: [ /* lo de siempre, puede ir vacío */ ],
  following: [
    { handle: 'diana.carolina.d', name: 'Diana Carolina' },
    { handle: 'firebrothersperu', name: 'Fire Brothers Perú' },
    { handle: 'jak_gear',         name: 'JAK Gear' }
  ]
}
```

Sin token nuevo, sin endpoint nuevo. El backend ya está desplegado y esperando.

### Cómo leerlo del DOM

- La lista vive en un diálogo con scroll (`role="dialog"`). Cada fila tiene un
  `<a href="/<handle>/">` y, debajo o al lado, un `<span>` con el nombre real.
- **El scroll sí está permitido acá** (a diferencia de la captura de "Seguido por"):
  es la pantalla que Aaron abrió a propósito para esto. Baja de a poco, con pausas
  de ~1 s, y **para si la lista deja de crecer** o si aparece cualquier señal de
  límite. No abras el diálogo tú: espera a que él lo abra.
- Manda por lotes (200-500 por request) en vez de acumular miles y disparar uno solo.
- Si una fila no tiene nombre, manda solo el handle: sirve igual.

## Reglas que no se negocian

1. **Solo cuando Aaron abre la pantalla.** No navegues a `/following/` por tu cuenta.
2. **Ritmo humano.** Scroll pausado; si IG muestra un límite o un "intenta más tarde",
   parar y no reintentar en esa sesión.
3. **Fail-soft.** Si el DOM cambió y no encuentras pares, no mandes `following` y no
   rompas nada de lo que ya funciona (historias, "Seguido por").
4. Sube la versión en `manifest.json` y avisa cuál quedó.

## Cómo saber que funcionó

La respuesta del ingest trae dos contadores nuevos:

```json
{ "followingSaved": 340, "namesFilled": 78 }
```

- `followingSaved`: cuántas cuentas del catálogo se guardaron.
- `namesFilled`: **cuántas filas de la bandeja recuperaron su nombre**. Ese es el
  número que importa: cada una de esas pasa a tener sugerencia automática de
  contacto, y varias se auto-asignan solas en la misma pasada.

Aaron debería ver la bandeja bajar de 111 a un puñado.

## Referencias

- Backend: `src/app/api/social/ingest/route.ts` (bloque "CATÁLOGO DE SEGUIDOS")
- Tabla: `social_following` (migración 0170)
- El campo `followedBy` de la tarea anterior sigue igual y no se toca.
