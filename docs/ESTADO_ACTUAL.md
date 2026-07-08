# SIR V2 — Estado actual y pendientes

> Documento vivo. Última actualización: **2026-07-07**.
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

## 4. Plan inmediato — 3 tandas

Cada tanda va a rama + preview para validar UI antes de mergear.

- **Tanda 1 — No perder datos + quick wins** (P0): arreglar los bugs de pérdida/guardado silencioso + renombres de copy + fixes de accesibilidad de copiar-pegar.
- **Tanda 2 — Que se pueda actuar** (P1): bloque **Acción de hoy** (con botón real + mensaje sugerido) + arreglo del vistazo (fecha rankeada) + dedup de ciclo/cumple/score + botón "Editar" en el header.
- **Tanda 3 — Horizonte pulido** (P2): tokenizar (theme-aware) + legibilidad + colapsable + accesibilidad del módulo protagonista.

**Decisión pendiente de Aaron:** el score /100 en afectivos (contradice la línea ética, pero Aaron lo quiere explícito). Recomendación: conservar el número, suavizar el lenguaje ("Reciprocidad"→"Ida y vuelta"), no repetirlo 2×.

---

## 5. Backlog completo (priorizado)

### P0 — Bugs (arreglar ya)
- [ ] **Información sensible: guard de carga** — no permitir guardar si la carga inicial falló (evita pisar DNI/pasaporte/notas). `InformacionSensible.tsx:51-68/165-184`
- [ ] **Dinero de la persona: chequear `r.ok`** + error visible; no cerrar el panel si falló. `PersonMoneyPanel.tsx:36-43`
- [ ] **Resolver pendiente hace `window.location.reload()`** → cambiar a soft-refetch (pierde scroll/tab/paneles IA). `PersonDetail.tsx:527`
- [ ] **Pendientes descarta episodios compartidos** (poblar `participantIds` en el mapper + aceptar en el filtro). `PendientesConPersona.tsx:66`, `lib/moments`
- [ ] **Evolución del vínculo: error disfrazado de "poca historia"** → estado de error separado + reintento. `BondEvolutionPanel.tsx:26-33`
- [ ] **Deals linkean a `/oportunidades` genérico** → deep-link `?deal=<id>`. `DealsAsContactPanel.tsx:69`, `StakeholderDealImpact.tsx:42`
- [ ] **Recomendaciones: el check "hecho" no persiste** (PATCH fire-and-forget). `RecomendacionesSemanales.tsx:68-78`
- [ ] **Correlación: narrativa IA vacía revierte el botón y re-paga LLM**. `CorrelacionPanel.tsx:91-92,138`

### P1 — Acción y jerarquía
- [ ] **Bloque "Acción de hoy"**: card propia entre vistazo y tabs, con **botón real** (Escribile ahora → wa.me) + sustento visible + micro-chip de origen.
- [ ] **Botón "Preparar mensaje"**: redacta un borrador editable (reusar `/api/daily-actions/message`, Haiku). Idea del análisis externo.
- [ ] **Vistazo: rankear la próxima fecha** por relevancia/parentesco (evento de pareja > fecha de rubro) + bajar ventana a ~30 días. `lib/people/personSummary.ts:139-148`
- [ ] **Dedup**: un solo módulo de ciclo en Hoy (CicloPanel → colapsable), cumpleaños 1×, score 1×.
- [ ] **Botón "Editar" en el header** + mover Identidad/Métricas fuera del tab "Registro".
- [ ] **Subir/priorizar Pendientes** (hoy 7º en Hoy).

### P1 — Copy (cerrar la contradicción de voz)
- [ ] "Lead" → "Contacto" (display de ámbito). `lib/people/ambito.ts:5`
- [ ] "Métricas relacionales" → "Datos de la persona". `PersonDetail.tsx:802`
- [ ] "Briefing IA" → "Ponme al día" / "Qué debo saber". `PersonActions.tsx:68`
- [ ] Sacar el slug/URL del header (dejarlo solo en edición). `PersonDetail.tsx:434-436`
- [ ] Traducir el enum de tono (`affectionate_routine+supportive` → legible). `LastInteractionPanel`
- [ ] Renombrar una de las dos "Salud del vínculo" (el anillo /100 → "Termómetro del vínculo"). `RelationalScore.tsx:64`
- [ ] Suavizar "Reciprocidad" → "Ida y vuelta"; sacar "(sesión futura)", "Observaciones CSV".

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
