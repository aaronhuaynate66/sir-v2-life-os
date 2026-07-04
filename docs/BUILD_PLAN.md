# SIR V2 — Plan de construcción (lista viva)

> **Qué es:** la lista maestra de lo que falta construir, priorizada. Se actualiza
> con CADA entregable (Claude la mantiene). Fuente de "qué sigue".
> **Última actualización:** 2026-07-03 (A1–A8 ✅ · U1/U2 ✅ · C1/C2/C3 ✅ · V2 ✅ · B1-simple ✅ · base científica cerrada). **Todo lo autónomamente construible está en prod; lo que queda necesita tu input.**
>
> **Encuadre:** el *cuerpo* de SIR está en prod (percepción, memoria, cerebro-grafo
> F1-F4, contexto, señales, salud, finanzas, relaciones, objetivos). Lo que falta es
> la **capa cognitiva que lo unifica** (la base científica de `docs/01_COGNITIVE_ARCHITECTURE.md`
> = etapa E6 "AI-Native Human OS", la visión-norte) + la extensión del Reader + pulido.

**Leyenda:** ✅ hecho · 🔨 en curso · ⬜ pendiente · | Esfuerzo **S/M/L** · Prioridad **P0/P1/P2**

---

## A. Capa cognitiva — "la presentación" (E6)

> La infra está madura; falta la cognición que la orquesta. Ver auditoría en el
> historial de sesión (07-03).

| # | Ítem | Estado | Esf | Pri | Qué falta / primer paso |
|---|---|---|---|---|---|
| A1 | **Multi-Persona Reasoner** (las 12 lentes) | ✅ | L | P1 | HECHO (07-03): `lib/reasoner` (catálogo de 12 lentes + `selectPersonas` por dominio + `buildReasonerPrompt`, 7 tests). `POST /api/reason` (Sonnet, 1 llamada estructurada, on-demand) razona el foco por lente + síntesis. Cableado: botón **"Pensar con SIR"** en la card Foco ahora. Reemplaza el `ai-brain` huérfano. |
| A2 | **Orquestador del pipeline** | ✅ | M | P1 | HECHO (07-03): `engines/orchestrator` puro `runCognitivePipeline` compone paz+amenazas+recomendaciones en UN foco ordenado por severidad + jerarquía de dominio (A3). Cableado (NO huérfano): card **"Foco ahora"** en `/panel`. 5 tests. Deja la costura para el reasoner (A1). |
| A3 | **Jerarquía de prioridades (6 niveles)** | ✅ | S | P0 | HECHO (07-03): `engines/priority` puro (PRIORITY_LEVEL, compareDomains, resolveTradeoff, outranks, rankByPriority) + cableado como tiebreak en `rankRecommendations` (empate de prioridad → gana el dominio más alto). 10 tests. Cimiento de A2 y A4. |
| A4 | **Evaluador de decisión (7 dimensiones)** | ✅ | M | P1 | HECHO (07-03): `engines/decision` puro (7 dims ponderadas por la jerarquía A3 + **gate de reversibilidad**, veredicto go/caution/hold, 7 tests). `POST /api/decision` (Sonnet puntúa) + página **`/decidir`** (en el Nav). |
| A5 | **Motor predictivo general** | ✅ | L | P2 | HECHO (07-03): `engines/predictive` `projectSeries` (OLS + confianza + gate 'insufficient', 7 tests). Cableado: sección **"Proyección · próximos 7 días"** en /salud (energía/ánimo/sueño/FC). Generaliza el forecast de fin de mes (#498). |
| A6 | **Peace trend real** | ✅ | S | P0 | HECHO (07-03): `computePeaceTrend` puro (deadband, ventana 6) + param `history` en `calculatePeaceScore`, cableado en `/panel` desde el histórico de snapshots. El ícono ↗/→/↘ ya refleja la tendencia real. |
| A7 | **Modelo del self dinámico** | ✅ | M | P2 | HECHO (07-03): `engines/self-model` `deriveDynamicSelf` compone las proyecciones (A5) + trend de paz (A6) en 'cómo venís' (momentum + mejora/atención). Cableado: bloque **"Tu momento"** en /salud. 5 tests. |
| A8 | **Capa 9 — Aprendizaje / feedback loop** ⭐ | ✅ | L | P1 | HECHO (07-03): `engines/learning` puro (7 tests) + `useFeedbackStore` + card **"Qué te funciona"** en /salud. **A8b (07-03):** `adjustByLearning` cableado → las recomendaciones se reordenan según lo que te funciona (tiebreak de confianza en `rankRecommendations`). Bucle CERRADO de punta a punta. |
| A4b | **Dimensión "alineación con valores"** | ✅ | S | P2 | HECHO (07-03): 8ª dimensión en el evaluador (peso alto, ancla de identidad). LLM la puntúa; se ve en /decidir. |

## B. SIR Reader (leer el navegador logueado → SIR)

| # | Ítem | Estado | Esf | Pri | Nota |
|---|---|---|---|---|---|
| B0 | Spec + núcleo + endpoint `/api/reader/ingest` | ✅ | — | — | PR #505 (mig 0119). Falta setear `READER_INGEST_TOKEN` + mergear. |
| B1-simple | **Pegar conversación (Teams sin extensión)** ✅ | ✅ | S | P1 | HECHO (07-03, en #505): `lib/reader/parsePaste` (best-effort autor+hora, fallback, 6 tests) + `POST /api/reader/paste` (session, reusa `ingestReaderBatch`) + página **`/captura/pegar`**. Copiás el hilo → SIR lo lee, idempotente. Cero extensión/ToS. |
| B1 | Extensión Chrome MV3 (Teams) | ⬜ | M | P2 | DESPRIORIZADO — el paste (B1-simple) cubre el caso. La extensión daría captura continua; queda para si hace falta. |
| B2 | Reader → redes sociales (opt-in) | ⬜ | M | P2 | LinkedIn/IG/FB: riesgo de cuenta (ToS + detección). Pasivo, opt-in con aviso. |
| B3 | Teams por Microsoft Graph OAuth | ⬜ | L | P2 | Camino oficial sin scraping; depende de consentimiento M365. |

## C. Pendientes de producto

| # | Ítem | Estado | Esf | Pri | Nota |
|---|---|---|---|---|---|
| C1 | Extracción integrada de seed batch (Anthropic) | ✅ | M | P2 | HECHO (07-03): en /captura/batch, card "Desde texto (extraer con SIR)" → pegás relato/PDF/perfil, `POST /api/seed/extract` (Sonnet) arma el JSON con el schema + enums vivos de plan.ts, cae en el textarea para revisar + dry-run + aplicar (flujo de confirmación intacto). Capa pura `lib/seed/extractPrompt` (10 tests). Ya no hace falta ir a Claude.ai. |
| C2 | Claude → SIR ingest (tokens personales + relato smart) | ✅ | M | P1 | HECHO (07-03): ambas fases ya existían (tokens en /yo + ingest smart con tools). Faltaba cablearlas: /api/relato/ingest ahora acepta Bearer con token personal (service-role scoped) → contás un relato desde afuera (Claude/atajo/script) con apply:true y SIR se llena solo. Ejemplo curl en el panel de tokens de /yo. |
| C3 | Fase 3d — Memoria que aprende (RAG cross-session) | ✅ | L | P2 | HECHO (07-03): `/api/sir/ask` ahora PERSISTE cada intercambio (pregunta+respuesta+embedding) en `sir_conversations` (mig 0121: pgvector + HNSW + RPC `match_sir_conversations`, espejo de match_memories) y RECUPERA los pasados por similitud → continuidad cross-session ("la semana pasada me dijiste…"). Reusa el embedding de la pregunta (0 llamadas extra). Capa pura `lib/sir/recall` (persist gate + antigüedad legible + bloque de contexto, 12 tests). Todo fail-open. |
| C5 | **Foto → relato (cámara en "Contale a SIR")** | ✅ | S | P1 | HECHO (07-03, pedido de Aaron): botón de cámara en /relato/ingest → en el cel abre la cámara (`capture=environment`), SIR transcribe la foto con Visión (`/api/relato/transcribe`, no guarda la imagen) y pega el texto al input para revisar y enviar. Capa pura `lib/relato/transcribePrompt` (6 tests). Caso que lo motivó: le apareció el cumple de los Heilbrunn y no tenía cómo fotografiarlo. Drop de imagen también enruta acá. |
| C6 | **Recordatorios sin costo (Hobby)** | ✅ | S | P1 | HECHO (07-03): Hobby solo deja cron 1×/día. Camino gratis → `DueRemindersWatcher` en AppShell chequea vencidos con la app abierta (al montar + cada 2min + al re-enfocar) vía `POST /api/reminders/fire-due` (marca notified, no re-dispara) → toast + notificación del browser. El cron diario (6am) queda de respaldo para app cerrada. Capa pura `lib/reminders/due` (8 tests). Sin Pro. |
| C4 | Pulido mobile pantalla-por-pantalla (#44) | ⬜ | M | P2 | Necesita capturas reales del cel. |

## U. Pulido UI (auditoría con agentes, 03-07 — ver docs/UI_AUDIT.md)

| # | Ítem | Estado | Esf | Pri | Nota |
|---|---|---|---|---|---|
| U2 | **A11y: labels + skip link + contraste + headings** | ✅ | M | P1 | HECHO (07-03): skip link + `id=main`, labels en flujos núcleo, focus-visible del botón "Resolver", alt del gráfico de medicación. **U2-fin:** `SectionTitle` ahora renderiza `<h2>` (fix SISTÉMICO — todas las secciones navegables por lector de pantalla) + contraste de los títulos del Nav (`/50`→sólido). Pendiente menor: barrido fino de `/60`/`/70` en info-text del /panel. |
| U1 | **UX: podar el /panel + familia "Pensar"** | ✅ | M | P1 | HECHO (07-03): botón "Verlo por las 12 lentes"; de-dup del panel + "Foco del día"→"Acción del día". **U1-fin (07-03):** PatronesPanel partido en dos cards — **"Lo que se observa"** (cruces con n) vs **"Hacia dónde vas"** (momento + proyección + madurez); "Semana en foco"→**"Objetivo inminente"** (rompe la colisión con los otros 3 "foco"). |

## V. Verificación / operativo (no es build)

| # | Ítem | Estado | Nota |
|---|---|---|---|
| V1 | Verificar en vivo la capa cognitiva | ⬜ | Manejar /panel "Foco ahora" + "Pensar con SIR", /decidir, /salud (Proyección/Tu momento/Qué te funciona), /captura/pegar — con sesión + data real. La lógica está testeada; falta el ojo en vivo. |
| V2 | Cache diaria del reasoner/decidir | ✅ S | HECHO (07-03): tabla genérica `ai_daily_cache` (mig 0120, fail-open) + helper puro `lib/ai-cache/dailyCache` (hash FNV determinístico, 10 tests). `/api/reason` cachea la lectura de 12 lentes por día (chequea ANTES del rate-limit); `/api/decision` por (día + hash del texto). `force:true` regenera. Sin ANTHROPIC/tabla → on-demand igual. |
| V3 | Housekeeping | ⬜ | `scripts/seed-people.mjs` + `.gitignore` quedaron modificados local (tooling, sin PR). |

## D. PRs — TODOS MERGEADOS ✅ (03-07)

#497 #498 #499 #501 #504 #505 #506 → todo en `main` y en prod. Nada abierto.

---

## Lo que queda — ORDEN DE ATAQUE (03-07)

Capa cognitiva (A1–A8) + Reader-pegar + toda la sesión: **en prod**. Queda pulido y
pendientes, priorizado:

**🔥 Tanda 1 — alto valor, buildable ya**
1. ~~**C2 — Claude → SIR ingest**~~ ✅ **HECHO (07-03)** — el ingest acepta token personal; contale desde afuera y se llena solo.
2. **A8b — cablear `adjustByLearning`** (S) — que las recomendaciones se re-ordenen según lo que YA te funciona (el loop ya registra; falta que ajuste el ranking cuando haya datos).
3. **U2-fin — a11y fino** (M) — barrido de contraste `/70`/`/50` en /panel + componente `SectionHeading` semántico (rótulos `<div>`→`<h2>`).

**⚙️ Tanda 2 — mejora**
4. ~~**U1-fin — /salud**~~ ✅ **HECHO (07-03)** — split Observar/Anticipar + rename "Objetivo inminente".
5. ~~**C1 — seed batch: extracción integrada**~~ ✅ **HECHO (07-03)** — /api/seed/extract + card "Desde texto" en /captura/batch.
6. ~~**V2 — cache del reasoner/decidir**~~ ✅ **HECHO (07-03)** — ai_daily_cache (0120) + helper puro; reason por día, decision por día+hash.

**🧊 Tanda 3 — grande / bloqueado / necesita input tuyo**
7. ~~**C3 — Fase 3d RAG cross-session**~~ ✅ **HECHO (07-03)** — sir_conversations (0121) + recall en /api/sir/ask.
8. **C4 — pulido mobile #44** (M) — bloqueado: necesita capturas reales de tu cel.
9. **B1/B2/B3 — Reader avanzado** — extensión MV3 / redes sociales (riesgo ToS) / Teams por Graph OAuth (necesita consentimiento M365).
10. **V1 — verificación en vivo** — necesita tu sesión + data.

---

## Base científica ampliada (2026-07-03)

La base científica dejó de "describir el sistema de ayer": `01` ahora refleja el
bucle CERRADO (Capa 9 aprendizaje, valores, memoria cross-session) + principios
transversales + fundamento teórico por motor. Y se agrandó en 6 docs nuevos, cada
uno con una sección **"Qué construir (por partes)"** que es la cola de módulos
futuros (motor puro + consumidor, honesto con la confianza):

- `10_COGNITIVE_PERSONAS` — las 12 lentes en profundidad.
- `11_CHRONOBIOLOGY` — cronotipo, curva intradía, jet-lag social, deuda de sueño real.
- `12_BEHAVIOR_CHANGE` — señal→prompt del hábito, fricción, drift temprano.
- `13_EMOTION_REGULATION` — ventana de tolerancia, estrategia correcta, granularidad.
- `14_DECISION_SCIENCE` — detector de sesgos, premortem, calibrador de reversibilidad.
- `15_RELATIONAL_INTELLIGENCE` *(el norte)* — capas de Dunbar, reciprocidad, salud del vínculo.
- `16_INFLUENCE_SOCIAL_INTELLIGENCE` — posicionarte con ética (Milgram/Zimbardo/Cialdini, agenda-setting), inteligencia social + **defensa** contra ingeniería social. Línea dura: influencia genuina y defensa, NO manipulación.
- `17_MENSTRUAL_CYCLE` — ciclo menstrual: fases, ventana PMS/fértil, trazabilidad por fecha, predicción. Línea ética dura: **cuidar, nunca descalificar** ("estás hormonal" = prohibido). M1 (perfil de fase + ventana PMS/fértil) HECHO.

**Módulos construidos (07-03):** **17·M1** (ciclo: perfil de fase enriquecido + ventana PMS/fértil en `lib/ciclo/phase` + card de cuidado en CicloPanel), **15·8** ("qué le importa" — `lib/people/whatMatters` puro extrae temas recurrentes de las memorias + tags, card en la ficha de persona; contacto real, no genérico), **16·M2** (mapa de influencia informal, `engines/influence-map` puro — círculo de la decisión por org + hubs por grado + puentes + conectores al objetivo; card en `/ensayo`, cierra el trío del aumento sobre la Sala de ensayo), **14·M1** (detector de sesgos, `engines/bias` puro heurístico 7 sesgos + preguntas socráticas, en `/decidir` Y `/ensayo` — no-bloqueante, robustece la Sala de ensayo), **16·M4** (Sala de ensayo — caminos al objetivo, `lib/influence/rehearsePrompt` + `/api/influence/rehearse` + `/ensayo`; genérico p/ cualquier persona, registro afectivo vs profesional, honesto "ensayás no predecís"), 16·M3 (detector de manipulación, `/verificar`), **15·1** (mapa de capas de Dunbar + alertas de sobre/sub-inversión — `engines/dunbar` + card en `/relaciones`), **16·M1** ("cómo plantearle X" — `lib/influence/framePrompt` con guardrail ético + `/api/influence/frame` Sonnet + página `/plantear`; dupla para el aumento HNG). 

**16·M4 reformulado a CAPSTONE (07-03): "Sala de ensayo — caminos al objetivo".** Fija una meta (el aumento) → SIR juega caminos/objeciones como HIPÓTESIS (ensayás, no predecís). FUSIONA 15·8 + las 12 lentes + 16·M1 + 14·M1 + 16·M2; absorbe la vieja "prep de conversación". Surgió de evaluar MiroFish (`666ghj/MiroFish`, motor de enjambre): NO se integra (predice colectivos no individuos, carísimo, AGPL viral) — pero la CAPACIDAD (ensayar escenarios con objetivos alineados) es legítima y se hace nativa con un agente aterrizado, no mil genéricos. Ética: objetivos alineados = preparación, no manipulación; caveat = ensayo prepara, no predice.

Próximos módulos construibles salen de esos "Qué construir": arrancar por los de
confianza alta / sin deuda de datos (ej. detector de sesgos en /decidir, cronotipo
desde horarios ya capturados, capas de Dunbar + alertas de sobre/sub-inversión).
