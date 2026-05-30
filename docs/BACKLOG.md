# SIR V2 — Backlog Canónico

> **Última actualización:** 30/05/2026 (sweep post-Sesión 3 + status sync BUG-002/003)
> **Source of truth:** este archivo, NO `MASTER_PLAN.md` (regenerado por bot).
> **Cómo usar:** entrá acá cuando quieras decidir qué priorizar en la próxima sesión.

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

---

## 🆕 BACKLOG NUEVO

### Sesión 3 — Detail page UI base [P1]
Componentes 1-4 del item ⭐ ("Portar detail page completo de SIR V1 → V2"):
- RelationalScore (numero grande + 3 progress bars)
- BirthdayCountdown
- LastInteractionPanel
- ruta `/relaciones/[slug]` consumiendo `observations` + `person_synthesis`.
- **DEPENDS ON:** Sesión 2.7 (vinculación persona↔observación confiable + entry point UX) — ya entregado.

### Sesión 3 — Detail page UI base [P1]
Componentes 1-4 del item ⭐ ("Portar detail page completo de SIR V1 → V2"):
- RelationalScore (numero grande + 3 progress bars)
- BirthdayCountdown
- LastInteractionPanel
- ruta `/relaciones/[slug]` consumiendo `observations` + `person_synthesis`.
- **DEPENDS ON:** Sesión 2.6 (datos confiables, no alucinados) y Sesión 2.7 (entry point UX).

### Iteraciones futuras LinkedIn schema [P2]
Agregar campos al schema B.4:
- `certifications[]`
- `volunteerWork[]`
- `languages[]`
- `organizations[]`
- followers count
- `isVerified`
- `hasBannerImage` (ya está)
- `isOpenToWork` (ya está)

### Nuevo capture_type whatsapp_web [P2]
Detector debe distinguir `whatsapp_chat` móvil (bubbles columna) vs `whatsapp_web` (3 paneles: lista chats + conversación + info contacto).
Prompt nuevo **B.6** + agregar al CHECK constraint de `observations.capture_type` (migration 0012).

---

## 🎯 EN CURSO

- **Fase 3b — Búsqueda Semántica**: ACTIVA, sin issues asignados.
  - Próximo paso: planning estratégico + crear 3-5 issues operativos.

---

## 🔥 PRÓXIMAS SESIONES (orden definido)

### 0. Portar detail page completo de SIR V1 → V2 (PRIORIDAD ALTA) ⭐

**Por qué:** El detail page actual de `/relaciones/[slug]` en V2 solo muestra 4 campos básicos (relación, categoría, importancia, confianza). SIR V1 (sir.marlabinc.com) tiene una vista MUCHO más rica que es la verdadera capa de valor del sistema. Sin esto, la captura WhatsApp y la red de relaciones queda sin su verdadero contexto consumible.

**Referencia visual:** Screenshot del 29/05/2026 en `sir.marlabinc.com` mostrando perfil de Diana Diaz con todos los componentes.

**Features pendientes a portar (17):**

1. **Score relacional global**: número grande (49) + 3 progress bars (Fuerza, Reciprocidad, Confianza) + "Último contacto: 23 may 2026".
2. **Visualización del ciclo menstrual**: donut con fase actual (FOLICULAR), día del ciclo (7), próximo período (~22 días), recomendación contextual ("Buen momento para planes juntos").
3. **Cumpleaños** con countdown ("Cumpleaños en 16 días").
4. **Última interacción** con countdown ("Última interacción: hace 5 días").
5. **Registro rápido**: 4 botones emoji (Ánimo, Energía, Sueño, Dolor).
6. **Vida profesional**: resumen autogenerado (LinkedIn + carrera, ej. "Titulada en Administración de Empresas...").
7. **Vida social**: stats redes + seguidores en común (ej. "23 publicaciones y sigue a 1,374 personas... 14 seguidores en común").
8. **Lo personal**: 3 párrafos narrativos auto-extraídos sobre la relación (tono emocional, dinámica, observaciones).
9. **Fechas importantes**: lista con countdown (ej. "14 de junio - en 16 días").
10. **Perfil profesional**: sección colapsable.
11. **Redes sociales**: conectadas con escaneo (ej. "@diana.carolina.d").
12. **Nota de voz**: botón para grabar audio asociado a la persona.
13. **Fechas especiales**: añadibles.
14. **Registrar interacción**: 5 estados emocionales (corazón roto → corazón pleno) + notas opcionales.
15. **MEMORIAS ASOCIADAS** (sidebar derecho, lo más crítico):
    - Tipos: `SEMANTIC`, `EPISODIC`, `EMOTIONAL`, `SOCIAL`.
    - Auto-pobladas desde capturas WhatsApp (PR #85 ya guarda `relationships.history` items, falta extracción a tabla `memories`).
    - Cada memoria con timestamp + content + person_id.
    - 20+ memorias visibles en perfil de V1.
16. **Botones top-right**:
    - **Briefing IA**: genera resumen contextual de la persona usando LLM sobre todas las memorias asociadas.
    - **Chat WhatsApp**: link directo a `wa.me/{teléfono}`.
    - **Analizar screenshot**: atajo a `/captura/whatsapp` con la persona pre-seleccionada.
17. **Bitácora**: colapsable con historial completo de interacciones.

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

### 1. Captura Báscula (alta prioridad personal)

- Caso de uso real validado (screenshot Xiaomi Mi Scale del 18/05/2026).
- Schema simple: 13 métricas a `health_metrics`.
- Estimación: 1-2 sesiones (~4-6h).
- Costo: ~$1-3/mes (Claude Vision API).
- Stack: Supabase Storage + Claude Vision + UI con preview editable.

### 2. Captura WhatsApp Relaciones (post Báscula)

- Reusa infraestructura de Captura Báscula.
- Schema complejo: extrae mensajes + tono emocional + temas → `relationships.history`.
- Consentimientos: ✅ Diana Carolina (pareja). Otros contactos requieren consentimiento explícito antes de capturar.
- Estimación: 2-3 sesiones (~8-12h).
- Costo: ~$5-15/mes según volumen.

### 3. Issues de Fase 3b (planning estratégico)

- Decidir scope concreto de "Búsqueda Semántica".
- Posibles issues: pgvector setup, embeddings generation, search UI, re-rank, etc.
- Estimación de planning: 30-60 min.

---

## 📦 FASES PLANEADAS Memory Longitudinal (post-Captura)

Sub-fases ya estructuradas como milestones en GitHub.

| Sub-fase | Capacidad | Estado | Esfuerzo estimado |
|----------|-----------|--------|-------------------|
| 3a | Historial Profundo | ✅ CERRADA | (cerrada 28/05) |
| 3b | Búsqueda semántica (pgvector + embeddings) | 🔄 ACTIVA | 3-5 sesiones |
| 3c | Resumen automático de patrones longitudinales | ⬜ Pendiente | 3-4 sesiones |
| 3d | Memoria que aprende (RAG cross-session) | ⬜ Pendiente | 5-8 sesiones |

Timeline aspiracional: Fase 3 entera en 2-3 meses (4-8 semanas activas).

---

## ⏳ PENDIENTES MENORES (no urgentes)

Mejoras incrementales. Hacer cuando aporte valor concreto.

- **Sentry + Vercel Analytics**: observabilidad runtime mínima. Necesario antes de abrir SIR a familia/beta. Esfuerzo: 1-2h.

- **Mobile QA estructurado**: validar flujos críticos en 375px / 390px / 414px / 768px. Esfuerzo: 1h.

- **Estados vacíos pedagógicos**: copy que enseña al usuario qué registrar. Esfuerzo: 1-2h.

- **Emails Supabase template ES**: customizar emails de auth (template HTML + opcional SMTP Resend gratis hasta 3k/mes). Esfuerzo: 15-45 min.

- ~~**Accessibility pass**: fix `aria-describedby` en Sheet (warning detectado en Issue #70). Esfuerzo: 30 min.~~ ✅ Resuelto en sweep 30/05/2026 — `SheetDescription` sr-only en AppShell + TimelineFiltersMobile.

- **Gantt fix**: el Gantt del MASTER_PLAN omite la fase activa cuando las previas no tienen due_on. Fix: usar fecha de creación del milestone como fallback. Esfuerzo: 30 min.

- **Toggle privacidad finance en /timeline**: mostrar/ocultar movimientos financieros del feed. Útil si compartís pantalla. Esfuerzo: 30 min.

- **Cap en `relationships.history`**: cuando aparezca volumen >50 items por relación. R7 del ADR 0005. Esfuerzo: 15 min.

- **Robots.txt + noindex meta tag para rutas autenticadas**: hoy todas las páginas son crawlable. Indexar sólo la landing pública (cuando exista) y excluir `/panel`, `/yo`, `/historial`, etc. con `noindex` + `robots.txt`. Esfuerzo: 30 min.

### Edición completa en /relaciones/[slug]

**Detectado:** validación manual del 29/05/2026 (PR #85).

**Qué falta:** el detail page de persona solo permite editar nombre + slug. Para cambiar tipo de relación, categoría, importancia, confianza, impacto energético, frecuencia de contacto, el usuario debe volver a `/relaciones` y usar el formulario existente (modal de creación/edición).

**Propuesta:** formulario inline completo en el detail page con todos los campos editables (mismo schema que el modal). Idealmente con sección "Editar" colapsable o tabs para no saturar la vista.

**Esfuerzo estimado:** 1-2 sesiones (~3-4h).

**Prioridad:** Media. Funcional, mejora UX.

---

### Grafo /red/grafo — zoom inicial más generoso (labels cortados)

**Síntoma (29/05/2026):** al abrir `/red/grafo` con pocas personas (2 nodos: self + Diana), los labels se cortan ("Diana C" en vez de "Diana Carolina", "Aarón Huayna" en vez de "Aarón Huaynate Espinoza"). El `zoomToFit` post-stabilización no incluye padding suficiente para los labels.

**Fix propuesto:**
- `zoomToFit(400, 100)` en lugar de `zoomToFit(400, 40)` en `GraphCanvas.tsx`.
- O calcular padding dinámico según length del label más largo del set de nodos.
- O reducir `nodeRelSize` y usar `nodeAutoColorBy` con configuración de label fit.

**Esfuerzo estimado:** 30-60 min.

**Prioridad:** Baja. Cosmético.

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

- **Sync engine: surface push failures al usuario.**
  Hoy `pushWithRetry` en `src/lib/supabase/sync/engine.ts` reintenta 3 veces y, si todas fallan, logea `console.error` y se rinde silencioso. El usuario no se entera de que sus datos no llegaron al DB. Fix: registrar un callback `onSyncFailure(label, op, error)` en el engine y conectarlo a un toast destructivo en `<Sonner>` ("No pude sincronizar tu última métrica. Reintentar?"). Esfuerzo: 1-2h.

- **`persistScaleCapture` no espera ACK del push.**
  `src/lib/capture/scale/client.ts` retorna `{ insertedCount: N }` ni bien hace `setState` — el sync engine procesa el push asíncrono después. Si el push falla, la UI ya pasó al Step 4 "success" con mentira. Fix: agregar arg opcional `awaitSync: boolean` al `persistScaleCapture` que use el callback de arriba para esperar al ACK antes de resolver la promesa. Trade-off: rompe levemente el offline-first (la UI bloquea hasta que el server confirme). Para Captura específicamente, vale la pena porque las 13 métricas son irrecuperables si se pierden. Esfuerzo: 30 min después de tener el callback del punto anterior.

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

3. **Privacidad por defecto.**
   RLS en todas las tablas. Datos de terceros requieren consentimiento explícito (Diana ya consintió; otros contactos pendientes).

4. **Production-first workflow.**
   Validación vía Vercel preview/production, NO localhost.

5. **Human-in-the-loop para decisiones sensibles.**
   Las skills/engines no pueden modificarse autónomamente. Toda evolución pasa por aprobación humana explícita.

6. **Documentar descartados con razón.**
   Toda idea evaluada y NO incluida se documenta acá. Evita re-evaluar en conversaciones futuras.

---

## 🔗 Referencias

- `MASTER_PLAN.md` → roadmap generado automáticamente por sir-bot.
- `docs/decisions/` → ADRs formales.
- `docs/phase-3a/` → docs específicos de sub-fase 3a (cerrada).
- GitHub Issues → tracking de sesiones operativas.
- GitHub Milestones → fases formales (3a/3b/3c/3d + 5).

---

_Para actualizar este backlog: editar manualmente, commit con mensaje `docs(backlog): <cambio>`. NO depender del sir-bot para mantenerlo._
