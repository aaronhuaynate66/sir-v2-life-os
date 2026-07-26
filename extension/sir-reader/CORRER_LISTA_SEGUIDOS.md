# Correr la captura de "Siguiendo" en la otra PC (reader v0.6.6)

El código ya está: el reader detecta solo cuando Aaron abre su lista de seguidos y
la manda al backend, que ya está desplegado. Lo único que falta es **abrir la
pantalla en la PC donde está la sesión de Instagram**.

## Lo que hay que hacer (5 minutos)

1. `git pull` en el repo y **recargar la extensión** en `chrome://extensions`
   (botón ⟳ de "SIR Reader"). Confirmar que dice **0.6.6**.
2. Abrir el popup de la extensión y verificar que el token siga puesto
   (si el campo está vacío, pegar el `READER_INGEST_TOKEN`).
3. Ir a `instagram.com`, entrar al **perfil propio** y hacer clic en **"Siguiendo"**.
4. **Dejar el diálogo abierto y quieto ~2 minutos.** El reader hace el scroll solo,
   pausado (~1 s por tanda), y para cuando la lista deja de crecer o si Instagram
   muestra cualquier señal de límite. No hay que scrollear a mano.
5. Abrir el popup: la línea de estado debe decir
   `social: N señal(es), following: <guardados>/<nombres recuperados>`.

## Cómo se sabe que funcionó

El segundo número es el que importa: **cuántas filas de la bandeja "¿quién es quién?"
recuperaron su nombre**. Cada una de esas pasa a tener sugerencia automática de
contacto, y varias se auto-asignan en la misma pasada.

Antes de correrlo: **115** cuentas sin dueño, **0** seguidos capturados.

Si sale `following: 0/0`, el diálogo no fue detectado — reportar qué se vio en la
consola de la pestaña de Instagram (F12 → Console, filtrar por `sir`) en vez de
reintentar a lo loco.

## Reglas que no se negocian

- **Solo cuando Aaron abre la pantalla.** El reader nunca navega a `/following/` por
  su cuenta.
- Si Instagram muestra "intenta más tarde" o cualquier límite, **parar** y no
  reintentar en esa sesión.
- Nada de esto toca lo que ya funciona (historias, "Seguido por").

## Referencias

- Captura: `content/instagramReader.js` (bloque de "Siguiendo")
- Backend: `src/app/api/social/ingest/route.ts` → tabla `social_following` (mig 0170)
- La tarea de construcción, ya hecha: `PROMPT_LISTA_SEGUIDOS.md`
