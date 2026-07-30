# SIR V2 — Backlog Canónico

> ⚠️ **ESTE DOC SE MANTIENE A MANO Y DERIVA.** El código avanza más rápido que este
> archivo, así que acumula ítems "ya hechos pero listados como pendientes". **Antes de
> tratar CUALQUIER cosa de acá como pendiente, verificala contra el código** (grep de la
> feature/tabla/endpoint). Reconciliar primero, listar después — nunca al revés.
>
> **Última actualización:** 30/07/2026 (agente automático de reconciliación — 3 ítems cerrados, ver bloque "RECONCILIACIÓN AUTOMÁTICA 2026-07-30" abajo; antes consolidaba los pases 25, 26, 27 y 28/07).
> **Source of truth:** este archivo, NO `MASTER_PLAN.md` (regenerado por bot).
> **Roadmap estratégico (6 etapas + estado):** [`STRATEGIC_ROADMAP.md`](./STRATEGIC_ROADMAP.md).
> **Cómo usar:** entrá acá cuando quieras decidir qué priorizar en la próxima sesión.

---

## 📋 PENDIENTES ACTUALES — reconciliado 2026-07-24 (LEER PRIMERO)

Vista usable (lo de abajo es histórico pesado). Reconciliado tras la sesión de ~16 PRs (#927–#942).
Ordenado por qué BLOQUEA cada cosa. Artefacto visual: https://claude.ai/code/artifact/045fea0b-7b02-4a33-a013-7d394d9d85f6

**🟢 Listo para construir (autónomo, sin bloqueo):**
- ~~**[alta] Fuga de voseo en el chat**~~ ✅ **CERRADO POR MEDICIÓN (28/07/2026).** Tres pases anteriores se contradijeron sobre esto (25/07 y 28/07 lo marcaron hecho; 27/07 dijo "sigue genuinamente abierto, es whack-a-mole"). **Se zanjó midiendo la salida real, no opinando** — la lección de #975: el idioma se mide con `detectVoseo`, no se juzga con un LLM. Corrida sobre los 12 mensajes que SIR le mandó a Aaron entre el 26 y el 28/07: **1 con voseo, 11 limpios**. El único sucio es el push de las 02:01 del 26/07 (`cerrá`, `descansá`), emitido ANTES de que mergeara #990. Los de 02:58 del 27 y 02:20 del 28 dicen "Cierra el día". **Lo que cerró el canal fue #990**: `deVoseo(stripMarkdown(...))` en los 3 puntos de envío de `lib/telegram/client.ts`, así que ahora pasa también el TEXTO FIJO escrito a mano —que era el que se escapaba— y no solo la salida del LLM. Sigue siendo una carrera detector-vs-modelo: **re-medir, no dar por eterno.**
- ~~**[media] Copy del recordatorio "¡Listo!"**~~ ✅ **HECHO** (los 4 pases coinciden). `src/lib/sir/askSir.ts` ~1182-1190: si la respuesta abre afirmando "hecho" o queda muy corta, se reemplaza por "Te propongo esto — revísalo y confírmalo. 👇". PR #944 (`f01c19d`, 23/07); caso `action-honesty` del harness 30→95. Estaba en prod ANTES del pase 07-24 que lo siguió listando.
- **[baja] Verborrea a "consejo corto"** — 🟡 **PARCIAL** (los 4 pases coinciden). Hay una línea de BREVEDAD en el prompt (`src/lib/sir/ask.ts`, mismo `f01c19d`) pero el propio commit la califica de "efecto marginal". No hay scrub determinístico como en voseo. **No cerrar sin re-medir con el harness.**
- **[alta] Ola 2 · slice 4 — loop de aprendizaje** — **sigue pendiente** (re-verificado en los 4 pases y otra vez el 28/07): `sortLearnings` (`src/lib/learnings/recall.ts:48`) sigue con `{ principle: 0, pattern: 1, preference: 2, fact: 3 }` y no hay rastro de few-shot dinámico. **Bloqueado por combustible, no por código:** `chat_feedback` = **0 filas** al 28/07 — Aaron nunca calificó una respuesta. Construir el mecanismo hoy = mecanismo vacío.
- ~~**[media] Que `askSir` VEA los sub-pasos de los objetivos**~~ ✅ **HECHO (reconciliado 30/07/2026).** `src/lib/sir/askSir.ts` líneas 679-762: ahora lee `objective_steps` (línea 692, hasta 1000 filas), computa `advanceByGoal`/`nextStepByGoal` (`computeGoalAdvance`, `nextPendingLeaf`) y arma `goalsCtx` con `progress`/`stepsDone`/`stepsTotal`/`overdue`/`nextStep`/`nextStepDue`/`nextStepDetail` que sí llega al prompt del modelo. Comentario in situ del propio código: "hasta el 28-jul el chat era ciego a `objective_steps` — 151 pasos en la base y no podía responder '¿cómo voy con Boticas?'". Fail-soft si la lectura falla. Sigue sin leer `goals.milestones` (JSON) — ese sub-punto de la consolidación de estructuras (más abajo) sigue abierto.

**🟡 Necesita input/decisión de Aaron:**
- **[media] Golden-set del harness** — sumar casos a `eval/golden.jsonl` O usar SIR con 👍/👎+corrección → `npm run eval:sir --from-feedback 20`. Mismo combustible que el slice 4, y sigue en 0.
- **[alta] Consolidar las 3 estructuras de sub-pasos** — nuevo (28/07). Los sub-pasos de un objetivo viven en TRES lugares: `goals.milestones` (JSON), `objective_steps` (151 filas, la viva) y `objective_blockers` (11 filas, todas del Mundial). El Mundial tiene los mismos ítems escritos en los tres. Consolidar toca data de Aaron → requiere su OK.
- **[media] Purgar los planes de junio** — nuevo (28/07). De 151 pasos, **150 pendientes y 50 vencidos**, casi todos de planes cargados el 2-3/06 que nunca se tocaron. No es bug de cómputo: el plan es papel muerto. Decidir qué sigue vivo es de Aaron.
- ~~**[media] Activar `looksLikeOrg`**~~ ✅ **HECHO (reconciliado 30/07/2026).** Nuevo `src/lib/social-reader/orgVerdict.ts` (`clasificarCuenta`/`repartirLote`, PURO, con tests en `orgVerdict.test.ts`) junta `looksLikeOrg` + el nombre escrito por Aaron + el léxico del handle en un solo veredicto, y decide "sugiere, no descarta": confianza 'alta' se propone en lote, 'media' se pregunta de a una — nunca auto-clasifica en silencio. Cableado en vivo en `src/app/api/cron/evening-push/route.ts` (líneas 156-171): trae `social_profiles`, llama `repartirLote` y arma el batch de Telegram. Comentario in situ fecha esto el 29/07/2026 ("`looksLikeOrg` estaba escrita y testeada desde el 28-jul y NADIE la llamaba — quedó a medias dos veces").
- ~~**[media] Log de entrenamiento por ejercicio**~~ ✅ **HECHO (reconciliado 30/07/2026).** Migración `0174_training_exercises.sql` (tabla `training_exercises`: `name`/`name_key`/`sets` jsonb `[{reps,kg}]`/`unit`/`bodyweight`, RLS, índice de progresión por `user_id, name_key`). Parser determinístico `src/lib/entrenamiento/ejercicios.ts` (`parseExerciseLine`, regex — explícitamente NO vía LLM, "un dato calculado que se persiste es un dato que se desincroniza") entiende "banca 3x12 con 80", "3 series de 10 con 20", etc. Cableado en `src/lib/sir/executeAction.ts` líneas 427-446: inserta en `training_exercises` y calcula histórico de progresión por `name_key` contra `training_sessions.date`.

**🔴 Bloqueado (data / otra PC) — construir a ciegas = fantasma:**
- **[media] Match por cara capa 2** — construido; galería de referencia en 0 caras limpias (capturas son screenshots escénicos). Se enciende con fotos-cara reales (asignar en la app, o el reader mandando la foto de perfil real de IG).
- **[media] Reader LinkedIn (otra PC)** — inyectado pero en login; loguear una vez.
- **[baja] Teams** — login manual con ahuaynate@grupohng.com.
- **[baja] Ingesta de DMs de IG** — idea a futuro, vía la extensión de la otra PC.

**🌱 Latente (se enciende con uso, nada que hacer):** diversidad emocional en /salud (usar los chips de ánimo); recordatorios por chat (ya andan).

**👁 Verificar (Aaron):** "¿quién es quién?" con botones nuevos → próximo brief nocturno (o reset a pedido); si algo se ve viejo en /panel · /horario · /red · caras en la lista → caché PWA, refresco fuerte.

**🧭 Fondo / roadmap grande (no urgente):** grafo /red → sigma.js (sin rastro en código, `grep` de "sigma" vacío — sigue pendiente); Ola 3 — memoria que consolida: ~~hybrid search vector+BM25~~ ✅ **HECHO** (mig `0164_memories_hybrid_recall`, RPC `match_memories_hybrid` vector+FTS con RRF, `src/lib/sir/hybridRecall.ts`, PR #946 `c34ed7e`, cableado en `askSir.ts` con fallback) — **re-ranking y el ciclo Mem0-style extract→merge→olvido siguen sin empezar** (los 4 pases coinciden).

---

## 🔁 RECONCILIACIÓN AUTOMÁTICA 2026-07-30

Pase de mantenimiento contra el código real (agente automático), sobre la sección "PENDIENTES ACTUALES" de arriba. 3 de los 5 ítems de "Listo para construir" ya estaban construidos — los tres son trabajo posterior al 28/07 que el pase de esa fecha no alcanzó a ver:

- ✅ **`askSir` ya VE los sub-pasos de los objetivos** — `src/lib/sir/askSir.ts` líneas 679-762 lee `objective_steps`, computa avance real (`advanceByGoal`/`nextStepByGoal`) y lo pasa al prompt (`goalsCtx`). El propio código trae fecha in situ ("hasta el 28-jul el chat era ciego a `objective_steps`").
- ✅ **`looksLikeOrg` ya está activo** — `src/lib/social-reader/orgVerdict.ts` (nuevo) lo junta con nombre/handle en un veredicto único ("sugiere, no descarta": alta confianza → lote, media → uno por uno) y está cableado en vivo en `evening-push/route.ts`. Fechado in situ 29/07/2026.
- ✅ **Log de entrenamiento por ejercicio ya existe** — migración `0174_training_exercises.sql` + parser determinístico `src/lib/entrenamiento/ejercicios.ts` + inserción/progresión cableada en `executeAction.ts` (líneas 427-446).

**Verificado y quedó IGUAL (sin drift):**
- **`sortLearnings`** (`src/lib/learnings/recall.ts:48`) sigue con pesos fijos por `kind` — sin few-shot dinámico. Slice 4 sigue bloqueado por combustible (no re-verificable sin consultar `chat_feedback` en vivo).
- **Grafo /red → sigma.js** — sigue sin rastro: no hay dependencia `sigma` en `package.json` ni en `src/lib/graph/` (el único match de `grep sigma` en `src/` es varianza estadística en `partnerEffect.ts`, no la librería).
- **Etapa 6 (AI-Native Human OS)** — `STRATEGIC_ROADMAP.md` línea 33 sigue en "⬜ visión norte".

**No re-verificado este pase** (requieren decisión de Aaron o dato en vivo, no verificable por grep): golden-set del harness, consolidar las 3 estructuras de sub-pasos, purgar planes de junio, todo lo bloqueado por data/otra PC.

---

## 🔁 RECONCILIACIÓN CONSOLIDADA 2026-07-28 (reemplaza 4 pases sueltos)

Había **cuatro PRs de reconciliación abiertos sin mergear** (#966 del 25/07, #988 del 26/07, #996 del 27/07, #999 del 28/07). Los cuatro partían del mismo `main` y reescribían las mismas líneas, así que eran **paralelos, no acumulativos**: mergearlos en orden habría dado conflictos, y mergearlos a ciegas habría dejado un documento que **se contradice consigo mismo**. Se consolidaron acá y los cuatro se cerraron.

**La contradicción, y cómo se resolvió.** Sobre "fuga de voseo": #966 (25/07) y #999 (28/07) lo marcaban ✅ HECHO; #996 (27/07) decía **"sigue genuinamente abierto — es whack-a-mole activo, el modelo sigue resbalando"**. Los tres argumentaban desde el código (qué commits agregaron qué formas al scrub), y por eso ninguno podía ganar: el código no dice si el voseo LLEGA a Aaron.

Se zanjó **midiendo la salida real** — que es la lección de #975 (*el idioma se mide con `detectVoseo`, no se opina; el juez del eval alucinaba voseo inexistente*). Corrida sobre los 12 mensajes que SIR le mandó entre el 26 y el 28/07: **1 con voseo, 11 limpios**, y el sucio es anterior al fix. Detalle arriba. **Regla que queda:** una afirmación sobre el idioma se cierra con una medición sobre `sir_messages`, no con un `git log`.

**Aportes únicos de cada pase, ya incorporados arriba:**
- **#966 (25/07)** — primera detección de que "copy ¡Listo!" y "voseo" ya estaban atendidos por `f01c19d` (23/07), un commit **anterior** al pase 07-24 que los listó como pendientes.
- **#988 (26/07)** — el único que cazó un drift viejo distinto: **"inferencia LLM de dominio para objetivos"** ya estaba hecha desde el 20/07 (`07c9136`, `smartPrompt.ts` infiere `category` y `SmartWizard.tsx` la aplica en modo dictado) y **cuatro pases seguidos (07-17, 07-18, 07-20, 07-21) la dieron por pendiente**. Corregido en sus menciones históricas.
- **#996 (27/07)** — el escéptico del voseo. Se equivocaba en el veredicto pero acertaba en el diagnóstico: es un problema generativo recurrente, no un bug de una sola pasada. De ahí el "re-medir, no dar por eterno".
- **#999 (28/07)** — confirmó el estado de Ola 3 (hybrid search hecho, re-ranking y Mem0 no) y re-verificó el slice 4.

**Patrón de fondo, dicho para que se corte:** el drift de este archivo **no viene del código avanzando rápido, viene de listar sin cruzar**. Los cuatro pases encontraron lo mismo — ítems marcados pendientes que ya estaban hechos días antes. La cabecera del doc ya lo ordena ("reconciliar primero, listar después"), y aun así el pase 07-24 listó 3 ítems sin verificar ninguno. Vale más un pase que mide que cuatro que opinan.

**Nuevo en este pase** (de las sesiones del 27-28/07): los 3 pendientes de estructura de objetivos, `looksLikeOrg` sin activar, el log de entrenamiento por ejercicio, y que `askSir` es ciego a los 151 sub-pasos. Todos arriba con su evidencia.

**No re-verificado** (fuera de alcance): los bloqueados por data/otra PC y todo el histórico ya reconciliado en pases anteriores.

**NO incluye lo ya hecho+verificado esta sesión:** bug avatares `per_`, caras en la lista, match por cara capa 1-2, auto-avatar prioriza caras, IAE afecto surfaceado, recordatorios por chat revividos, push Telegram/nudge, harness de eval, recall ciego en Telegram, señal 👍👎 atribuible, bug "distante" (33 alertas), ¿quién es quién? con botones.

---

## 🔁 RECONCILIACIÓN AUTOMÁTICA 2026-07-21

Pase de mantenimiento contra el código real (agente automático). Poco drift nuevo desde el pase 07-20 (solo 4 commits en el medio: matcheo de nombre del reader IG, tray de historias IG vía GraphQL, refactor de `evalReference` en salud, sugerencia de cierre instantánea en Momentos — ninguno tocaba un ítem pendiente del backlog). El único drift real encontrado fue en un ítem que el propio pase 07-20 no re-tocó:

- ✅ **Clay #7 — Q&A por persona, sub-punto "multi-turno"** — ya HECHO, contra la nota "pendiente futuro… hoy una pregunta por vez" que quedaba en la sección Clay (más abajo). `src/components/relaciones/PreguntarSobrePersona.tsx` mantiene un `thread` de turnos y lo manda como `history` a `/api/sir/ask` (placeholder "Sigue preguntando…" tras la primera pregunta); el backend `src/lib/sir/askSir.ts` arma `chatHistory` real (líneas ~116-121 y 542-550) que pasa a `chatProvider.ts`, o sea el LLM sí recibe el hilo — no es solo UI. Corregido in situ, dejando como pendiente real solo la validación en vivo (no verificable por grep).

**Verificado y quedó IGUAL (sin drift), re-chequeado este pase:**
- **Inferencia LLM de dominio para objetivos de texto libre** — sigue igual: `category` en `smartPrompt.ts`/`/api/objectives/smart` sigue siendo un INPUT, no algo inferido del párrafo libre.
- **Auto-import desde calendario (Clay #6)** — sigue sin rastro en código (`grep` de "auto.import"/"autoImport" sin resultados).
- **Etapa 6 (AI-Native Human OS)** — `STRATEGIC_ROADMAP.md` línea 33 sigue en "⬜ visión norte", sin alcance concreto.
- **Gantt fix del MASTER_PLAN** — sigue no verificable en este repo (sin componente "Gantt" ni referencias a `MASTER_PLAN` en `src/`).
- **Split-brain / last-write-wins por fila** — sigue igual: `engine.ts` sigue haciendo `upsert(..., { onConflict: 'id' })` (pisa la fila entera, no merge por campo).

**No re-verificado este pase** (fuera de alcance): todo lo demás, incluyendo lo ya marcado ✅/🟡 con evidencia en pases anteriores.

---

## 🔁 RECONCILIACIÓN AUTOMÁTICA 2026-07-20

Pase de mantenimiento contra el código real (agente automático). Esta vez el drift estaba repartido en varios lados — cosas marcadas "pendiente"/"no encontrado" en pases anteriores que ya se construyeron (algunas después del pase 07-18, otras que el pase 07-17 simplemente no encontró):

- ✅ **Mobile QA estructurado** — ya HECHO (no pendiente). PR #819/#820 (`d4a5218`, 18/07/2026): harness Playwright en `e2e/` con proyectos exactamente en los viewports pedidos — `mobile-se` (375), `mobile-390` (390), `mobile-xl` (414), `tablet` (768) + `desktop` (`playwright.config.ts` líneas 47-51) — specs `overflow.spec.ts`, `tap-targets.spec.ts`, `smoke.spec.ts`, `nav.spec.ts`. Corre aislado del CI principal en `.github/workflows/e2e.yml` (manual + nightly). El pase 07-18 quedó desactualizado porque este PR mergeó ese mismo día.
- ✅ **Iteraciones futuras LinkedIn schema** (`certifications[]`, `volunteerWork[]`, `languages[]`, `organizations[]`, followers count, `isVerified`) — ya HECHO. PR #816 (`771d58f`, 18/07/2026): los 6 campos existen en `src/lib/capture/linkedin/types.ts` (líneas 59-77), el prompt los pide explícitamente (`prompt.ts` líneas 92-97, 186-206) y `validate.ts` (líneas 179-184) los sanitiza. El pase 07-17 (que declaraba esto "genuinamente pendiente") quedó desactualizado por el mismo motivo.
- ✅ **Narrative Intelligence** — ya HECHO, contra lo que decían los pases 07-17/07-14 arriba ("sin rastro en el código — no encontrado"). Carpeta completa `src/app/api/self/`: `rumbo`, `coherencia`, `arquetipo`, `retrato`, `premortem`(s), `espejo-snapshot`, `espejo-relacional`, `espejo-lectura`, `relational-daily` + `src/lib/self/rumboPrompt.ts`/`coherencePrompt.ts` + `LifeThreadPanel.tsx` ("Tu rumbo" en `/yo`). Esto además coincide con `docs/STRATEGIC_ROADMAP.md` (línea 110), que YA lo documentaba como "CONSTRUIDO" desde antes del pase 07-17 — ese pase no cruzó el roadmap y declaró "no encontrado" por error. Corregido en las 2 menciones de más abajo (línea de Etapa 4 follow-ups y el resumen del pase 07-17).
- 🟡 **Etapas 5–6** — la línea "no iniciadas" (más abajo, sección PRÓXIMAS SESIONES) estaba desactualizada: `STRATEGIC_ROADMAP.md` (línea 32) marca **E5 Dirección de vida** como "🟢 en marcha (artefacto real)" — el núcleo es justamente Narrative Intelligence de arriba. Solo **E6 (AI-Native Human OS)** sigue genuinamente en "⬜ visión norte", sin alcance concreto. Corregido para no decir "ninguna de las 2 empezó".
- 🟡 **Clay #8 (cross-referencing por ubicación) y #9 (Familia persona↔persona)** — los párrafos de esos ítems en la sección "BACKLOG inspirado en Clay" (más abajo) seguían redactados como "no implementar aún" / "DIFERIDO... hoy NO existe modelo persona↔persona", pero **ambos ya están hechos** y la reconciliación 07-14 (arriba) ya lo decía. Confirmado de nuevo en código: `lib/agenda/build.ts` (`buildProximity`, comentario explícito "Cross-referencing por UBICACIÓN (Clay #8)") + `ProximoPanel.tsx`; y `person_links` (migraciones 0035/0052/0058/0107/0128) + `FamiliaPanel.tsx` + `buildGraphData` con soporte de aristas `personLinks` (`src/lib/graph/builder.ts` + tests). Se dejó nota en los párrafos para no reabrirlos por error — el texto original queda como registro histórico del planteo.

**Verificado y quedó IGUAL (sin drift):**
- **Inferencia LLM de dominio para objetivos de texto libre** — sigue en el mismo estado incierto ("revisar"). `src/lib/objectives/smartPrompt.ts`: el schema de salida del helper SMART (`ProposedSmart`) NO incluye `category`/dominio — `category` es un INPUT que ya trae el usuario, no algo que el modelo infiera del párrafo dictado. No se encontró código que infiera el dominio desde texto libre. Se mantiene la nota "revisar" sin marcarlo hecho.
- **Auto-import desde calendario (Clay #6)** — sigue genuinamente pendiente, sin rastro en código (`grep` de "auto.import"/contexto-pre-reunión sin resultados).
- **Gantt fix del MASTER_PLAN** — no verificable en este repo: no hay componente "Gantt" ni referencias a `MASTER_PLAN` en `src/`; `MASTER_PLAN.md` es regenerado por un bot externo (sir-bot), fuera del alcance de este grep. Se deja como estaba.
- **Re-validar Captura WhatsApp con fecha explícita** y **Ajuste prompt Vision user/other (re-validación)** — son tareas de validación manual (subir un screenshot de prueba), no features de código; no verificables por grep. Sin cambios.

**No re-verificado este pase** (fuera de alcance): todo lo demás, incluyendo lo ya marcado ✅/🟡 con evidencia en pases anteriores.

---

## 🔁 RECONCILIACIÓN AUTOMÁTICA 2026-07-18

Pase de mantenimiento contra el código real (agente automático). Esta vez el drift estaba en la sección "PENDIENTES MENORES", que contradecía a otras partes del doc ya reconciliadas (14/07 y 17/07) — 4 ítems que ya estaban HECHOS seguían listados ahí como pendientes:

- ✅ **Toggle privacidad finanzas en `/timeline`** — ya HECHO. `src/components/timeline/TimelineFeed.tsx` (líneas 67-78) define `financeHidden`/`toggleFinance()` + botón "Ocultar/Mostrar finanzas" (icono Eye/EyeOff). Coincide con lo ya declarado en la reconciliación 14/07 de arriba ("toggle privacidad finanzas /timeline: ya estaban") — el ítem suelto en PENDIENTES MENORES había quedado desactualizado.
- ✅ **Estados vacíos pedagógicos** — ya HECHO (no "parcial"). Componente compartido `src/components/ui/empty-state.tsx` con prop `hint` (siguiente paso accionable), usado en ≥9 rutas (`salud`, `finanzas`, `objetivos`, `seguimiento`, `senales`, `relaciones`, `panel`, `linea`, `eventos`, `explorar`); `memoria/page.tsx` tiene su propio empty state hand-rolled aún más detallado. Coincide con la reconciliación 14/07 ("empty states ✅ ya existen, pedagógicos").
- ✅ **Cap en `relationships.history`** (ADR 0005 R7, >50 items) — ya HECHO. `src/lib/supabase/sync/adapters/relationships.ts` (líneas 137-140): `history: (r.history ?? []).slice(-50)` con comentario explícito citando el ADR, aplicado en el push local→Supabase.
- ✅ **`persistScaleCapture` espera ACK del push** — ya HECHO. `src/lib/capture/scale/client.ts` línea 77 tiene el arg `awaitSync?: boolean` (línea 144-150 espera `waitForRowsConfirmed`), y ya está cableado con `awaitSync: true` en `ScaleCaptureBranch.tsx`, `ScaleCaptureFlow.tsx` y `MisCapturas.tsx`. Solo el flujo batch (`healthBatch.ts`) no lo usa, intencionalmente (no debe colgarse por una imagen).

**Verificado y quedó IGUAL (sin drift):**
- **Mobile QA estructurado** — sigue genuinamente pendiente. No se encontró test con viewport 375/390/414/768px ni doc de auditoría formal ejecutada (solo hay spec de diseño en `docs/phase-3a/issue-69-analysis-design.md`, que no es evidencia de un pase de QA). Nota: la línea de la reconciliación 14/07 de arriba ("mobile QA ✅ smoke pasó @390px") queda como registro histórico de esa sesión puntual, pero no reemplaza la necesidad de un pase estructurado — se mantiene la entrada de PENDIENTES MENORES sin cambios.
- **Campos LinkedIn nuevos** (`certifications[]`, `volunteerWork[]`, `languages[]`, `organizations[]`, followers count, `isVerified`) — siguen genuinamente pendientes. `src/lib/capture/linkedin/types.ts` solo tiene `isOpenToWork`/`hasBannerImage` de la lista; el resto no existe en `types.ts`/`prompt.ts`/`validate.ts`.

**No re-verificado este pase** (fuera de alcance — no son items marcados "pendiente" en el doc, o ya quedaron con nota "revisar"/"no verificable por grep" en pases anteriores): todo lo demás.

---

## 🔁 RECONCILIACIÓN AUTOMÁTICA 2026-07-17

Pase de mantenimiento contra el código real (agente automático). Ítems marcados como estado corregido in situ más abajo (con nota "Verificado 2026-07-17" o similar), texto histórico intacto. Resumen de lo que cambió de estado:

- ✅ **Nuevo capture_type whatsapp_web** — ya HECHO (migración `0020`, detector, extractores). El ítem suelto en "BACKLOG NUEVO" no reflejaba esto.
- ✅ **Captura por TEXTO pegado para perfiles (LinkedIn/IG)** — ya HECHO (`AgregarCapturaPanel.tsx` modo `text` con autodetección linkedin/instagram).
- ✅ **Calendario v2 OAuth Google + bidireccional + multi-calendario** — ya HECHO (el ítem suelto no coincidía con la reconciliación 14/07 de arriba, que ya lo daba por hecho).
- 🟡 **Fase 3d (memoria que aprende)** — tabla de fases (más abajo) decía "⬜ Pendiente" pero el bloque de arriba (14/07) ya decía HECHO el núcleo; corregida la fila de la tabla para que no contradiga.
- ✅ **Etapa 4 follow-ups**: Human OKRs estructurados (migraciones 0040/0041), delta de relationship score (snapshots + `BondEvolutionPanel`), tono de interacción desde `person_logs` en el engine — los 3 ya estaban hechos y listados como pendientes.
- ✅ **Checklist "Portar detail page V2" (ítems 6-13, 15-17)** — el encabezado de la sección ya decía "✅ COMPLETADO" pero el checklist interno no tenía los checkmarks individuales; agregados con evidencia de componente para cada uno.

**Quedan genuinamente pendientes** (no tocados): inferencia LLM de dominio para objetivos de texto libre (incierto — marcado "revisar"), re-verificar drift de migraciones `0046`-`0050` contra prod (requiere acceso a prod, no verificable por grep), y todo lo demás que ya estaba correctamente marcado como pendiente antes de este pase. ~~Narrative Intelligence (sin rastro en código)~~ ✅ **corregido en la reconciliación 2026-07-20** (arriba): sí está en el código (`src/app/api/self/*`) — este pase no lo encontró por error.

---

## 🔁 RECONCILIACIÓN 2026-07-14 — el backlog estaba MUY atrasado

Verificado contra el código en vivo. Varios ítems listados abajo como "grandes / no empezados" o "pendientes" **YA ESTÁN construidos** (deuda de documentación, no de código). NO re-hacer:

- ✅ **Familia / person↔person** — migración `0035_person_links`, `personLinkAdapter`, tipos `PersonLink/FamilyKind/LinkKind`, `FamiliaPanel.tsx`, aristas en el grafo (`GraphView`), + `NetworkPathsCard`/`NetworkIntrosPanel`/`MencionadasPanel`/`InfluenceMapCard`. **HECHO** (era "sub-proyecto diferido").
- ✅ **Calendar v2** — OAuth Google (`/api/calendar/oauth/google/{start,callback,status}`), `connections` (multi-calendario), `events` con **POST (crea eventos → bidireccional)**. El proveedor **Microsoft/Outlook OAuth** quedó ❌ DESCARTADO (ver tabla abajo — bloqueado por el tenant de HNG). Para ver Outlook en SIR ya existe la vía `.ics` sin admin.
- ✅ **SIR por WhatsApp (canal captura)** — `/api/whatsapp/webhook` real: recibe mensajes (allowlist), corre `runRelatoIngest`, responde. **Captura funcionando.** Gap posible: nudges proactivos.
- ✅ **Ingestión documental** — `/api/ingest/document` + `/captura/documento` (UI): PDF (pdfjs client-side) + texto pegado. Gap REAL: formatos no-PDF (DOCX…) vía MarkItDown — pero PDF+texto cubre el 90%.
- ✅ **Fase 3d — memoria que aprende** — `/api/learnings` + `lib/learnings/recall.ts`, cableado al brief del horario. **HECHO** (al menos el núcleo de learnings/recall).
- ✅ **Cross-referencing por ubicación** — `location` en Person + usado en `lib/agenda/build.ts` + `ProximoPanel`.
- ✅ **`/100` score explícito** y ✅ **toggle privacidad finanzas /timeline** (filtro por fuente): ya estaban.

**Gaps REALES que quedan** (lo poco que NO está): **Etapas 5–6** (aspiracional, sin alcance concreto definido — E4 ya madura, E5 con semillas en prod). Deuda técnica menor: consistencia temporal de hechos (parcial), last-write-wins por fila (impacto nulo mono-usuario). Limpieza: huérfanos de Storage (bloqueado: decidir retención). **NO son gaps** (descartados/ya resueltos): Calendar Microsoft OAuth (❌ descartado), ingestión DOCX (❌ descartado), nudges WhatsApp (❌ descartado — ya cubiertos por Telegram), mobile QA (✅ smoke pasó @390px), empty states (✅ ya existen, pedagógicos), visibilidad de errores (✅ Sentry activo + verificado 14/07).

> Migración LLM (multi-proveedor `lib/llm/`): COMPLETA — texto + visión por `complete()`, chat en Haiku, OpenRouter activo. Ver `docs/AI_USAGE_AUDIT.md` + `docs/LLM_PROVIDER_KEYS.md`.

---

## ✅ EN PRODUCCIÓN — barrido de verificación en vivo (2026-07-08)

> Sesión de "mirar la salida con data real" (método de [[project_qa_baseline_user_mode]]). Se cazaron y arreglaron bugs plausibles-pero-mal que un health-check no ve, y se reconcilió el backlog (varios "pendientes" de abajo YA estaban hechos — marcados ✅ in situ).

- **Ficha por tipo de vínculo + cruce de horizontes:** Camino B (calendario personal → línea del ciclo, #626), cruce honesto real↔conductual por solape de ventanas SPM→período (#627). Verificado en Diana (pareja) y Nicolle (familia): guardrails éticos por vínculo OK (familia = presencia, sin flores/intimidad/planner).
- **fix #628** — «UN GESTO» ya no sugiere fragmentos de frecuencia sueltos ("mudo"): solo temas ≥3 apariciones o tags curados.
- **fix #629** — «SIR quiere saber» ya NO pide la fecha del período de mujeres que no son pareja (mamá/tía/colega): invasivo e irreal, y el 2º horizonte lo infiere. Solo pregunta con pareja.
- **Reconciliado como YA HECHO:** `/captura` multi-archivo (#102), toast de fallo de sync, pesos por-modelo del forecast. El backlog los tenía como pendientes.

---

## ✅ EN PRODUCCIÓN — actualización (2026-06-08)

> Re-sincronización con `git log` tras el push del 1–7 jun 2026. La reconciliación del 31-may (más abajo) quedó atrás; esto la complementa con lo entregado después.

**Horario / Cockpit operativo:**
- Cockpit `/horario` Día/Semana/Mes cruzando calendario con tareas/OKR/estado físico (lógica pura + UI conmutable).
- Brief del día/semana/mes generado por IA (extiende el brief diario de Fase 5).
- Reader multi-calendario unificado con color por feed; checklist OAuth Google + Microsoft/Graph (`docs/CALENDAR_V2_OAUTH.md`).
- Vista Día: tareas con hora opcional caen en su franja; cuenta solo TIEMPO (relaciones/peso fuera).

**Relaciones — serie GEMA (síntesis + proactividad):**
- Síntesis narrativa de la ficha: franja de resumen al tope, secciones narrativas sintetizadas, memorias colapsadas, tercer eje "Vida social".
- "Hoy con tu gente": motor de urgencia de contacto (puro) ponderado por parentesco, en `/horario` y `/relaciones`; API de Daily Actions (scoring sin IA + mensaje on-demand).
- Reciprocidad por delta de calidad; superficie "Antes de contactar" en la ficha.
- Redes sociales funcionando: auto-link de handle, @ clickeable, seguidores en común de IG (extracción + enlace a la red).
- Notas privadas en la sección sensible; excluir/marcar memoria como privada (fuera de IA, no se re-deriva).

**Familia:** vínculo real persona↔persona con parentesco (autocompletar, bidireccional, sugerencias) y vínculo SELF↔persona con inferencia desde el "yo".

**Objetivos:** wizard guiado SMART antes del plan IA (gating + baseline); tareas "Jira-light" por objetivo (criterio, fecha, esfuerzo, prioridad, dependencias, estado; migración 0050); fixes de confiabilidad del plan IA (504/502 por max_tokens/maxDuration).

**Seguimiento (`/seguimiento`):** modelo + lógica pura de trackers, ingesta Vision/texto, tablero, resumen en objetivos, alertas por email (provider opcional) + cron.

**Yo / Identidad y Salud:**
- Onboarding conversacional "Contale a SIR quién sos" (anti-formulario-vacío) + auto-captura del perfil propio → anclas de identidad en `/yo`.
- Apple Health: ingesta Health Auto Export (endpoint, Fase 1) + importar como archivo .json/.zip (camino $0).
- Capturas nuevas: `sleep_panel` (pantallazo app de sueño → sleep_records), `heart_rate_panel` (FC → health_metrics), FC en reposo vs general.

**Panel:** "TU AÑO" — brújula anual sobre Mission Control.

**Alineación (Etapa 4):** señales TAGGED cableadas al panel de Alineación.

**Migraciones nuevas:** hasta `0050` (objective steps/OKR/SMART 0040–0042, calendar_connections 0046, person_profile_axes 0047, action_suggestions 0048, tareas Jira-light 0050). **Pendiente:** re-verificar drift de `0046`–`0050` contra prod.

---

## ✅ EN PRODUCCIÓN — reconciliación (2026-05-31)

> Estado verificado contra `git log` y el código. Lo de abajo **ya está en prod**; las secciones históricas más abajo se conservan como bitácora pero pueden estar desactualizadas frente a esto.

**Detail page V2 — CERRADO (el "ítem 0" de PRÓXIMAS SESIONES ya está completo).** Los 17 componentes existen: score relacional, ciclo, cumpleaños, última interacción, registro rápido, registrar interacción, vida profesional/social, lo personal (`person-synthesis`), fechas importantes, perfil profesional, redes sociales, nota de voz, memorias asociadas, briefing IA (`person-briefing`), acciones (WA/analizar), bitácora, correlación 3c.

**Plataforma / capacidades en prod:**
- **Sync en vivo cross-device** ✅ (CREATE/UPDATE/DELETE sin recargar): focus re-pull + Realtime + repush offline (`61f1f2d`, `f548854`, `d57822d`, `54b699b`; migraciones 0017/0018/0019).
- **relationship_events** append-only + dual-write no-lossy (Opción B; `c6caf52`, `46b0d3f`).
- **Captura whatsapp_web** (detector + extractor + pipeline; `c4efd74`, `15cc7b3`) y **notas de voz** (migración 0014 + `NotaDeVozPanel`).
- **Fase 5 — Briefing diario** accionable en Mission Control + cache por día (`47e7e4c`, `fabef7a`).
- **Fase 3c** — correlación longitudinal (`person_logs` × fase lunar × ciclo) + resumen semanal (`874f019`, migración 0016).
- **Charts de tendencias** SVG propios (`40a8324`), **Agenda "Próximo"** (`238376f`), **Export/Dossier** + CSV client-side (`ababe31`, `eaab167`).
- **Derivar memorias desde observations** (`14dd9e3`; fix idempotencia por PK `7b3249d`).
- **Alignment Engine MVP** (Etapa 4): engine puro + narrativa reflexiva + panel en `/objetivos` + selector de personas (`888d75c`, `356b07f`, `235ce4d`, `ce2c544`).
- **Edición inline** en el detail page (`PersonDetail.tsx`).
- **Observabilidad:** Sentry (`@sentry/nextjs`) + Vercel Analytics instalados y cableados (`instrumentation.ts` — no-op sin DSN); **error boundaries** de App Router (`aa228c3`).
- **Robots.txt + noindex** para rutas autenticadas (`src/app/robots.ts`).
- **Emails auth ES:** template listo (`docs/auth-email-templates-es.md`); aplicarlo en el dashboard de Supabase es **acción manual**.
- **Fixes:** hidratación fina del detail page (`16eb853`), state-leak de PersonDetail (`01176e9`).
- **Tests:** ~379 tests en 34 archivos (lógica pura de engines, captura, fechas, sync, alignment) + error boundaries.

**Migraciones — ✅ PROD SINCRONIZADO CON EL REPO, SIN DRIFT PENDIENTE (verificado en vivo 31/05):**
- **0012–0022 aplicadas.** Diagnóstico en vivo (SQL Editor por Chrome, tras reiniciar la PC que destrabó la consola): **21/21 índices esperados presentes**, `observations.capture_type` incluye `whatsapp_web`, `memories.type` incluye `social`, **9/9 tablas** en la publicación `supabase_realtime`, **62 policies**.
- **0012 restaurada vía 0022:** `memories.source_event_id` existe y el índice único `uniq_memories_source_event` existe. El bug histórico del 500 de `/api/memories/derive` (que motivó reanclar la idempotencia al PRIMARY KEY) queda cerrado; el camino **legacy** `/api/memories/backfill` vuelve a tener su columna/índice.
- **0022** (red de seguridad aditiva: re-asegura cols 0010 + restaura 0012) **APLICADA** en prod. Idempotente, no-destructiva.

**Migraciones — flujo NUEVO con runner (Auditoría riesgo #2, 31/05):**
- Se acabó el SQL a mano en el dashboard. Ahora: agregar `supabase/migrations/00NN_name.sql` → merge a `main` → el workflow **`Migrate DB (Supabase)`** (`.github/workflows/migrate.yml`) corre **después** de los tests y hace `supabase db push` (sólo lo pendiente). Ver **`docs/MIGRATIONS.md`**.
- **Acción manual pendiente de Aaron** (one-time, en `docs/MIGRATIONS.md`): (1) secrets `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD`; (2) **baseline** del historial (insert `0001..0023` en `supabase_migrations.schema_migrations`) para que el primer push sea NO-OP. Hasta eso, el runner hace skip elegante (no rompe CI).
- **0023** (`rate_limits`, runner de rate limiting) sigue requiriendo aplicarse (idempotente); el baseline asume que ya está en prod.

**Pendiente real (lo que NO está hecho):**
- ~~**Activar Fase 3b (búsqueda semántica)**~~ ✅ **HECHO (2026-06-08):** `OPENAI_API_KEY` cargada en Vercel (Production), 23 memorias indexadas (`/api/memories/embed`), `/buscar` validado. **Cobertura cerrada** con el botón "Actualizar índice completo" (PR #100): deriva todas las personas + indexa en un click. **Decisión:** NO embeddear `observations` crudas (ruido/duplicación; contradice la vista curada) — la cobertura se logra derivando.
- **Fase 3d** — memoria que aprende (RAG cross-session).
- **Etapa 4 follow-ups:** ~~Human OKRs estructurados~~ ✅ **HECHO** (migraciones `0040_objective_steps.sql`/`0041_objective_steps_okr.sql`: modelo KR→tarea de 2 niveles, `ObjectiveSteps.tsx`); ~~delta de relationship score (necesita snapshots históricos)~~ ✅ **HECHO** (`/api/person-score/snapshot` + cron `score-snapshots` + `BondEvolutionPanel.tsx`/`src/lib/people/bondEvolution.ts`); ~~tono de interacción desde `person_logs` en el engine~~ ✅ **HECHO** (`src/engines/alignment/index.ts` y `src/engines/relational-flags/index.ts` ya leen `person_logs`). Verificado 2026-07-17. **Siguen pendientes de verdad:** inferencia LLM de dominio para objetivos de texto libre (hay inferencia SMART vía `SmartAssist.tsx`/`/api/objectives/smart`, pero no confirmé que infiera el DOMINIO desde texto libre — marcar "revisar" antes de darlo por hecho; re-verificado 2026-07-20, `smartPrompt.ts` sigue sin inferir `category`). ~~Narrative Intelligence (sin rastro en el código — no encontrado)~~ ✅ **corregido 2026-07-20:** SÍ existe — carpeta `src/app/api/self/` completa (rumbo/coherencia/arquetipo/retrato/premortem/espejo-*) + `src/lib/self/rumboPrompt.ts` — este pase 07-17 no lo encontró por error (ya lo documentaba `docs/STRATEGIC_ROADMAP.md` como CONSTRUIDO).
- **Etapas 5–6** (Life Direction System / AI-Native Human OS): 🟡 **corregido 2026-07-20** — E5 (Life Direction System) YA está "en marcha (artefacto real)" según `docs/STRATEGIC_ROADMAP.md` (línea 32): su núcleo es Narrative Intelligence (`src/app/api/self/*`, "Tu rumbo" en `/yo`). Solo **E6 (AI-Native Human OS)** sigue genuinamente sin iniciar ("⬜ visión norte", sin alcance concreto).
- **Decisión de scope finanzas/salud** (tensión con principio #4 — ver `STRATEGIC_ROADMAP.md`).
- ~~**Refactor split-brain → Supabase única fuente**~~ ✅ RESUELTO (verificado 07-07; ver deuda arquitectónica más abajo). Único residual menor: last-write-wins por fila.

---

## 🐛 BUGS CONOCIDOS

### BUG-001 ✅ RESUELTO (residual P3): LinkedIn extractor halucinaba nombres
- **Severidad original:** P0
- **Estado:** Resuelto en producción por el código mergeado en `c387694` (compresión adaptativa 1600px / q=0.95 + anti-hallucination prompt). Validado en prod re-subiendo el screenshot original: el extractor saca `fullName` y `location` correctos, `confidence='medium'` honesto.
- **Residual P3 (cosmético, no bloquea):**
  - Campos de detalle fino (`about`, secciones de education) salen parcialmente mal leídos en algunas capturas, pero el modelo los reporta como `medium` confidence — aceptable.
  - El piso de 300 KB para `linkedin` es inalcanzable en la mayoría de screenshots reales: la imagen sube hasta el techo `q=0.98` sin tocarlo. Opera como "subí al máximo posible". Cosmético — la advertencia ⚠ aparece en la UI cuando pasa pero no afecta el resultado.
- **Acción si vuelve a aparecer:** revisar las 6 hipótesis archivadas en el commit `7445d40` (filename cross-check, crop adaptativo, temperature=0, Opus, etc.).

### BUG-002 ✅ RESUELTO (PR #87 Sesión 2.7): Persona matcher no busca por handle/url/phone
- **Severidad:** P1 (UX friction + potencial vinculación incorrecta)
- **Síntoma raíz:** se vinculaba persona ANTES de extraer, con `suggestedPersonName` del DETECTOR (imagen agresiva ~30 KB → ruidoso, dio "Diene Caroline Diaz Sanchez"). Por eso no matcheaba a la "Diana Carolina" existente, y permitía vincular a personas equivocadas (caso real: observación pre-fix vinculó "Gimena Martina" inventado a Diana Carolina).
- **Fix entregado:** matcher post-extracción con campos autoritativos (`fullName` linkedin, `handle` instagram, `phoneNumber+displayName` whatsapp_info). Guardrail: auto-link SOLO con match exacto fuerte (handle, URL o phone normalizado); matches por nombre → siempre candidatos al usuario. Token-based bidireccional (commit `ef318e8`) cierra el caso "query del extractor más largo que el row guardado".

### BUG-003 ✅ RESUELTO (PR #87 Sesión 2.7): /captura no enlazada en UI
- **Severidad:** P2 (UX friction)
- **Síntoma:** Ruta `/captura` solo accesible por URL manual.
- **Fix entregado:** Ítem "Captura" agregado al sidebar (`src/components/layout/Nav.tsx`), entre Relaciones y Objetivos, con ícono `Camera`.

### BUG-004 🟢 MITIGADO (07-07) [P1]: extracción de Instagram ALUCINABA la bio
- **Severidad:** P1 (mala data en perfiles).
- **Síntoma (caso Diana, 06-jul):** con un screenshot legible que dice `Founder: @cautiva.detalles 🌸`, la extracción devolvió `Fandub @colana.doblajes 🎙️` (bio equivocada) y `1543` seguidores (real 1343).
- **Causa real identificada:** NO era invento de la nada — la captura era de **página completa** (header + grid de posts). El modelo (a) tomó la "bio" de una **publicación del feed / cuenta sugerida** en vez del header, y (b) **malleyó un dígito** (5 por 3).
- **Fix (07-07, prompt hardening en `src/lib/capture/instagram/prompt.ts`):** (1) **REGLA DE UBICACIÓN** — los datos SOLO viven en el bloque de cabecera; en capturas de página completa TODO lo de abajo (grid de publicaciones, sugeridas, reels) se ignora; nunca sacar bio/handle/link de un post. (2) **Precisión de dígitos** — leer los contadores dígito por dígito, si alguno es ambiguo no adivinar → `confidence='medium'` + nota. Más el revert + `recomputeAxisFor` al descartar + avatar apunta al perfil (mitigaciones previas).
- **Pendiente de verificar:** una captura real cuando haya saldo de API (no se pudo probar en vivo por créditos). Idea futura: validar que los @handles de la bio aparezcan literalmente en la imagen.

### BUG-005 ✅ RESUELTO (07-06) [P1]: el import de chat contaminaba la ficha con ruido
> **Los 4 puntos, hechos:** #1 última-interacción ignora logs de sistema (`3aa2101`) · #2 dedup al re-importar (`94587bd`) · #3 logs 📞/tono-inferido/import no se vuelven memorias (`c95a56b`) + **700/865 memorias de ruido soft-deleted** (Diana 141→21 reales) · #4 bitácora omite logs de sistema (`f9a5743`). La EXTRACCIÓN (síntesis/facts/fechas/tono×fase) siempre estuvo bien; el problema era el ruido, ya limpio. Diagnóstico original abajo.
- **Severidad:** P1 (la sustancia se pierde bajo artefactos).
- **Diagnóstico (caso Diana, 07-06):** la EXTRACCIÓN de contenido es BUENA (síntesis del vínculo, facts reales — notaría, familia, perros —, fechas, tono×fase 17·M3 corriendo). El problema es el **ruido del import que la tapa**:
  1. **"Última interacción" = el evento de import** ("Importado del export · 70811 mensajes") en vez del último mensaje real. → `LastInteractionPanel` / la lógica de última-interacción debe IGNORAR los logs marcados import y leer `data.dateRange.last` de la conversación.
  2. **Imports duplicados:** re-importar crea un `whatsapp_chat` nuevo cada vez (había 3 para Diana; deduplicados a mano 07-06). → al re-importar, **obsoletar el `whatsapp_chat` previo de esa persona** (dedup por person_id/thread) antes de insertar el nuevo.
  3. **Spam de logs de llamada:** 141 memorias, casi todas "📞 Llamada de voz · Xs" (de `extractCalls` en `runImport.ts`). → NO derivar memorias individuales de logs de llamada (agregarlas o excluirlas del derive; ya hay `isNoiseLog` para la familia 📞).
  4. **"Tono inferido del chat importado"** repetido en bitácora/timeline (ruido value=3). → aplicar el filtro `isNoiseLog` también en la bitácora/última-interacción (ya se aplicó en efecto-partner y salud del vínculo; falta acá).
- **NO tocar:** la síntesis narrativa, facts, extractedDates, tono×fase — eso anda bien.
- **Escenario elegido (07-06):** marcado PENDIENTE; avanzamos con otras cosas y esto se ataca por estos 4 puntos.

### BUG-006 ✅ RESUELTO (07-06) [P2]: el eje profesional no tomaba los facts del chat
> **Hecho (`fdf681e`):** `professionalAxisFromFacts` deriva el eje profesional de los facts de trabajo del chat cuando no hay LinkedIn; cableado en el import (no pisa LinkedIn/manual) + aplicado retroactivo a Diana (notaría Rosalía Mejía, etc.). **Residual del hallazgo:** la última-interacción aún usa el último rating, no el último mensaje; y falta el override manual de campos de perfil.
- **Hallado en la auditoría de Diana (`docs/audits/2026-07-06_diana.md`).**
- **Síntoma:** el chat dice que Diana trabaja en la notaría Rosalía Mejía — SIR lo extrae como `fact` de la observación `whatsapp_chat`, pero el **eje profesional** (`person_profile_axes.professional_text`) queda VACÍO porque `computeProfessionalAxis` solo lee capturas de LinkedIn.
- **Fix:** derivar (o completar) el eje profesional también desde los `facts`/summary del chat cuando no hay LinkedIn. + idea relacionada: la **última interacción** debería tomar el último MENSAJE (dateRange.last del whatsapp_chat), no el último rating manual.
- **Feature ligada ("crear para poder cambiarlo"):** override manual de campos de perfil (contadores, bio, trabajo) sin re-capturar — hoy se corrige creando una observación a mano.

### BUG-007 ✅ RESUELTO (07-06) [P2]: el import de WhatsApp no dejaba data usable para el Pulso (C0)
> **Hecho (2 capas):** (1) cliente `dbd3388` — consolidate guarda cada rawMessage con `iso` + sample 25→1000; adapter C0 prefiere `iso`. (2) servidor `69e5833` — **el `sanitizeData` del route capaba a 40 y descartaba `iso`** (whitelist), deshaciendo el fix del cliente. Esto lo destapó el **re-import REAL por la UI** (el test end-to-end que pidió Aaron): el whatsapp_chat persistido salía con 40 msgs sin fecha → C0=0 → Pulso vacío igual. Ahora el route conserva `iso` y sube el cap a 1000. Lección: unit tests + fix de cliente en verde, pero el servidor tiraba la data en silencio — solo el end-to-end lo cazó. Diana re-backfilleada (1000 iso, C0=1000). tsc:0, 78 tests. **Validado E2E (07-07):** re-import REAL por la UI con el route arreglado → obs `e8a95f73` con rawMessages 1000/1000 CON iso, C0 lee 1000. Loop cerrado.
- **Hallado en el pase visual de Diana:** "Pulso de la conversación" salía vacío pese al chat de 71138 mensajes.
- **Causa:** el `whatsapp_chat` guarda solo **25 rawMessages de muestra** y con `timestamp` **solo hora** ("14:47", sin fecha). C0 (`messagesFromRows` → `Date.parse("14:47")`) = NaN → descarta todos. (Teams/`dm_conversation` sí funciona: guarda el stream con fecha completa.)
- **Workaround aplicado a Diana (07-06):** backfill de rawMessages con timestamps ISO completos desde el `_chat.txt` (2500 msgs recientes) → el Pulso ya renderiza para ella.
- **Fix de raíz:** en el import de WhatsApp, guardar los rawMessages con **timestamp ISO completo** (fecha+hora, no solo hora) y MÁS mensajes (o una serie de volumen semanal pre-computada). Toca `lib/capture/whatsapp/*` (parser/consolidate).

---

## 🆕 BACKLOG NUEVO

### Sesión 6 — Registro rápido + Registrar interacción ✅ ENTREGADO
Cerrada el 30/05/2026 con un PR (`feat/person-logs`):

- **Migración 0013** (`supabase/migrations/0013_person_logs.sql`, aditiva): tabla nueva `person_logs(id text PK, user_id text, person_id text FK→people, kind text CHECK ∈ {mood, energy, sleep, pain, interaction}, value int CHECK 1..5, note text, logged_at timestamptz, created_at timestamptz)`. RLS + 4 policies + índice `(user_id, person_id, logged_at desc)`. **Aplicar manualmente** en Supabase Dashboard.
- **Storage Supabase-native** (no `relationships.history` Zustand): decisión consciente para no extender el split-brain y dejar la data queryable para correlación futura.
- **POST `/api/person-logs`** authed + user-scoped (mismo patrón que `/api/memories/backfill` y `/api/observations/[id]`). Validación de `kind` enum + `value` 1..5.
- **`getLogsForPerson()`** server-side helper (`src/lib/person-logs/fetch.ts`), mismo patrón que `observations/fetch.ts`.
- **RegistroRapidoPanel** (#5 backlog ⭐) + **RegistrarInteraccionPanel** (#14) en el detail page. Lista compacta de logs recientes filtrada por kind. `router.refresh()` tras postear.

**Próximo paso natural:** correlación lunar/ciclo en Fase 3c usando `person_logs.logged_at` × `moonPhase()` × `cyclePhase()`.

### Sesión 5 — Fase lunar + Ciclo persona ✅ ENTREGADO (estado actual)
Cerrada el 30/05/2026 con un PR (`feat/lunar-and-ciclo`):

- **Fase lunar** — util puro determinístico `src/lib/lunar/phase.ts` (`moonPhase(date)` → `{ phase, illumination, ageDays, waxing }`, 8 fases en español, modelo sinódico 29.53059 + luna nueva de referencia 2000-01-06 18:14 UTC + wrap-around correcto para fase 'new'). Componente `LunarChip` consumible en cualquier punto de la UI, hoy renderizado en `/panel` (Mission Control) junto a la fecha del día. Compute-on-read para CUALQUIER fecha (cimiento de correlación lunar de Fase 3c).
- **Ciclo persona** — `cycleStartDate` + `cycleLengthDays` editables end-to-end (form + adapter + Person type). `src/lib/ciclo/phase.ts` computa fase (menstrual/folicular/ovulación/lútea) + día del ciclo + próximo período. `CicloPanel` en el detail page con donut SVG + nota contextual estática (paridad V1, sin LLM). Empty state honesto si falta `cycleStartDate`.

**Diferido:**
- Fase lunar: tagging persistido en `observations`/`memories` + análisis de correlación → Fase 3c (necesita data acumulada).
- Ciclo: derivación desde captura WhatsApp, serie histórica, overlay en timeline → Fase 3c / sesión de captura dedicada.

### Sesión 3 — Detail page UI base ✅ ENTREGADA
Cerrada el 30/05/2026 con dos PRs:
- **PR #88 PR-A** (`5094588`): ruta `/relaciones/[slug]` server-side, fetch layer reutilizable (`src/lib/observations/fetch.ts`) con `is_obsolete=false` baked in, **LastInteractionPanel** (fuente `whatsapp_chat` más reciente, empty state honesto).
- **PR #89 PR-B** (`e043611`): **RelationalScore** (número 0-100 + 3 bars; Reciprocidad como "datos insuficientes" hasta tener log de interacciones recíprocas), **BirthdayCountdown** (desde `people.birth_date`), `birth_date` editable end-to-end (Person type + adapter + form input).
- **Sweep #90** (`8c99d4c`): form defaults (lastContact=hoy + location='Lima' + datalist autocomplete), copy fixes (RelationalScore comment + UI text), simplificación BirthdayCountdown EmptyState, accessibility `SheetDescription` sr-only.

Las 4 features del backlog item ⭐ (Score relacional / Cumpleaños / Última interacción / ruta detalle) entregadas en su versión base. El arco completo del detail page V1→V2 sigue como **próxima sesión 0** (ver más abajo) con foco en componentes #15 (memorias asociadas), #6-8 (vida prof/social/personal), #2 (ciclo).

### Iteraciones futuras LinkedIn schema [P2] ✅ HECHO (verificado 2026-07-20)
Agregar campos al schema B.4:
- `certifications[]`
- `volunteerWork[]`
- `languages[]`
- `organizations[]`
- followers count
- `isVerified`
- `hasBannerImage` (ya está)
- `isOpenToWork` (ya está)

**Evidencia:** PR #816 (`771d58f`, 18/07/2026) — los 6 campos que faltaban existen en `src/lib/capture/linkedin/types.ts` (líneas 59-77: `followersCount`, `isVerified`, `certifications`, `languages`, `organizations`, `volunteerWork`), el prompt los pide explícitamente (`prompt.ts` líneas 92-97 y 186-206) y `validate.ts` (líneas 179-184) los sanitiza. Los pases 07-17/07-18 lo daban por pendiente porque el PR mergeó ese mismo rango de fechas.

### Nuevo capture_type whatsapp_web [P2] ✅ HECHO (verificado 2026-07-17)
Detector debe distinguir `whatsapp_chat` móvil (bubbles columna) vs `whatsapp_web` (3 paneles: lista chats + conversación + info contacto).
Prompt nuevo **B.6** + agregar al CHECK constraint de `observations.capture_type` (migration 0012).

**Evidencia:** migración `supabase/migrations/0020_observations_whatsapp_web.sql` agrega `whatsapp_web` al CHECK de `observations.capture_type`; el detector (`src/lib/capture/detector/prompt.ts`, tipo "1b") distingue explícitamente escritorio (3 paneles) de móvil; extracción dedicada en `src/lib/capture/extractors.ts`, `src/lib/capture/observations/types.ts`, `src/lib/capture/humanizeCapture.ts` ("WhatsApp Web") y `compress-strategy.ts`. Coincide con lo ya declarado arriba en la reconciliación 14/07 ("Captura whatsapp_web (detector + extractor + pipeline)").

### Captura por TEXTO pegado para perfiles (LinkedIn/IG) [P1 — media] ✅ HECHO (verificado 2026-07-17)
Permitir **pegar el texto** del perfil (LinkedIn/Instagram) en lugar de subir una imagen → extracción exacta **sin OCR/Visión**. **Resuelve de raíz** el problema recurrente de capturas ilegibles de página entera (letra diminuta → el LLM alucina o lee mal con confianza alta; ver BUG-001 y el fix 01/06 de detección de legibilidad). El texto pegado ya viene en caracteres reales: el extractor sólo estructura, no adivina píxeles.
- Opcional/relacionado: leer el texto del perfil vía **Claude-in-Chrome** sobre la sesión logueada del usuario (NO scraping) — **no implementado**, sigue como idea futura opcional.
- Esfuerzo: bajo/medio. Nuevo modo de entrada en `/captura` y en `AgregarCapturaPanel` (textarea → mismo pipeline de extracción/observación, salteando Visión).

**Evidencia:** `src/components/relaciones/AgregarCapturaPanel.tsx` tiene un modo `text` (textarea + tipo `linkedin`/`instagram` autodetectado, override manual) que corre el mismo pipeline de extracción sin pasar por Visión. Nota: no confundir con `/captura/pegar` (`src/app/captura/pegar/page.tsx`), que es un feature DISTINTO para pegar conversaciones de chat (Teams/Slack) vía `/api/reader/paste`, no perfiles.

### Calendario v2 — OAuth + sync bidireccional + multi-calendario [prioridad: a definir] ✅ HECHO para Google (verificado 2026-07-17)
Hoy el calendario es **solo-lectura, una vía**, vía **URL `.ics`** (`OUTLOOK_ICS_URL`). Subir a:
- **Conexión fácil por login/OAuth** (Google/Gmail y Outlook/Microsoft) además de la URL `.ics`.
- **Sync BIDIRECCIONAL en tiempo real** (crear/editar eventos desde SIR, no solo leer).
- **Múltiples calendarios conectados a la vez** (ej. trabajo Outlook + personal Gmail).
- **Feature grande**: OAuth por proveedor (consent screens, refresh tokens, scopes, almacenamiento seguro de tokens), webhooks/push para tiempo real, manejo de conflictos en el merge bidireccional. **Definir alcance ANTES de construir** (¿qué proveedores primero? ¿escritura o solo lectura multi-fuente en v2.0?).
- Prioridad: **a definir** (revisión mañana).

**Evidencia (ya coincide con la reconciliación 14/07 de arriba):** OAuth Google completo — `src/app/api/calendar/oauth/google/{start,callback,status}/route.ts` — + `calendar/connections` (multi-calendario) + `calendar/events` con POST (creación bidireccional). Microsoft/Outlook OAuth quedó ❌ DESCARTADO (ver tabla de descartados: bloqueado por admin del tenant `grupohng.com`); para Outlook sigue la vía `.ics` sin admin. Este ítem suelto quedó desactualizado frente a la reconciliación de arriba — dejar esta nota para no reabrirlo por error.

---

## 🎯 EN CURSO

- **Fase 3b — Búsqueda Semántica**: ✅ **ACTIVA (2026-06-08).** pgvector (0015) + `src/lib/embeddings/client.ts` + `POST /api/memories/embed` + `POST /api/search` + `/buscar`. `OPENAI_API_KEY` cargada (server, OpenAI `text-embedding-3-small`); memorias indexadas y búsqueda validada.
  - **Próximo paso para activarla:** cargar `OPENAI_API_KEY` en el server → correr el embed sobre `observations`/`memories` existentes → validar `/buscar` end-to-end.

---

## 🔥 PRÓXIMAS SESIONES (orden definido)

### 0. Portar detail page completo de SIR V1 → V2 ✅ COMPLETADO (2026-05-31)

> **CERRADO.** Los 17 componentes están en prod (ver "EN PRODUCCIÓN" arriba). El checklist 1–17 de abajo se conserva como bitácora del arco; salvo iteraciones menores marcadas, todo está entregado. La sección de "Schema requerido / Esfuerzo estimado" quedó como registro histórico del plan original.

**Por qué (contexto histórico):** El detail page V2 arrancó mostrando solo 4 campos básicos. SIR V1 (sir.marlabinc.com) tenía una vista mucho más rica — la verdadera capa de valor. Ese arco ya se portó completo.

**Referencia visual:** Screenshot del 29/05/2026 en `sir.marlabinc.com` mostrando perfil de Diana Diaz con todos los componentes.

**Features pendientes a portar:** los 4 base ya están en prod (#1 score, #3 cumple, #4 última interacción + ruta detalle entregadas Sesión 3 PR-A/B). Quedan 13:

1. ✅ **Score relacional global** (base) — entregado en `RelationalScore.tsx` (PR #89). Reciprocidad sigue "datos insuficientes" hasta tener log de interacciones recíprocas; itera cuando la fuente exista.
2. 🟡 **Visualización del ciclo menstrual** — ENTREGADO PARCIAL en `CicloPanel.tsx` (Sesión 5): donut con fase actual (menstrual/folicular/ovulación/lútea), día del ciclo, próximo período estimado, nota contextual estática por fase. `cycleStartDate` + `cycleLengthDays` editables end-to-end. **Diferido:** (a) derivación de `cycle_start_date` desde capturas WhatsApp, (b) serie/historial de períodos, (c) overlay en timeline (Fase 3c).
3. ✅ **Cumpleaños** con countdown — entregado en `BirthdayCountdown.tsx` (PR #89) + `birth_date` editable end-to-end.
4. ✅ **Última interacción** con countdown — entregado en `LastInteractionPanel.tsx` (PR #88) leyendo `whatsapp_chat` más reciente filtrado por `is_obsolete=false`.
5. ✅ **Registro rápido** — entregado en `RegistroRapidoPanel.tsx` (Sesión 6). 4 acciones (Ánimo / Energía / Sueño / Dolor) con selector 1-5. Storage Supabase-native en tabla `person_logs` (migration 0013) vía POST `/api/person-logs`, no `relationships.history`. Alimenta correlación lunar/ciclo (Fase 3c).
6. ✅ **Vida profesional** — entregado en `VidaProfesional.tsx`, wired en `PersonDetail.tsx` (con `professionalAxisFromFacts`/`computeProfessionalAxis` cuando no hay LinkedIn, BUG-006). Verificado 2026-07-17.
7. ✅ **Vida social** (stats redes + seguidores en común) — entregado en `VidaSocial.tsx`, wired en `PersonDetail.tsx`; seguidores en común de IG ya mencionados como entregados arriba (línea "Redes sociales funcionando"). Verificado 2026-07-17.
8. ✅ **Lo personal** — entregado en `LoPersonal.tsx` (`person-synthesis`), wired en `PersonDetail.tsx`. Verificado 2026-07-17.
9. ✅ **Fechas importantes** con countdown — entregado en `FechasImportantes.tsx` (usa `people.special_dates` jsonb, migración 0010), wired en `PersonDetail.tsx`. Verificado 2026-07-17.
10. ✅ **Perfil profesional** — entregado en `PerfilProfesional.tsx` (sección colapsable), wired en `PersonDetail.tsx`. Verificado 2026-07-17.
11. ✅ **Redes sociales** conectadas con escaneo — entregado en `RedesSociales.tsx`, wired en `PersonDetail.tsx`. Verificado 2026-07-17.
12. ✅ **Nota de voz** — entregado en `NotaDeVozPanel.tsx` (migración 0014), wired en `PersonDetail.tsx`. Verificado 2026-07-17.
13. ✅ **Fechas especiales** añadibles — mismo componente que #9 (`FechasImportantes.tsx`): agregar/quitar fechas del array `specialDates` vía `/api/people/special-dates`. Verificado 2026-07-17.
14. ✅ **Registrar interacción** — entregado en `RegistrarInteraccionPanel.tsx` (Sesión 6). 5 estados emocionales (corazón roto → pleno = 1-5) + nota opcional. Mismo storage que #5 (tabla `person_logs`, `kind='interaction'`).
15. ✅ **MEMORIAS ASOCIADAS** (sidebar derecho, lo más crítico) — entregado en `MemoriasAsociadasPanel.tsx`, wired en `PersonDetail.tsx`; tabla `memories` existe con embeddings (Fase 3b activa). Verificado 2026-07-17.
16. 🟡 **Botones top-right** — parcial/rediseñado, no calcar el plan original al pie de la letra:
    - **Chat WhatsApp**: ✅ entregado en `PersonActions.tsx` (link `wa.me/{teléfono}`, deshabilitado si no hay teléfono).
    - **Briefing IA**: ✅ decisión de diseño consciente (ver comentario en `PersonActions.tsx`) — se fusionó en el Asistente SIR de la ficha (`PreguntarSobrePersona.tsx`, wired en `PersonDetail.tsx`) para tener un solo punto de IA conversacional, no un botón aparte. NO es un gap.
    - **Analizar screenshot**: ✅ resuelto de forma distinta al plan original — en vez de un atajo de navegación a `/captura/whatsapp` con persona pre-seleccionada, `AgregarCapturaPanel` está embebido directo en la ficha (`PersonDetail.tsx`), sin necesidad de navegar.
    Verificado 2026-07-17.
17. ✅ **Bitácora**: colapsable con historial completo — entregado en `Bitacora.tsx`, wired en `PersonDetail.tsx`. Verificado 2026-07-17.

**Schema requerido:**

- `people`: agregar columnas `fecha_nacimiento`, `ciclo_inicio` (date para inferir fase), `telefono`, `linkedin_url`, `instagram_handle`, etc.
- Nueva tabla `memories`:
  - `id`, `user_id`, `person_id`, `type` (`SEMANTIC|EPISODIC|EMOTIONAL|SOCIAL`)
  - `content` (JSONB), `source` (`screenshot_whatsapp|manual|inferred`)
  - `quality_score` (1-5), `timestamp`, `embeddings` (vector para Fase 3b).
- Pipeline: `capture/whatsapp` → extract memories → insert en `memories` con `person_id`.

**Prerequisitos:**
- Captura WhatsApp ya popula data parcialmente (PR #85).
- Migración de schema `people` necesaria.
- Tabla `memories` nueva (probablemente con `pgvector` para Fase 3b).
- Extracción/parseo de `relationships.history` items en memorias tipificadas.

**Esfuerzo estimado:** 5-8 sesiones (~20-30h):
- Sesión 1: planning + schema design + migration.
- Sesión 2: tabla `memories` + extracción desde history.
- Sesión 3: detail page layout base (score, ciclo, registro rápido).
- Sesión 4: detail page secciones contextuales (vida prof/social/personal).
- Sesión 5: memorias asociadas sidebar.
- Sesión 6: botones top-right (Briefing IA + Chat WA + Analizar).
- Sesión 7: registrar interacción + nota de voz.
- Sesión 8: polish + validación end-to-end.

**Prioridad:** ALTA. Es la verdadera capa de valor de SIR V2. Sin esto, la captura WhatsApp y el grafo quedan como features sueltas sin contexto consumible.

**Próxima sesión sugerida:** 30/05/2026 — Planning técnico completo con PASO 0 (schema design + decisiones de migration).

---

### 1. Issues de Fase 3b (planning estratégico)

- Decidir scope concreto de "Búsqueda Semántica".
- Posibles issues: pgvector setup, embeddings generation, search UI, re-rank, etc.
- Estimación de planning: 30-60 min.

> **Nota:** Captura Báscula (PR #79) y Captura WhatsApp Relaciones core (PR #85) **ya están en producción**. Sus residuales viven en "Pendientes menores" más abajo (sync engine hardening + re-validación conversationDate + variante whatsapp_web + extracción `relationships.history` → tabla `memories`).

---

## 🧲 BACKLOG inspirado en Clay (personal-CRM) — agregado 2026-05-31

Ideas tomadas de una reseña de **Clay**. Hilo conductor: SIR ya tiene la **lógica de engines** (timing / recommendation / signal / relationship — todos puros y testeados, ver `src/engines/*`); en varios casos lo que falta es **exponerla en UI**, no construir el cerebro. Ordenado por prioridad/criterio.

### P0 — ✅ CERRADO (2026-07-07)
**1. "Reconectar" / serendipia** — bloque en `/panel` que sugiere **hasta 5 personas por día** para reconectar. **ENTREGADO** (`72c5eba`): card "Reconectá con tu gente" que reusa el motor de Daily Actions filtrado a proactivos (`contact`/`cooling`/`acknowledge`), sin pisar Próximo (fechas) ni Personas en riesgo (pendientes/tono). `buildDailyActions` ganó filtro puro `kinds`; `/api/daily-actions` acepta `?focus=reconnect&limit=N` (retrocompatible); `DailyActionsPanel` ganó props `focus/limit/title/emptyLabel/hideWhenEmpty`. Gateada por `!simplified` (en recuperación dura no empuja contacto proactivo) y se esconde si no hay nadie enfriándose. 3 tests nuevos del filtro.
- **Qué era:** un feed diario "deberías hablarle a X" (por silencio prolongado, score relacional, señal).

### P1 — Alto valor, esfuerzo bajo/medio
**4. Fuerza de relación visible + filtrable** — ✅ **CERRADO** (`bcc0a0f`, "15·8 Clay #4"). Badge `Fuerte`/`Media`/`Débil` por persona en la lista + filtro con contadores en `/relaciones`. **Decisión de diseño** (`src/lib/relationships/strength.ts`): la fuerza = **cercanía estructural (capa de Dunbar / categoría)**, NO importancia ni salud reciente — un vínculo fuerte con silencio SIGUE siendo fuerte (la salud/atención es otro eje, ya cubierto por termómetro + ventana de contacto). El backlog original pedía basarlo en `importanceScore`/`healthScore`, pero eso quedó descartado (importancia en default 5 para casi todos → no diferenciaba). NO reintroducir la base por importancia sin revisar esta decisión.

**2. Cadence por persona** — ✅ **CERRADO** (2026-07-07). Picker estructurado de cadencia en el form de `/relaciones` (Automática/Diario/Semanal/Quincenal/Mensual/Bimestral/Trimestral/Semestral/Anual/Personalizado) + estado visible por persona en la lista ("al día" / "atrasado 12d" / "sin registro").
- **SIN migración:** el engine YA cerraba el loop — `contact_frequency` (texto libre) existía y `lib/people/urgency` `contactFrequencyDays` ya lo parseaba con fallback por categoría. El backlog asumía un campo nuevo por desconocer eso. Se reusó el mismo `contact_frequency` (sin split-brain de dos campos); el picker sólo lo hace elegible y visible. Lógica pura nueva en `lib/people/cadence.ts` (+15 tests). "Automática" = default por categoría (ya era el fallback). **Alimenta directo a Reconectar** (`/api/daily-actions` ya lee `contactFrequency`).
- **"Automática" inteligente ✅ (2026-07-07):** cuando hay señal robusta (≥5 contactos que abarcan ≥45d), la cadencia auto se infiere del **ritmo real** (mediana de gaps entre chats + interacciones + último contacto); si no, cae al default por categoría. Helper puro `suggestCadenceDays`/`effectiveCadenceDays` (+8 tests). Alimenta el MISMO cálculo en la lista (`/api/relaciones/cadence` + `useSuggestedCadence`) y en el scoring de Reconectar (`/api/daily-actions`) → sin divergencia. La lista etiqueta "cada Nd · tu ritmo" cuando aplica.

### Dirección de diseño (se cruza con el rework de UX en curso)
**3. Timeline unificado por persona como centro del detalle** — consolidar TODAS las interacciones (observations / capturas / logs / notas de voz) en **un solo hilo cronológico** que sea el **corazón** de la página de detalle, no un bloque más entre otros.
- **Nota:** se cruza con el rework de UX en curso (unificación de cards, captura inline). Dejar anotado como **dirección de diseño**, no tarea suelta: la página debería orbitar el timeline, con los paneles (redes, profesional, etc.) como contexto lateral.

### Lección de diseño (regla, no feature)
**5. Recordatorios día-por-defecto** — SI/cuando se implementen recordatorios, que sean **a nivel día por defecto** y con **hora solo cuando el usuario la fija**.
- **Por qué:** lección de Clay — forzar una hora a todo recordatorio genera fricción y falsa precisión. Default = día; hora = opt-in.

### Después / lift grande
**6. Auto-import desde calendario** — crear/enriquecer contacto automáticamente desde eventos del calendario y **traer contexto antes de la reunión**.
- **Esfuerzo: ALTO.** Integración externa (OAuth calendario, sync, matching a `people`). Backlog lejano.

**7. Q&A por persona** — ✅ **CERRADO** (`0a106c2`). Ask-box `PreguntarSobrePersona` en la ficha: reusa `/api/sir/ask` (grounding + RAG, ya hechos) con un `personId` nuevo que pre-scopea el contexto ANTES del cap, así responde aterrizado en esa persona aunque no la nombres. Sugerencias rápidas + `skipInlineGaps`. El backend (name-resolution + memorias semánticas + recall C3) ya existía; esto agregó el scope explícito + la UI. ✅ **Multi-turno YA HECHO (verificado 2026-07-21):** `PreguntarSobrePersona.tsx` mantiene `thread`/historial de turnos y lo manda como `history` a `/api/sir/ask` ("Sigue preguntando…"); el backend (`src/lib/sir/askSir.ts` líneas ~116-121, 542-550 + `chatProvider.ts`) arma `chatHistory` real para el LLM, no lo ignora. La nota anterior ("hoy una pregunta por vez") quedó desactualizada. **Sigue pendiente (no verificable por grep):** validar en vivo con LLM real que las respuestas de seguimiento usan bien el hilo.

**8. Cross-referencing por ubicación** — ✅ **HECHO** (ya lo decía la reconciliación 07-14 arriba; re-verificado 2026-07-20). que la capa de memoria/engines interprete el campo `location` (ya existe en `people`; ahora editable a nivel distrito/ciudad) y lo cruce.
- **Qué es:** sugerencias contextuales por cercanía — "Diana vive en Barranco → visitala", o "X y vos están cerca" cuando Aaron está en la zona. Aparece en la **Agenda / Próximo**.
- **Conecta con:** `timing` + `recommendation` engines y la vista Agenda. Requiere normalizar `location` (distrito/ciudad) y, para "estás cerca", una fuente de ubicación de Aaron (manual o futura). Esfuerzo medio; ~~no implementar aún, solo anotado~~.
- **Evidencia:** `src/lib/agenda/build.ts` función `buildProximity` (comentario explícito "Cross-referencing por UBICACIÓN (Clay #8)") + `ProximoPanel.tsx`. Este párrafo había quedado desactualizado frente a la reconciliación 07-14 — dejar esta nota para no reabrirlo por error.

**9. Familia / relaciones persona↔persona (padres como nodos del grafo)** — ✅ **HECHO** (ya lo decía la reconciliación 07-14 arriba; re-verificado 2026-07-20). Texto original (histórico, ya no vigente): ~~DIFERIDO de la tanda de campos de relación (era el item A4). Hoy NO existe modelo persona↔persona: `relationships` es self↔persona (una fila por contacto) y el grafo es una estrella desde el self.~~ Ponerlo bien requirió un **sub-proyecto**:
- **Modelo:** nueva tabla `person_links` (`person_a_id`, `person_b_id`, `kind` ∈ parent/sibling/partner/…, `user_id`) + RLS. Migración aditiva. → **hecho**: migraciones `0035_person_links.sql`, `0052_person_links_realtime.sql`, `0058_person_links_self_sentinel.sql`, `0107_person_links_metadata.sql`, `0128_person_links_category.sql`.
- **Grafo:** el builder debe dibujar aristas persona↔persona (no solo self→persona). → **hecho**: `src/lib/graph/builder.ts` acepta `personLinks` y dibuja aristas persona↔persona y self↔persona (ver `builder.test.ts`), wired en `GraphView.tsx`.
- **UI:** mini-sección "Familia" en la ficha. → **hecho**: `FamiliaPanel.tsx`.
- **Por qué se difirió (histórico):** alcance/riesgo propio; no mezclarlo con cambios de campos simples. Este párrafo había quedado desactualizado frente a la reconciliación 07-14 — dejar esta nota para no reabrirlo por error.

### ⚠️ Guardrail a respetar (cuando se active la búsqueda semántica, Fase 3b)
Asegurar que **personas con poca o ninguna interacción NO desaparezcan de los resultados**. Es una **falla conocida de Clay** (los contactos "fríos" se vuelven invisibles). SIR **ya la esquiva en el grafo** (commit del 31/05: el grafo dejó de ocultar nodos sin `history`/actividad). Replicar ese criterio en `/buscar` y en cualquier ranking: el embedding/score puede **ordenar**, nunca **excluir** silenciosamente a un contacto existente.

---

## 📦 FASES PLANEADAS Memory Longitudinal (post-Captura)

Sub-fases ya estructuradas como milestones en GitHub.

| Sub-fase | Capacidad | Estado | Nota |
|----------|-----------|--------|------|
| 3a | Historial Profundo | ✅ CERRADA | (cerrada 28/05) |
| 3b | Búsqueda semántica (pgvector + embeddings) | ✅ ACTIVA (2026-06-08) | key + memorias indexadas; cobertura cerrada con "Actualizar índice completo" (PR #100); decisión: no embeddear `observations` crudas |
| 3c | Resumen automático de patrones longitudinales | ✅ ENTREGADA | correlación lunar/ciclo + resumen semanal (`874f019`, 0016) |
| 3d | Memoria que aprende (RAG cross-session) | 🟡 NÚCLEO HECHO (verificado 2026-07-17) | `/api/learnings` + `src/lib/learnings/{recall.ts,derive.ts}`, cableado al brief de `/horario` (`renderLearningsBlock`/`rowToLearning` en `src/app/api/horario/brief/route.ts`). Coincide con la reconciliación 14/07 de arriba. Esta fila quedó desactualizada — no confundir con "pendiente" |

Timeline aspiracional: Fase 3 entera en 2-3 meses (4-8 semanas activas).

---

## 🏗️ DEUDA ARQUITECTÓNICA

### Consistencia temporal de hechos derivados (detectado 2026-06-08 · 🟡 PARCIAL 2026-07-07)

**🟡 Primer slice HECHO (`874051e` + fix conservador `6f28e3c`):** `src/lib/facts/reconcile.ts` (PURO). Regla ÚNICA y conservadora: **solo una MUDANZA explícita** (se mudó / se instaló / llegó a `<NombrePropio>`) deja obsoleta la vivienda ANTERIOR. Sin mudanza, los hechos de vivienda CONVIVEN (son complementarios: "vive en Lima" + "vive con su esposo" describen la misma casa). Cableado en `consolidate.ts` (import de WhatsApp). Nicolle resuelto (backfill hecho). **Lección cara:** la v1 era demasiado agresiva (cualquier "vive con/en X" pisaba lo anterior); un backfill network-wide dropeó facts complementarios válidos → restaurados + motor endurecido. **Falta:** (a) NO aplica a `deriveFromObservations` (memorias) — ahí NO hay `facts`, se derivan de summary/topics; la reconciliación por atributo no encaja en memorias episódicas; (b) backfill network-wide conservador (relocation-only) pendiente de DRY-RUN + aprobación antes de re-aplicar; (c) ocupación (multi-valor) NO se toca.


**Síntoma:** la derivación de memorias/hechos (WhatsApp export, observations → memories) UNE hechos de distintas épocas sin saber que el más reciente reemplaza al viejo. Caso real: en la ficha de Nicolle coexisten "vive con Aaron (comparten vivienda)" (cierto en 2024) y "Llegó a Alicante" (se mudó a España para su maestría) — el sistema no marca el primero como obsoleto.

**Causa raíz:** los `facts`/`memories` no llevan validez temporal ni relación de supersesión. `unionStrings` dedupe por texto exacto, no reconcilia hechos contradictorios sobre el mismo atributo (dónde vive, estado civil, trabajo).

**Alcance:** transversal a TODA la derivación, no solo al export de WhatsApp.

**Dirección (no para ahora):** marcar cada hecho con fecha/origen + una capa de reconciliación por ATRIBUTO (residencia, civil, ocupación…) que prefiera el más reciente y degrade el viejo (como ya hace la lógica de recencia del summary). Encaja con la "Memoria que aprende" (Fase 3d) y con el arco de identidad (E4). Esfuerzo: alto.

**Mitigación hoy:** la identidad estable (dónde vive, parentesco, estado civil) va en el PERFIL de la persona (campos + vínculo familiar), no se deja depender de la derivación del chat.


### Split-brain `localStorage` ↔ Supabase — ✅ RESUELTO (verificado 2026-07-07)

**Síntoma original (29/05):** la lista `/relaciones` leía del store Zustand; el detail page leía Supabase directo; el sync engine hacía merge aditivo → `removePerson` no emitía DELETE a Supabase; deletes por SQL directo quedaban huérfanos en localStorage.

**Estado real (verificado en código + tests el 07-07):** el arco de refactor **ya se hizo** (junto con el "Sync en vivo ✅" de más arriba). Hoy el store **es** un cache hidratable con Supabase como única fuente de verdad:
- **Deletes se propagan:** `flushOps` (engine.ts) emite `.delete().in('id', deletes).eq('user_id', …)` al detectar el borrado en el store; `removePerson` → diff → DELETE a DB.
- **Reconciliación destructiva:** `reconcilePull` (reconcile.ts, PURO + testeado): DB autoritativo; fila local ausente de DB **sin** push pendiente → **se dropea** (delete remoto, SQL directo o fantasma); **con** pending → se preserva (offline-safe). `pendingIds` positivo, no el viejo `knownIds`.
- **Escrituras unificadas:** lista y ficha escriben por el store (`updatePerson`/`removePerson`) → engine → DB. La ficha lee Supabase server-side pero muta por el store.

**Regla operativa vieja (YA NO aplica):** ~~"nunca borres por SQL directo, queda huérfano"~~ — un delete directo en Supabase se dropea del store en el próximo re-pull (focus/Realtime), no está en DB ni es pending.

**Único residual (menor, no bloquea):** last-write-wins por fila — el `upsert onConflict:'id'` pisa la fila entera, así dos ediciones concurrentes de campos distintos se pisan. Impacto casi nulo en mono-usuario. Fix futuro opcional: merge por campo o `updated_at` por columna.

### Sincronización en vivo entre dispositivos (sync cross-device) ✅ RESUELTO (verificado en vivo)

**Estado:** CREATE / UPDATE / DELETE se propagan en vivo entre dispositivos **sin recargar**. Verificado end-to-end en prod con dos pestañas (incluido el borrado, sin resurrección, Diana intacta).

**Síntoma original:** el sync era push inmediato en mutación + pull SOLO al cargar/loguear → los cambios del otro dispositivo se veían recién al recargar.

**Solución entregada (varias capas; las 3 migraciones ya aplicadas en prod):**
- **Re-pull al recuperar foco/visibilidad** (`visibilitychange` + `window 'focus'`, throttle 2s) + **re-push de pendientes al reconectar** (`online`) — engine `attachSupabaseSync`.
- **Supabase Realtime** (`postgres_changes`, event `*`) por tabla del Camino A; cada evento dispara un re-pull debounced (600ms), DB-autoritativo. Migración **0017** (agrega las 9 tablas a la publicación `supabase_realtime`).
- **DELETE en vivo** requirió dos piezas más:
  - **0018** `REPLICA IDENTITY FULL` en las 9 tablas → el evento DELETE incluye la fila vieja con `user_id` para que Realtime evalúe la RLS y lo entregue.
  - **0019** `publish='insert,update,delete,truncate'` en `supabase_realtime` → la publicación efectivamente emite DELETE.
- **Reconciliación con `pendingIds`** (no `knownIds`): en el pull se preservan SOLO las filas con push local pendiente; toda fila local ausente de DB sin push pendiente (delete remoto o fantasma adoptada por pull viejo) se dropea. Esto fue el eslabón final: sin él, una fila adoptada por sync no se borraba en el receptor ante un delete remoto.

**Invariantes:** los re-pulls corren bajo `isApplyingPull` (nunca emiten DELETE/upsert a prod, sin loop de eco); las altas offline se preservan (`pendingIds`) y se re-pushean al reconectar.

**Pendientes menores (no bloquean, quedan para iteración):**
- Mitigar el **last-write-wins por fila** (el `upsert` por `onConflict:'id'` pisa la fila entera): merge por campo o timestamps de conflicto. Hay una ventana de carrera last-write-wins más visible ahora que se re-pullea seguido.
- Logging de diagnóstico `[sync]` gateado tras `localStorage 'sir-debug-sync'` (silencioso por defecto; se deja para debug futuro).

---

## ⏳ PENDIENTES MENORES (no urgentes)

Mejoras incrementales. Hacer cuando aporte valor concreto.

- ~~**`/captura` — subir VARIAS imágenes a la vez**~~ ✅ **HECHO (#102, `BatchCapturePanel`):** N imágenes de tipos/personas distintas, procesadas en cola client-side secuencial (detect → process por archivo, estado por imagen, vínculo de persona por captura tras guardar). Aislado del flujo single (que queda intacto); reusa los clientes probados (`detectCaptureType`/`processCapture`/`linkObservationToPerson`). Vive al fondo de `/captura`. (Verificado 2026-07-08 en el barrido de reconciliación.)

- ~~**Storage buckets — cleanup de huérfanos**~~ ✅ **RESUELTO (14/07/2026) — DECISIÓN: CONSERVAR (opción B).** Política de retención: las imágenes asociadas a `observations.is_obsolete=true` **se conservan como referencia** (nunca se borran al obsoletar), para poder re-extraer del original si algún día hace falta. **NO se corre ningún script de limpieza destructivo.** El código YA cumple esta política: los únicos `.remove()` de Storage son (a) rollback cuando un insert falla —imagen sin fila, basura real—, (b) reemplazo de avatar, y (c) borrado EXPLÍCITO de nota de voz (acción del usuario). Ninguno borra al obsoletar una captura. Las huérfanas históricas del 29/05 quedan como referencia, a propósito.

- ~~**Sentry + Vercel Analytics**~~ ✅ INSTALADO: `@sentry/nextjs` + `@vercel/analytics` cableados (`instrumentation.ts`/`instrumentation-client.ts`, `onRequestError`; no-op sin DSN). Falta solo cargar el DSN en prod para que capture.

- ~~**Mobile QA estructurado**: validar flujos críticos en 375px / 390px / 414px / 768px.~~ ✅ **HECHO (verificado 2026-07-20):** PR #819/#820 (`d4a5218`, 18/07/2026) — harness Playwright en `e2e/` (`overflow.spec.ts`, `tap-targets.spec.ts`, `smoke.spec.ts`, `nav.spec.ts`) corriendo sobre proyectos `mobile-se` (375), `mobile-390` (390), `mobile-xl` (414), `tablet` (768) + `desktop` (`playwright.config.ts` líneas 42-51). CI dedicado `.github/workflows/e2e.yml` (manual + nightly, aislado de `validate`). El pase 07-18 quedó desactualizado porque este PR mergeó ese mismo día.

- ~~**Estados vacíos pedagógicos**~~ ✅ **HECHO (verificado 2026-07-18):** componente compartido `src/components/ui/empty-state.tsx` con prop `hint` (siguiente paso accionable), usado en ≥9 rutas (`salud`, `finanzas`, `objetivos`, `seguimiento`, `senales`, `relaciones`, `panel`, `linea`, `eventos`, `explorar`); `/memoria` tiene su propio empty state hand-rolled (`0de0114`) aún más detallado. No quedaba "resto pendiente".

- ~~**Emails Supabase template ES**~~ ✅ Template ES listo en `docs/auth-email-templates-es.md`. **Pegarlo en el dashboard de Supabase = acción manual** (no versionable desde el repo).

- ~~**Accessibility pass**: fix `aria-describedby` en Sheet (warning detectado en Issue #70). Esfuerzo: 30 min.~~ ✅ Resuelto en sweep 30/05/2026 — `SheetDescription` sr-only en AppShell + TimelineFiltersMobile.

- **Gantt fix**: el Gantt del MASTER_PLAN omite la fase activa cuando las previas no tienen due_on. Fix: usar fecha de creación del milestone como fallback. Esfuerzo: 30 min.

- ~~**Toggle privacidad finance en /timeline**~~ ✅ **HECHO (verificado 2026-07-18):** `src/components/timeline/TimelineFeed.tsx` (líneas 67-78) — `financeHidden`/`toggleFinance()` + botón "Ocultar/Mostrar finanzas" (Eye/EyeOff). Coincide con la reconciliación 14/07 de arriba.

- ~~**Cap en `relationships.history`**~~ ✅ **HECHO (verificado 2026-07-18):** `src/lib/supabase/sync/adapters/relationships.ts` (líneas 137-140) — `history: (r.history ?? []).slice(-50)`, comentario cita el ADR 0005 R7 explícitamente. Aplicado en el push local→Supabase.

- ~~**Robots.txt + noindex para rutas autenticadas**~~ ✅ Resuelto: `src/app/robots.ts` en prod.

### Edición completa en /relaciones/[slug] ✅ RESUELTO

**Detectado:** validación manual del 29/05/2026 (PR #85). **Resuelto:** el detail page (`PersonDetail.tsx`) ya tiene edición inline de los campos de la persona (no solo nombre + slug); ya no hace falta volver a `/relaciones` para editar.

---

### Grafo /red/grafo — zoom inicial más generoso ✅ RESUELTO (consolidación post-Sesión 3)

**Síntoma (29/05/2026):** al abrir `/red/grafo` con pocas personas (2 nodos: self + Diana), los labels se cortan ("Diana C" en vez de "Diana Carolina", "Aarón Huayna" en vez de "Aarón Huaynate Espinoza").

**Fix entregado:** `zoomToFit(400, 100)` en lugar de `zoomToFit(400, 40)` en `GraphCanvas.tsx` (conservador, sin tocar `nodeRelSize` ni padding dinámico). Validación visual en prod después del deploy.

---

### Re-validar Captura WhatsApp con screenshot con fecha explícita

**Contexto (29/05/2026):** el fix de prompt para `conversationDate` (commit `360bfde` en PR #85) se aplicó pero nunca se re-validó con un screenshot que SÍ tenga fecha explícita visible en el header o como separador. Las pruebas post-fix fueron con capturas sin fecha visible (correctamente devolvieron `null` + warning amber).

**Test pendiente:** subir un screenshot de WhatsApp donde el header muestre fecha tipo "Today", "Yesterday", "26 May 2026", o separador de día visible en medio del chat.

**Comportamiento esperado:**
- `conversationDate` debe resolverse correctamente a la fecha visible con offset Lima -05:00.
- Sin warning amber en `WhatsAppCapturePreview`.
- `rawObservations` NO debe mencionar "Sin fecha explicita visible".

**Prioridad:** Alta. Validar antes de capturar muchas conversaciones para asegurar que el caso "con fecha visible" no se rompió por el fix.

---

### Ajuste prompt Vision Captura WhatsApp — asignación user/other

**Síntoma:** En screenshots con stickers o cuando los emojis aparecen sin bubble explícito, Vision puede invertir la asignación `author='user'` vs `author='other'`.

**Caso de prueba (29/05/2026):** Screenshot con Diana Carolina:
- Vision asignó incorrectamente "Me vino la regla" como `user` (debería ser `other`=Diana, bubble izquierdo).
- Vision asignó incorrectamente el sticker "Ala yo estaba full" como `other` (debería ser `user`, bubble derecho).

**Fix aplicado (commit `96172cc` en PR #85):** Refactor del system prompt para hacer más explícita la regla "bubble derecho = user, izquierdo = other": (1) promovida a REGLA 1; (2) énfasis en colores WhatsApp (verde/turquesa = user, gris/blanco = other); (3) aplica AUN con stickers/emojis solos/audios; (4) ejemplo concreto con el caso real; (5) paso de validación re-read antes de responder.

**Si el bug reaparece:** considerar agregar al prompt una sección de "validación pre-respuesta" más estricta, o un retry server-side que detecte coherencia (ej: si el primer mensaje cronológico es de un sticker, validar que sea `user`).

**Estado:** RESUELTO con fix en PR #85. **Pendiente re-validar con nueva captura** post-merge.

### Mejoras de UX captura (post-merge PR #79 + fix 0006)

Detectadas durante el diagnóstico del 28/05/2026, cuando los upserts de `health_metrics` fallaban silenciosamente y la UI mostraba "8 métricas guardadas" aunque sólo estaban en `localStorage`. La causa raíz (migration 0002 incompleta) se resuelve con migration 0006. Estas dos mejoras son la **defensa-en-profundidad** para que falla silenciosa no vuelva a engañar al usuario.

- ~~**Sync engine: surface push failures al usuario.**~~ ✅ **HECHO (`notifySyncFailure` en `src/lib/supabase/sync/engine.ts`):** cuando `pushWithRetry` agota los reintentos, se muestra un toast («No pude sincronizar algunos cambios · quedaron guardados en este dispositivo, reintento al reconectar»), throttled 12s para no spamear en ráfagas offline. Tono tranquilizador (la fila queda en localStorage y se re-pushea al reconectar). (Verificado 2026-07-08.)

- ~~**`persistScaleCapture` no espera ACK del push.**~~ ✅ **HECHO (verificado 2026-07-18):** `src/lib/capture/scale/client.ts` línea 77 ya tiene el arg opcional `awaitSync?: boolean` (líneas 144-150, espera `waitForRowsConfirmed`), cableado con `awaitSync: true` en `ScaleCaptureBranch.tsx`, `ScaleCaptureFlow.tsx` y `MisCapturas.tsx`. Solo el flujo batch (`healthBatch.ts`) no lo usa, intencionalmente (comentario: no debe colgarse por una imagen).
  Texto original (histórico): `src/lib/capture/scale/client.ts` retorna `{ insertedCount: N }` ni bien hace `setState` — el sync engine procesa el push asíncrono después. Si el push falla, la UI ya pasó al Step 4 "success" con mentira. Fix: agregar arg opcional `awaitSync: boolean` al `persistScaleCapture` que use el callback de arriba para esperar al ACK antes de resolver la promesa. Trade-off: rompe levemente el offline-first (la UI bloquea hasta que el server confirme). Para Captura específicamente, vale la pena porque las 13 métricas son irrecuperables si se pierden. Esfuerzo: 30 min después de tener el callback del punto anterior.

---

## 🔮 IDEAS BRAINSTORM (post-Fase 3, evaluar antes de implementar)

Ideas conversadas pero NO comprometidas. Cada una requiere planning serio antes de arrancar.

### Skills operativas estáticas

- Carpeta `src/skills/` con documentos markdown que el LLM consume como contexto al razonar.
- Ejemplos: `emotional_timing.md`, `relationship_context.md`, `cycle_context_analysis.md`.
- **NO autoeditables.** Versionadas en git, editadas por humanos.
- Diferencia clave vs SkillOpt: humans en el loop SIEMPRE, sin reflection loops automatizados.

### ADR formal "SIR optimiza bienestar, NO engagement"

- Crear ADR-XXXX que establezca este principio como invariante del sistema.
- Aplica a TODA decisión futura (engines, recommendations, capturas, etc.).
- Define explícitamente qué NO está permitido: dark patterns, dependencia afectiva, manipulación, decisiones médicas.

### CodeGraph como tool de productividad

- Evaluar en PoC de 30 min + 1 semana de uso real.
- Indexador AST local con MCP server.
- Ayudaría a Claude Code a entender mejor el monorepo.
- Bajo riesgo, sin lock-in.

### Ingestión documental (post-Captura WhatsApp)

Cluster de 3 ideas relacionadas. Comparten infraestructura (Storage + parser + memories) y deben evaluarse en orden secuencial.

### MarkItDown como librería de ingestión

**Qué:** Integrar `markitdown` (Microsoft, open source) para convertir documentos heterogéneos en Markdown semántico procesable por LLM.

**Formatos soportados:**
- PDF (informes médicos, recibos, contratos)
- DOCX (journals viejos, documentos personales)
- PPTX (poco probable pero gratis)
- XLSX (tablas/datos)
- HTML (artículos guardados)

**Caso de uso:** Subir PDF → MarkItDown → memoria importada como markdown estructurado en tabla memories.

**Esfuerzo:** 2-3 sesiones (endpoint + UI upload + flujo preview/edit antes de guardar).

**Prerequisito:** después de Captura WhatsApp (reusa infraestructura de Storage + Vision pattern).

### Importar exportaciones masivas de WhatsApp

**Qué:** Procesar el ZIP que WhatsApp exporta (chat.txt + media opcional) para reconstruir historial de relación con una persona.

**Diferencia con Captura WhatsApp:**
- Captura WhatsApp: 1 screenshot a la vez (conversaciones recientes)
- Importación masiva: meses/años de historial de una sola vez

**Caso de uso:** "Quiero meter mi historia completa con Diana de los últimos 2 años." Parsea chat.txt línea por línea, agrupa por períodos significativos, genera summaries narrativos con LLM, inserta como items en relationships.history.

**Esfuerzo:** 3-4 sesiones (parser chat.txt + chunking + embeddings + dedupe).

**Prerequisito:** después de Captura WhatsApp y Fase 3b (búsqueda semántica con pgvector para evitar duplicados semánticos).

### Ingestión documental general

**Qué:** UI genérica "subir documento" que detecta tipo y rutea al procesador correcto.

**Tipos soportados:**
- PDF informe médico → memories + health_metrics si aplica
- DOCX journal viejo → memories en bloque
- TXT export chat → relationships.history
- Imagen con texto → OCR + memories

**Caso de uso:** Centralizar todas las capturas/imports en una sola UI con detección inteligente del tipo.

**Esfuerzo:** Difícil estimar — depende de tener MarkItDown + Captura WhatsApp como base.

**Prerequisito:** después de MarkItDown.

---

## ❌ DESCARTADO (con razón documentada)

Cosas evaluadas y conscientemente NO incluidas en el plan. Documentadas para evitar re-evaluar en futuras conversaciones.

| Tecnología/Idea | Razón del descarte |
|-----------------|---------------------|
| **Calendar OAuth Microsoft/Outlook** (14/07/2026) | Requiere registrar app + admin consent en el tenant corporativo de HNG (`grupohng.com`). Aaron NO es admin y IT tiene el tenant cerrado → fuera de su alcance. Ganancia marginal (solo agrega ESCRITURA de eventos). Para LEER Outlook en SIR ya existe la vía `.ics` sin admin (`calendar_connections` + `OUTLOOK_ICS_URL`). **NO re-evaluar** salvo que HNG habilite el tenant. |
| **Ingestión DOCX / MarkItDown** (14/07/2026) | Aaron casi no mete archivos Word. PDF + texto pegado ya cubren el caso, y el workaround (abrir el .docx → copiar → pegar en "texto pegado") es trivial. Esfuerzo bajo pero valor casi nulo. **NO re-evaluar** salvo que empiece a ingerir .docx seguido. |
| **Nudges proactivos por WhatsApp** (14/07/2026) | Los nudges proactivos (brief mañana/tarde, recordatorios, "hace X que no hablás con Y") YA existen y funcionan **por Telegram** (crons morning/evening-push, gratis, sin restricciones). Replicarlos en WhatsApp choca con la regla de 24h de Meta → exige plantillas pre-aprobadas + WhatsApp Business API + setup burocrático, para el MISMO resultado. Valor duplicado. **NO re-evaluar** salvo que Aaron quiera específicamente los avisos en WhatsApp y no en Telegram. (El WhatsApp Cloud reactivo —responder cuando le escribís— se mantiene; esto descarta solo los nudges salientes.) |
| **Neo4j** | PostgreSQL/pgvector cubre el caso. Neo4j agrega servidor extra, sync entre DBs, complejidad operacional 10x. Volumen no lo justifica. |
| **TurboVec** | En Alpha. pgvector en Supabase = misma DB, mismo backup, mismo RLS. Sin razón para stack paralelo. |
| **SkillOpt con autoedición** | Riesgo ético alto en dominio emocional. Skills evolutivas que se "optimizan" sobre tu vida sentimental pueden generar dark patterns sutiles emergentes. Usar skills estáticas con human-in-the-loop. |
| **OpenClaw multi-agent** | Premature optimization. Tu sistema con 1 user no necesita orchestration multi-agent. Evaluable en 12+ meses si el sistema crece. |
| **React Native Expo (mobile nativo)** | Web responsive ya funciona en mobile. Construir mobile nativo duplica codebase sin valor agregado actual. |
| **Filter de fixtures en migration 0003** | Decisión consciente: para uso personal NO es problema. Si se abre a otros usuarios, agregar el filtro. |
| **Mock `__fail__` trigger en /timeline** | Útil en Issue #70, eliminado en Issue #71. Partial failure real reemplaza el mock. |
| **Wizard de migración histórica USD→PEN** | Aceptado conscientemente: reinterpretación de movimientos viejos como PEN, asumiendo pérdida histórica mínima. |
| **Sleep quality-9 singleton del 27/05** | Borrado en cleanup del 28/05 (caso 🟡 incierto, asumido como test inicial). |

---

## 📐 PRINCIPIOS FUNDACIONALES

Invariantes del sistema. NO se contradicen por nuevas features.

1. **SIR optimiza bienestar relacional, NO engagement adictivo.**
   Toda recommendation, engine, captura debe servir al wellbeing del usuario, no a métricas de uso.

2. **Local-first + sync transparente.**
   El usuario debe poder usar SIR offline. El sync con Supabase es invisible.

3. **Privacidad por defecto, uso privado permitido.**
   RLS en todas las tablas. SIR puede analizar en privado información que Aaron posee, recibe, registra, consulta en fuentes que maneja o que fue publicada por otros. Consentimiento/confirmación aplica para publicar, compartir, exponer, automatizar acciones hacia terceros o sacar datos íntimos fuera del espacio privado.

4. **De frente a producción.**
   Merge directo a `main` con squash; la validación ocurre **en producción** (Vercel deploy automático), no en preview ni en localhost. Las exigencias de CI verde (tsc + lint + build) son no negociables. Excepciones que requieren confirmación previa siguen vigentes: migraciones `DROP`/`DELETE`, rotación de keys (Anthropic/Supabase/pagos/identidad), cambios en `NEXT_PUBLIC_*`.

5. **Human-in-the-loop para acciones sensibles, no para pensar.**
   SIR puede analizar, clasificar, priorizar, redactar borradores y proponer sin pedir confirmación. Requiere confirmación humana antes de enviar mensajes/correos, publicar, compartir datos, borrar información importante, tocar secretos/configuración, pagos, salud, legal, finanzas o automatizar acciones sobre terceros.

6. **Documentar descartados con razón.**
   Toda idea evaluada y NO incluida se documenta acá. Evita re-evaluar en conversaciones futuras.

---

## 🔗 Referencias

- `MASTER_PLAN.md` → roadmap generado automáticamente por sir-bot.
- `docs/decisions/` → ADRs formales.
- `docs/phase-3a/` → docs específicos de sub-fase 3a (cerrada).
- GitHub Issues → tracking de sesiones operativas.
- GitHub Milestones → fases formales (3a/3b/3c/3d + 5).

## 🔭 FIXTURE FUTURO — SIR por WhatsApp (canal de captura + nudges)

**Idea (2026-06-12, a partir del análisis Bizum vs WhatsApp Payments):** la gente
ya vive en WhatsApp; ahí nace la materia prima de SIR (conversaciones, datos de
la gente, momentos que valen recordar). Un canal de SIR sobre WhatsApp ataca la
fricción #1 del producto: la captura.

**Forma propuesta (NO "ejecutar todo SIR en WhatsApp"):**
- **WhatsApp = carril rápido de I/O.** Mandás texto/nota de voz a un número SIR
  ("me crucé con Fran, cumple 20 jun") → SIR captura/deriva y confirma. Reenviás
  un chat → lo ingiere (reusa el pipeline de export, ya existe). Brief/nudge
  proactivo a la mañana ("Francisco viene bajando — ¿le escribís?").
- **La web sigue siendo el cockpit.** Calendario, "Tu rumbo", tendencias, grilla
  → nada de eso entra en un chat sin volverse ruido (anti-paz). El chat captura
  y empuja; la web piensa y muestra.
- **Adaptador, no columna vertebral.** El caño de WhatsApp es UN canal más (como
  el de export). Si Meta cambia las reglas, se pierde un canal, no el producto.

**Tensiones / restricciones a resolver antes (lo que hace que sea fixture y no ya):**
- **Privacidad (lo más caro):** un bot de WhatsApp Business NO tiene la privacidad
  de un chat personal — Meta ve metadata y según el setup, contenido. Choca con
  el principio #5 (privacidad radical). Aceptable para uso personal de Aaron;
  difícil de defender si SIR es producto para terceros. Ver [[sir-filtro-paz-objetivos]].
- **No es runtime, es canal:** WhatsApp Business / Cloud API (texto/voz/botones in,
  links out). El cerebro de SIR sigue server-side.
- **Regla de 24h:** fuera de la ventana de 24h desde el último mensaje del usuario,
  solo plantillas pre-aprobadas por Meta → los nudges proactivos están regulados.
- **Dependencia de Meta:** ToS, costo por conversación, riesgo de cambio de reglas.

**Spike de exploración — HECHO 2026-06-12** (ver `docs/SIR-WHATSAPP-SPIKE.md`): GO condicional para uso personal de Aaron (MVP captura iniciada por usuario = ~$0, sin plantillas); NO-GO/diferido como producto para terceros hasta resolver privacidad (el Cloud API descifra en Meta; On-Premises deprecado). Lo que faltaba investigar era: validar la
materialización — Cloud API vs proveedor (Twilio/360dialog), modelo de privacidad
real, costo, MVP mínimo (solo captura por texto/voz → reusar nota-autodetect +
export), y la regla de 24h para nudges. Salida del spike: doc de decisión
go/no-go + scope del MVP.

---

---

_Para actualizar este backlog: editar manualmente, commit con mensaje `docs(backlog): <cambio>`. NO depender del sir-bot para mantenerlo._
