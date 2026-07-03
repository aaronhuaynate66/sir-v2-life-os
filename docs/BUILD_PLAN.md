# SIR V2 — Plan de construcción (lista viva)

> **Qué es:** la lista maestra de lo que falta construir, priorizada. Se actualiza
> con CADA entregable (Claude la mantiene). Fuente de "qué sigue".
> **Última actualización:** 2026-07-03 (CAPA COGNITIVA A1–A7 ✅ COMPLETA · sigue B1 Teams).
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
| A8 | **Capa 9 — Aprendizaje / feedback loop** ⭐ | ⬜ | L | P1 | NUEVO (mayor faltante de la base científica): cerrar el bucle. Tras una rec/decisión, registrar el OUTCOME (¿subió la paz/energía?) y ajustar confianza por tipo de consejo/lente. Generaliza el Hebbian del cerebro a recs/decisiones. Es "la parte analítica que cierra el loop". |
| A4b | **Dimensión "alineación con valores"** | ⬜ | S | P2 | Extender el evaluador (A4) con una 8ª dimensión: alineación con tus valores/identidad (`identity_profile`), no solo con objetivos. |

## B. SIR Reader (leer el navegador logueado → SIR)

| # | Ítem | Estado | Esf | Pri | Nota |
|---|---|---|---|---|---|
| B0 | Spec + núcleo + endpoint `/api/reader/ingest` | ✅ | — | — | PR #505 (mig 0119). Falta setear `READER_INGEST_TOKEN` + mergear. |
| B1 | **Extensión Chrome MV3 (Teams)** | ⬜ | M | P1 | Cliente pasivo: content script sobre teams.microsoft.com + cola IndexedDB + envío por deltas. Selectores del DOM = la parte frágil (dev mode + inspección en vivo). |
| B2 | Reader → redes sociales (opt-in) | ⬜ | M | P2 | LinkedIn/IG/FB: riesgo de cuenta (ToS + detección). Pasivo, opt-in con aviso. |
| B3 | Teams por Microsoft Graph OAuth | ⬜ | L | P2 | Camino oficial sin scraping; depende de consentimiento M365. |

## C. Pendientes de producto

| # | Ítem | Estado | Esf | Pri | Nota |
|---|---|---|---|---|---|
| C1 | Extracción integrada de seed batch (Anthropic) | ⬜ | M | P2 | Pegar PDF/screenshot → SIR arma el JSON. Solapa con Claude→SIR ingest. |
| C2 | Claude → SIR ingest (tokens personales + relato smart) | ⬜ | M | P2 | Contarle por chat y que SIR se llene solo. |
| C3 | Fase 3d — Memoria que aprende (RAG cross-session) | ⬜ | L | P2 | Contexto profundo automático por interacción. |
| C4 | Pulido mobile pantalla-por-pantalla (#44) | ⬜ | M | P2 | Necesita capturas reales del cel. |

## D. PRs abiertos por mergear (no es build, es liberar valor)

- #497 (seed enums) · #498 (forecast fin de mes) · #499 (cumple sin año) · #501 (extractor de meds foto/link) · #504 (Teams/Slack detector) · #505 (SIR Reader Fase 1).

---

## Orden propuesto (sprint)

**Arrancamos por los P0 rápidos** (quick wins que además son cimiento de lo grande),
luego lo estructural:

1. ~~**A6 — Peace trend real** (S)~~ ✅ **hecho (07-03)**
2. ~~**A3 — Jerarquía de prioridades** (S)~~ ✅ **hecho (07-03)**
3. ~~**A2 — Orquestador del pipeline** (M)~~ ✅ **hecho (07-03)** — "Foco ahora" en /panel
4. ~~**A1 — Multi-Persona Reasoner** (L)~~ ✅ **hecho (07-03)** — "Pensar con SIR"
5. ~~**A4 — Evaluador de decisión 7-dim** (M)~~ ✅ **hecho (07-03)** — /decidir
6. ~~**A5 — Motor predictivo** (L)~~ ✅ **hecho** — "Proyección 7 días" en /salud
7. ~~**A7 — Self dinámico** (M)~~ ✅ **hecho** — "Tu momento" en /salud
8. **B1 — Extensión Teams** (M) ← *siguiente* — 📌 cliente MV3 (se carga en Chrome; no testeable-en-repo)

> **Capa cognitiva (A1–A7): COMPLETA.** Quedan B (Reader/Teams) y C (pendientes P2).

> Se puede reordenar. Si querés ver el reasoner (A1) antes que los quick wins, se hace.
