# 09 — ROADMAP
# SIR V2 — Hoja de Ruta

---

## Visión del Roadmap

El roadmap de SIR V2 sigue la filosofía: fundación sólida antes que features.

Cada fase construye sobre la anterior.
No hay saltos. No hay atajos.

---

## FASE 1 — Fundación ✅
**Estado: COMPLETADA**

- [x] Crear repositorio sir-v2-life-os
- [x] Configurar Next.js + TypeScript + Tailwind
- [x] Crear estructura de carpetas
- [x] Crear documentación base (docs/)
- [x] Crear engines base con types
- [x] Crear fixtures iniciales
- [x] UI mínima Mission Control
- [x] Deploy a Vercel

---

## FASE 2 — Engines Core
**Estado: PENDIENTE**

Desarrollar la lógica de cada engine:

- [ ] Self Engine completo
  - [ ] updateSelfProfile()
  - [ ] analyzeSelfPatterns()
  - [ ] generateSelfInsights()
  
- [ ] Relationship Engine completo
  - [ ] analyzeRelationshipContext()
  - [ ] detectRelationshipSignals()
  - [ ] generateRelationshipRecommendations()

- [ ] Peace Engine completo
  - [ ] calculatePeaceScore() con ponderación real
  - [ ] detectPeaceThreats()
  - [ ] generatePeaceStrategy()

- [ ] Signal Engine completo
  - [ ] extractSignalMeaning()
  - [ ] rankSignalsByPriority()
  - [ ] combineSignalsForPattern()

- [ ] Recommendation Engine completo
  - [ ] generateRecommendations()
  - [ ] rankByPeaceImpact()
  - [ ] filterByTiming()

---

## FASE 3 — Data Model Real
**Estado: PENDIENTE**

- [ ] Conectar engines con Zustand stores
- [ ] Implementar localStorage persistence completo
- [ ] Validación de datos con Zod
- [ ] Migración de fixtures a formato real
- [ ] Sistema de backup local

---

## FASE 4 — Fixtures y Testing
**Estado: PENDIENTE**

- [ ] Fixtures completos para todos los engines
- [ ] Escenarios de prueba reales
- [ ] Testing de lógica de engines
- [ ] Validar conexiones entre sistemas

---

## FASE 5 — UI Completa
**Estado: PENDIENTE**

- [ ] Dashboard Mission Control completo
- [ ] Vista de Relaciones
- [ ] Vista de Objetivos
- [ ] Vista de Finanzas
- [ ] Vista de Biología
- [ ] Recovery Mode funcional
- [ ] Navegación entre vistas
- [ ] Responsive (mobile-ready)

---

## FASE 6 — AI Brain
**Estado: PENDIENTE**

- [ ] Integración con OpenAI / Claude / Groq vía OpenRouter
- [ ] System prompts completos
- [ ] Context building automático
- [ ] Conversación con SIR
- [ ] Recomendaciones generadas por AI
- [ ] Análisis de patrones por AI

---

## FASE 7 — Integraciones
**Estado: PENDIENTE**

- [ ] Supabase database
- [ ] Auth con Supabase
- [ ] Calendar integration (Google Calendar)
- [ ] Financial data import
- [ ] LinkedIn signal detection
- [ ] Instagram signal detection
- [ ] Health data (Apple Health / Google Fit)

---

## FASE 8 — Memoria Vectorial
**Estado: FUTURO**

- [ ] pgvector en Supabase
- [ ] Embeddings de memorias
- [ ] Búsqueda semántica en memorias
- [ ] Memoria long-term persistente
- [ ] Knowledge Graph visual

---

## FASE 9 — Self Model Avanzado
**Estado: FUTURO**

- [ ] Tracking automático de evolución personal
- [ ] Detección de shifts de identidad
- [ ] Predicción de ciclos emocionales
- [ ] Correlación biología-rendimiento
- [ ] Modelo predictivo de paz mental

---

## Principios del Roadmap

- **Deployable en cada fase** — siempre funciona en Vercel
- **No over-engineering** — solo lo necesario en cada momento
- **Datos reales desde fase 3** — no solo fixtures
- **AI enriquece, no reemplaza** — el sistema funciona sin AI
- **Paz como métrica de éxito** — si no mejora mi paz, no es prioritario
