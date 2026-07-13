# SIR V2 — Estado actual y pendientes

> Documento vivo. Última actualización: **2026-07-08**.
> Qué se construyó, qué está en producción, qué falta y en qué orden.

---

## 1. Resumen ejecutivo

SIR V2 es un sistema operativo cognitivo-relacional privado (mono-usuario). Su base científica vive en `docs/00–20`; sobre ella se construyeron ~40 módulos. El trabajo reciente se concentró en la **ficha de persona** (`/relaciones/[slug]`): pasó de una pila plana de ~45 paneles a una ficha **en tabs, adaptativa por tipo de vínculo**, con el **Horizonte del ciclo** como módulo protagonista.

Todo lo listado en la sección 2 está **mergeado a main y en producción** (`sir-v2-life-os.vercel.app`), build-validado.

---

## 2. Lo construido en la última sesión (ficha de persona)

| Área | Qué se hizo | Estado |
|---|---|---|
| **Rediseño en tabs** | La ficha se reestructuró en 5 tabs: **Hoy · Conversación · Perfil y memoria · Registro · Red**. Los ~47 paneles se agruparon sin perder cableado. | ✅ Prod |
| **Horizonte del ciclo** | Módulo protagonista: línea de tiempo visual (banda de fases real/predicción tramada, pins de eventos, regla de días, tono por día, ventanas para proponer, tarjetas de lectura de cuidado). Engine puro `lib/ciclo/horizon.ts` + `CycleHorizonCard`. | ✅ Prod |
| **Ficha adaptativa por tipo** | `lib/people/fichaProfile.ts` (+13 tests): clasifica el arquetipo (afectivo/familiar/personal/colega/lead) y gatea **Cuidado (ciclo) solo para afectivo** y **pipeline solo para colega/lead**. Arregla el bug: una colega mujer veía el ciclo. | ✅ Prod |
| **Rescate de datos huérfanos** | `ReflexionesPanel` (reflectionQuestions), `emotionalStates` en la última interacción, rows read-only de ámbito/grupo/sexo en Métricas. | ✅ Prod |
| **Pipeline como contacto (#3)** | `DealsAsContactPanel`: deals donde la persona es el decisor, gateado por comercial. | ✅ Prod |
| **Limpieza** | Se sacó el `CuratedObservationsPanel` (stub de debug que quedó visible en prod). | ✅ Prod |

---

## 2.bis Integridad de las señales relacionales (PRs #594–#606)

Barrido que arregló la cadena de señales que alimenta score, forecast y ficha. **Origen:** el forecast de ciclo de Diana salía plano porque 180/193 de sus logs eran llamadas/imports (placeholders `value=3`) que envenenaban el promedio de tono. Todo en prod.

| Qué | PR |
|---|---|
| **Tono discrimina + backfill histórico** — rúbrica para que el `value` de interacción no colapse a 3; recalibración de los logs viejos. | #598, #599 |
| **Excluir placeholders del tono** — `isToneBearingInteraction` saca llamadas y marcadores de import del signal de tono (`lib/person-logs/toneSignal.ts`). | #600 |
| **Import de WhatsApp con tono por día** — el batch genera un log de tono por día ("Charla de WhatsApp") en vez de un marcador plano. | #601 |
| **Fuerza cuenta el contacto real** — `isContactInteraction`: llamadas contestadas + registros manuales cuentan para recencia; perdidas e imports no. | #602 |
| **Energía revivida con partnerEffect** — `energy_impact` (campo muerto) → dato real vía `/api/relational/partner-effects` en la ficha. | #603 |
| **Cadencia de la ficha usa el ritmo real** — la salud del vínculo usa `effectiveCadenceDays` (explícita→ritmo→categoría), no un default por capa. | #604 |
| **Ritmo de contacto unificado** — primitivo compartido `lib/people/contactRhythm.ts` (antes duplicado en cadence.ts y trajectory.ts). | #605 |
| **Tono legible + norte en chat + taxonomía GA4** — `humanizeTone` traduce el enum crudo en la ficha; el ancla se marca como "TU NORTE" en el contexto del chat de SIR; `person_added` con `method`, borrados 2 eventos GA4 muertos. | #606 |

**Verificación en vivo (08-jul):** Sala de Ensayo (simulación "aumento a Alex" → argumentos excelentes, integra data real + estado físico), ficha de Diana cableada, norte del Mundial como "TU NORTE", y GA4 — todos OK contra prod. Método: mirar la **salida con data real**, no solo el 200 OK.

**Pendiente menor (decidir con Aaron):** `rehearsePrompt` no incluye el norte (los argumentos del ensayo no se aterrizan en la brújula del año); `YearCompass` infiere ancla pero `NorteDrift` dice "sin norte" sin ancla explícita (contradicción latente, no se dispara hoy porque el Mundial es ancla explícita).

---

## 3. Auditoría UX/UI (6 agentes especializados)

Se auditó la ficha con 6 agentes (UX/navegación, diseño visual, accesibilidad, caza de bugs, copy) + se cruzó contra un análisis externo de superficie. **Convergencia fuerte** en el diagnóstico central: *la ficha sabe mucho pero no prioriza qué hacer ahora*.

**Hallazgos clave (detalle y file:line en la sección 5):**
- 🔴 **Bugs reales**, incluido uno de **pérdida de datos** (Información sensible pisa el DNI/pasaporte si carga con sesión vencida).
- 🟠 **No existe la "Acción del día"** — el next-action es texto pasivo, no un botón.
- 🟠 **Redundancia**: ciclo 2-3×, cumpleaños 3×, score 2×; lecturas del vínculo en 3 tabs.
- 🟡 **Voz doble**: capa nueva de cuidado (impecable) vs. herencia con olor a CRM ("Lead", "Métricas", score /100, "Briefing").
- 🔵 **CycleHorizonCard**: no es theme-aware (no sobrevive al tema claro), tipografía de 9px, fallas de contraste y tap targets.

**Idea nueva rescatada del análisis externo:** un **mensaje sugerido listo para enviar** dentro de la ficha (hoy solo existe en `/horario`).

---

## 4. Plan inmediato — 3 tandas ✅ CERRADAS (reconciliado 2026-07-13)

> **Reconciliación 2026-07-13:** las 3 tandas ya están en prod. Verificado en código:
> - **Tanda 2 (Acción):** `AccionDeHoy.tsx` (montado en `PersonDetail.tsx:507`) — botón real wa.me + "Preparar mensaje" (Haiku vía `/api/daily-actions/message`) + chip de origen. Vistazo rankea la próxima fecha por relevancia (`personSummary.ts:160-171`). Dedup score/cumple/ciclo (`PersonDetail.tsx:634-645`, "Tanda 2"). Botón "Editar" en el header (`PersonDetail.tsx:478`).
> - **Copy:** "Lead"→"Contacto" (`ambito.ts:5`), "Briefing IA"→"Ponme al día" (Asistente SIR), "Métricas relacionales"→"Datos de la persona" (`PersonDetail.tsx:950`), slug fuera del header.
> - El detalle histórico del plan queda abajo como bitácora.

- **Tanda 1 — No perder datos + quick wins** (P0): arreglar los bugs de pérdida/guardado silencioso + renombres de copy + fixes de accesibilidad de copiar-pegar.
- **Tanda 2 — Que se pueda actuar** (P1): bloque **Acción de hoy** (con botón real + mensaje sugerido) + arreglo del vistazo (fecha rankeada) + dedup de ciclo/cumple/score + botón "Editar" en el header.
- **Tanda 3 — Horizonte pulido** (P2): tokenizar (theme-aware) + legibilidad + colapsable + accesibilidad del módulo protagonista.

**Decisión pendiente de Aaron:** el score /100 en afectivos (contradice la línea ética, pero Aaron lo quiere explícito). Recomendación: conservar el número, suavizar el lenguaje ("Reciprocidad"→"Ida y vuelta"), no repetirlo 2×.

---

## 5. Backlog completo (priorizado)

### P0 — Bugs ✅ TODOS RESUELTOS (#351257a "Tanda 1 P0" + #597 sweep fuera de la ficha)
- [x] **Información sensible: guard de carga** — no guarda si la carga inicial falló (evita pisar DNI/pasaporte/notas). `InformacionSensible.tsx`
- [x] **Dinero de la persona: chequear `r.ok`** + error visible. `PersonMoneyPanel.tsx`
- [x] **Resolver pendiente** → soft-refetch en vez de `window.location.reload()`. `PersonDetail.tsx`
- [x] **Pendientes descarta episodios compartidos** → `participantIds` poblado. `PendientesConPersona.tsx`, `lib/moments`
- [x] **Evolución del vínculo: error disfrazado de "poca historia"** → estado de error + reintento. `BondEvolutionPanel.tsx`
- [x] **Deals deep-link `?deal=<id>`**. `DealsAsContactPanel.tsx`, `StakeholderDealImpact.tsx`
- [x] **Recomendaciones: el check "hecho" persiste**. `RecomendacionesSemanales.tsx`
- [x] **Correlación: narrativa IA vacía ya no revierte ni re-paga LLM**. `CorrelacionPanel.tsx`
- [x] **Guardado silencioso fuera de la ficha** (misma clase): review, ObjectivePlanPanel, BigFiveCard, ExperimentosLoopPanel. (#597)

### P1 — Acción y jerarquía ✅ (reconciliado 2026-07-13 — todo en prod)
- [x] **Bloque "Acción de hoy"**: `AccionDeHoy.tsx`, montado en `PersonDetail.tsx:507`. Botón real wa.me + sustento + chip de origen + acento por urgencia.
- [x] **Botón "Preparar mensaje"**: borrador editable vía `/api/daily-actions/message` (Haiku), copiable/enviable por WA.
- [x] **Vistazo: rankear la próxima fecha** por relevancia + ventana. `personSummary.ts:160-171` (`dateRelevanceRank`).
- [x] **Dedup**: score/cumple viven en el vistazo; CicloPanel como detalle. `PersonDetail.tsx:634-645`.
- [x] **Botón "Editar" en el header**. `PersonDetail.tsx:478`.
- [ ] **Subir/priorizar Pendientes** (hoy 7º en Hoy). _(único candidato posible aún abierto — verificar orden real antes de tocar.)_

### P1 — Copy (cerrar la contradicción de voz) ✅ (reconciliado 2026-07-13)
- [x] "Lead" → "Contacto" (display de ámbito). `lib/people/ambito.ts:5`
- [x] "Métricas relacionales" → "Datos de la persona". `PersonDetail.tsx:950`
- [x] "Briefing IA" → "Ponme al día" (movido al Asistente SIR). `PersonActions.tsx`
- [x] Sacar el slug/URL del header (dejarlo solo en edición). `PersonDetail.tsx:469`
- [x] Traducir el enum de tono → `humanizeTone` aplicado. `LastInteractionPanel.tsx:158-159`
- [ ] Renombrar "Salud del vínculo"/"Reciprocidad" (anillo /100 → "Termómetro"; "Ida y vuelta"). **DECISIÓN de Aaron pendiente** (quiere el número explícito; ver §4 nota de score). No renombrar sin su OK. `RelationalScore.tsx:64,182`
- [ ] Micro-copy: sacar "(sesión futura)", "Observaciones CSV". `PersonDetail.tsx` / `RelationalScore.tsx` _(bajo impacto)_

### P1 — Accesibilidad (patrón ya existe en el repo)
- [ ] `aria-live` en la respuesta del ask-box. `PreguntarSobrePersona.tsx:91-112`
- [ ] `aria-pressed` + indicador no-cromático en los chips del Horizonte. `CycleHorizonCard.tsx:121-133`
- [ ] `id`/`htmlFor` en los 4 selects del form. `PersonDetail.tsx:611/622/633/644`
- [ ] Patrón ARIA de tabs (`role="tablist"/"tab"/aria-selected`) + estado activo no solo por color.
- [ ] Subir contrastes (5 valores <AA) y piso de fuente a 11px en el Horizonte.
- [ ] Tap targets ≥24px (chips 19px hoy).

### P2 — Horizonte y sistema visual
- [ ] **Tokenizar `CycleHorizonCard`** (mover ~20 hex a variables de `globals.css` en ambos temas) → theme-aware.
- [ ] **Colapsar el Horizonte** por defecto; síntesis primero ("mejor momento / evitar hoy"), detalle al expandir.
- [ ] **Badges de origen del dato** (Computado/IA/Manual/Extraído) en cards clave.
- [ ] Unificar el botón de IA al token `brand` (hoy Briefing usa `accent`). `PersonActions.tsx:65`
- [ ] Burbuja de chat `#14b8a6` → token `ok`. `LastInteractionPanel.tsx:196`

### P2 — Estructura de tabs
- [ ] Consolidar cada tab en un bloque contiguo (hoy fragmentado en 2-3 bloques JSX).
- [ ] Evaluar un tab **"Cuidado"** propio para afectivos (el flag `showCuidado` ya existe).

### P3 — Fast-follows del rediseño
- [ ] Rail con botones `＋Capturar / Tono / Voz`.
- [ ] Mobile QA (pins del Horizonte se pisan en angosto; reflow a 200%).

### Backlog previo (fuera de la ficha)
- [ ] **Claude → SIR ingest**: contar por chat y que SIR se llene solo (Personal API Tokens + `/api/relato/ingest` smart). Solapa con extracción integrada de seed batch.
- [ ] **Verificar en vivo** las ingestas del entorno ya mergeadas: SIR Reader (Teams→SIR), correo M365 (falta Azure + env), grabador de llamadas (falta probar micro).
- [ ] Fugas de calidad conocidas: ver `docs/BACKLOG.md` y la auditoría de data muerta.

---

## 6. Estado técnico

- **En producción**: todo lo de la sección 2. Build + tsc + lint + tests en verde.
- **Migraciones**: se aplican solas al mergear a main (runner activo desde 2026-06-08). El trabajo de ficha no trajo migraciones nuevas.
- **Otro agente** trabaja el mismo repo desde otra terminal → siempre `git fetch` + `rebase origin/main` antes de push.
