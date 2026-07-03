# SIR V2 — Plan de construcción (lista viva)

> **Qué es:** la lista maestra de lo que falta construir, priorizada. Se actualiza
> con CADA entregable (Claude la mantiene). Fuente de "qué sigue".
> **Última actualización:** 2026-07-03 (A6 ✅ Peace trend real).
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
| A1 | **Multi-Persona Reasoner** (las 12 lentes) | ⬜ | L | P1 | `src/engines/ai-brain/index.ts` es código HUÉRFANO (type + `selectPersonasForContext`, sin uso, sin test). Construir: prompt-lente por persona → fragmento por lente vía LLM → síntesis. Cablearlo a un endpoint. |
| A2 | **Orquestador del pipeline de 8 capas** | ⬜ | M | P1 | Los 8 engines existen aislados; el `RichContextSnapshot` (`context/builder.ts`) muere en un debug panel. Función que encadene Signal→Context→Memory→Self→Timing→Reasoner→Recommendation→Peace. |
| A3 | **Jerarquía de prioridades (6 niveles)** | ⬜ | S | P0 | Codificar Paz>Salud>Finanzas>Personal>Relacional>Optimización como estructura que gobierne trade-offs. Hoy solo hay pesos sueltos en `peace` y prioridades planas en `recommendation`. |
| A4 | **Evaluador de decisión (7 dimensiones)** | ⬜ | M | P1 | Scorer único: alineación, relaciones, costo bio, financiero, paz, timing, **reversibilidad** (esta última no existe en el código). Hay piezas: `alignment`, `stakeholderImpact`, `conflictFriction`. |
| A5 | **Motor predictivo general** | ⬜ | L | P2 | "Sistema anticipatorio": proyectar estados futuros (deriva de paz/energía a N días). Hoy solo anticipación puntual (ciclos, cumpleaños). El forecast de fin de mes (#498) es el primer ladrillo. |
| A6 | **Peace trend real** | ✅ | S | P0 | HECHO (07-03): `computePeaceTrend` puro (deadband, ventana 6) + param `history` en `calculatePeaceScore`, cableado en `/panel` desde el histórico de snapshots. El ícono ↗/→/↘ ya refleja la tendencia real. |
| A7 | **Modelo del self dinámico** | ⬜ | M | P2 | Hoy el modelo del usuario es determinístico/estático. Que evolucione por inferencia sobre la serie longitudinal. |

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
2. **A3 — Jerarquía de prioridades** (S) ← *siguiente*
3. **A2 — Orquestador del pipeline** (M) — hace que el snapshot por fin alimente algo
4. **A1 — Multi-Persona Reasoner** (L) — el corazón de la presentación
5. **A4 — Evaluador de decisión 7-dim** (M)
6. **B1 — Extensión Teams** (M)
7. **A5 — Motor predictivo** (L) · **A7 — Self dinámico** (M) · resto de C.

> Se puede reordenar. Si querés ver el reasoner (A1) antes que los quick wins, se hace.
