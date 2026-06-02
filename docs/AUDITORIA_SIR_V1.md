# Auditoría SIR v1 → v2 (solo lectura)

**Fecha:** 2026-06-02
**Autor:** Claude (auditoría de solo lectura, sin modificaciones a ningún repo)
**Repos comparados:**
- **v1** = `C:/Users/huayn/Projects/SIR` — Turborepo monorepo (`apps/{web,admin,mobile,chrome-extension}` + `packages/{ai,db,shared,emails,analytics}`), 44 migraciones SQL.
- **v2** = `C:/Users/huayn/Projects/sir-v2-life-os` — App única Next.js 14 (App Router) con `src/engines/*`, 33 migraciones SQL, alcance "Life OS" (más amplio que solo relaciones).

> **Alcance:** este documento es análisis del *repo*. La DB viva la inventaría el orquestador por separado. No se corrieron builds ni se modificó código. Todas las rutas citadas son de v1 salvo que se indique `(v2)`.

> **Nota de método:** los hallazgos provienen de lectura directa de los archivos. Donde una afirmación es inferida (no confirmada línea por línea), se marca con _(inferido)_.

---

## 0. Diferencia estructural de fondo

| Dimensión | v1 | v2 |
|---|---|---|
| Arquitectura | Monorepo Turborepo, 4 apps + 5 packages | App única Next.js, `src/engines/*` |
| Alcance | CRM relacional + memoria + señales sociales | "Life OS" personal (yo, finanzas, objetivos, salud, ciclo) + relaciones |
| AI | **Ollama-first → Claude fallback** (timeout 3s), cost-tracker con presupuestos por plan | Claude Sonnet directo (sin capa Ollama local ni cost-tracker visible) |
| Multi-usuario | Sí (waitlist, beta, admin, billing) | Mono-usuario (Aaron OS) |
| Grafo | Neo4j (capa social) | `relationships` en Postgres + vista de grafo en UI |
| Integraciones vivas | Chrome ext, WhatsApp webhook, Gmail, Google/MS Calendar+Contacts | Captura por screenshot/paste + calendar_connections (incipiente) |

v2 es **más profundo en "yo"** (auto-modelo, ciclo, finanzas, objetivos, correlaciones longitudinales) y **más prudente en prompts** (invariantes anti-diagnóstico, observacional). v1 es **más maduro en CRM relacional, ingesta automática e IA accionable**. Ahí están casi todas las gemas a rescatar.

---

## 1. Qué hace v1 que v2 NO tiene (o hace peor)

Ordenado por valor de rescate. Las gemas que el usuario ya notó (franja de resumen, secciones narrativas, auto-link de redes) están confirmadas; abajo hay **bastante más**.

### 1.1 🔴 IA accionable: "Acciones del día" + "Advisor" + "Briefing ejecutivo"

v1 tiene una capa entera de **recomendación proactiva** que v2 no tiene (v2 solo muestra alertas por time-decay).

- **Daily Actions** — `apps/web/src/app/(app)/acciones/generate.ts`
  - Genera máx. 5 acciones/día, cacheadas por `date_bucket` (idempotente por día).
  - **Scoring de candidatos** (`generate.ts:245-286`):
    ```
    overdueScore  = min(100, (daysSince/freq ?? 1.5) * 50)
    relScore      = strength*0.4 + reciprocity*0.3 + trust*100*0.3
    healthNeed    = 100 - relScore
    stageUrgency  = {dormant:80, prospect:50, active:20, strategic:15}
    score = round(overdueScore*0.4 + healthNeed*0.3 + stageUrgency*0.3)
            + 30 si hay fecha próxima + 10 si hay señal reciente
    urgency = score>=65 ? high : score>=40 ? medium : low
    ```
  - Prompt (Haiku, JSON estricto) que produce `action_text / timing_reason / message_suggestion / impact_prediction / urgency`, con regla **"message_suggestion debe ser copiable y enviable sin edición"** (`generate.ts:105-130`). Esto es oro: el output es accionable, no genérico.
- **Advisor** — `apps/web/src/app/api/advisor/route.ts:46-114`: misma fórmula + **bonus por disponibilidad del usuario** (`availability_score` del `human_state_logs`) → no te sugiere contactar cuando estás mal.
- **Briefing ejecutivo semanal** — `apps/web/src/app/api/briefing/executive/route.ts` y `executive/report/route.ts`: agrega top relaciones, señales por tipo (7d), tendencia de estado, oportunidades; prompt con formato fijo "Contexto semana / Acciones prioritarias / Retrospectiva".

**v2:** solo `src/engines/relationship/engine.ts` → `detectRelationshipAlerts()` ("no contacto >14 días", "relación tensa"). Sin scoring de urgencia, sin mensaje sugerido, sin briefing ejecutivo, sin ponderación por estado del usuario.

### 1.2 🔴 Motor de Rituales relacionales (reglas, no IA)

`apps/web/src/app/api/rituals/engine/route.ts:6-194` — cron que genera sugerencias por reglas (barato, determinista):
- no_contact >21d (si strength>20) · birthday ≤7d · anniversary ≤14d · job_change 3–21d · achievement 3–14d · custom_date ≤14d · strength declining (<40 con señales activas).
- Tabla `ritual_suggestions` con priority, read_at, dismissed_at. UI en `apps/web/src/app/(app)/rituales/page.tsx`.

**v2:** no existe equivalente. CicloPanel muestra fase pero no dispara rituales/sugerencias.

### 1.3 🔴 Ingesta automática multicanal (la mayor brecha funcional)

v1 captura relaciones **sin que el usuario tipee nada**; v2 depende de capturas manuales (screenshot/paste).

- **Chrome Extension** (`apps/chrome-extension/`) — Manifest V3, content scripts LinkedIn + Instagram.
  - LinkedIn: regex de headline `^(.+?)\s+(?:at|en|@)\s+(.+)$` para partir cargo/empresa (`content/linkedin.js:130`), work history (hasta 5), educación, auto-guarda tu propio perfil vía `PATCH /api/user/social`.
  - Instagram: polling de hidratación DOM (12 reintentos), bio por patrones de clase, stats followers/following, link externo.
  - Envía a `POST /api/people/enrich` (merge idempotente: solo rellena campos vacíos, dedupe por url→nombre).
- **WhatsApp** — `apps/web/src/app/api/integrations/whatsapp/import/route.ts` y webhook `api/whatsapp/webhook`:
  - Parser de export con **dos formatos** (corchete iOS/Android nuevo `[DD/MM/YY, HH:MM:SS]` y guion Android viejo) + multilínea (`parseWhatsAppExport:57-119`).
  - `isUserSender()` heurística de overlap de palabras (≥2 palabras >2 chars = misma persona).
  - Análisis Haiku de tono (cálido/neutral/formal/tenso) + extracción de señales (job change, viaje, evento).
  - Webhook con comandos `/ayuda /estado /red /briefing /señal` + chat libre. Storage privado `whatsapp-exports` (RLS por carpeta `user_id/`).
- **Gmail** (`api/gmail/sync`) — 6 meses metadata, match email→nombre, **backfill de email cuando matchea por nombre**, análisis Haiku de tono/temas, strength bonus = `min(20, floor(emails/3))`.
- **Google + Microsoft Calendar** — extrae asistentes, crea señales de interacción, strength +5 por reunión, set `last_contact_at`.
- **Google + Microsoft Contacts** — dedupe email→nombre normalizado (NFD strip diacríticos), patch solo campos vacíos.

**v2:** captura por imagen/paste + auto-link fuerte por handle/URL/teléfono (`src/lib/people/matcher.ts`), que es **buen diseño** pero cubre menos canales y nada es automático/background. No hay extensión, ni sync Gmail/Calendar/Contacts, ni parser de export WhatsApp con multi-formato, ni webhook conversacional.

### 1.4 🟡 Síntesis de la ficha — comparación matizada

El usuario notó que v1 sintetiza mejor. Matiz importante tras leer ambos:

- **v1 — franja de resumen** (`apps/web/src/app/(app)/red/[slug]/page.tsx`, `buildSummaryLines:95-139`): 3 líneas dinámicas → fase de ciclo, fecha próxima ≤30d, última interacción, señal reciente. Con labels emoji por tipo de señal.
- **v1 — secciones narrativas** "💼 Vida profesional / 🌐 Vida social / 💙 Lo personal" (`PersonProfileCards.tsx:776-836`): son **campos de texto libre editables** (`notes_professional/social/personal`), **no generadas por IA**. Su fuerza es la **estructura de 3 ejes** y que se rellenan desde captura/screenshot.
- **v2 — ya iguala o supera en algunos puntos:** `ResumenPersona.tsx` tiene franja con Vínculo/última interacción/próxima fecha/ciclo/próxima acción; `LoPersonal.tsx` tiene **síntesis IA cacheada real** (tabla `person_synthesis`, prompt observacional de 3 párrafos en `src/lib/person-synthesis/prompt.ts`); `RedesSociales.tsx` arma narrativa **determinista** de Instagram/LinkedIn.

**Gema concreta a portar:** la **estructura de 3 ejes narrativos** (profesional/social/personal) como secciones persistentes y editables. v2 tiene `VidaProfesional` (determinista) y `LoPersonal` (IA), pero **no** un eje "Vida social" narrativo ni los tres como campos editables persistidos. Combinar: ejes de v1 + síntesis IA de v2 = lo mejor de ambos.

### 1.5 🟡 Auto-link de redes desde captura/screenshot (Claude Vision)

`apps/web/src/app/api/people/[id]/analyze-screenshot/route.ts:46-113` — **el prompt de visión más afinado de v1** (vale la pena leerlo entero):
- Detecta plataforma (linkedin/instagram/whatsapp/facebook/twitter), devuelve JSON estricto con role, org, location, education, work_history (TODAS las entradas), connections/followers, interests, birthday/anniversary.
- **Construye URLs** desde handles (`https://linkedin.com/in/...`, etc.) y normaliza handles con regex dedicadas (`igUser/liUser/fbUser/twUser/ttUser`, `page.tsx:187-206`).
- Reglas de plataforma específicas + **salvaguarda de consentimiento**: `cycle_data.detected=true` **solo** si la conversación menciona explícitamente el ciclo (no infiere). Todo en español.

**v2:** tiene captura por screenshot (`src/lib/capture/*` detector+extractor) y auto-link fuerte por handle exacto. Lo que falta portar es la **riqueza del prompt de extracción** (work_history completo, construcción de URLs, detección multiplataforma en un solo prompt) y las **regex de normalización de handles**.

### 1.6 🟡 Salud relacional de red + grafo filtrado

- **Salud de red** — `apps/web/src/app/(app)/red/salud/page.tsx:56-88`: score multifactor `freq*0.30 + recip*0.25 + quality*0.25 + sigScore*0.20` con categorías critical/warning/healthy. v2 tiene score por persona pero no dashboard de salud de red.
- **Grafo** — `apps/web/src/app/(app)/grafo/page.tsx`: filtra nodos relevantes (tipo estratégico/personal/familia, o con contacto, o con señal), umbral mínimo 5 nodos. v2 tiene `src/app/red/grafo` pero conviene comparar criterios de filtrado.

### 1.7 🟡 Registro de interacción con impacto en score

`InteractionForm.tsx` + `actions.ts:100-101`: selector de calidad 1–5 con `QUALITY_DELTA = {1:-5,2:-2,3:0,4:+3,5:+6}` que mueve strength/reciprocity y setea `stage:'active'` + crea señal `relationship`. **Cierra el loop** captura→score.

**v2:** `RegistrarInteraccionPanel` registra mood/energy/sleep/pain/interaction en `person_logs`, pero la **reciprocidad sigue NULL** ("Datos insuficientes · necesita log de interacciones recíprocas — sesión futura", `RelationalScore.tsx`). El delta-por-calidad de v1 es justo lo que destraba esa dimensión.

### 1.8 🟢 Otras piezas menores pero útiles

- **Voice note → análisis** (`api/voice/transcribe/route.ts:40-97`): Haiku extrae `mentions/emotion/topics/signals`, crea memoria emocional + señales. v2 tiene `NotaDeVozPanel` (UI) pero el pipeline de análisis es más completo en v1.
- **Cost-tracker con presupuestos por plan** (`packages/ai/src/cost-tracker.ts`): precios por modelo, budget `{free:0.5, individual:5, pro:20, enterprise:100}`, corta con 429 si se excede. v2 no tiene control de costo/budget visible — **riesgo si se monetiza**.
- **Capa Ollama-first** (`packages/ai/src/client.ts`): intenta local con timeout 3s, cae a Claude. Ahorra costo/latencia; v2 fue directo a Claude.
- **Dashboard Admin** (`apps/admin/`): activity feed, ai-usage (costo hoy/semana/mes, por feature/modelo/usuario, latencia), analytics (DAU/WAU), audit log de acciones admin. v2 no tiene admin (mono-usuario).
- **Emails transaccionales** (`packages/emails/`, Resend): WaitlistInvite, AdminNewWaitlistEntry.

---

## 2. Esquema de datos de v1 vs v2

### 2.1 Tablas de v1 (44 migraciones, `supabase/migrations/2026051*–2026052*`)

Núcleo: `users, memories, signals, people, relationships, human_state_logs, briefings, notification_logs, analytics_events, ai_usage`.
Integraciones/feature: `google_integrations, microsoft_integrations, whatsapp_links, ritual_suggestions, people_dates, action_suggestions, audit_log, admin_audit_log, feedback, usage_events, waitlist, beta_applications`.
Extensiones: `uuid-ossp`, `vector` (pgvector 768d), `unaccent`.
Funciones/triggers clave: `set_updated_at()`, `handle_new_auth_user()` (SECURITY DEFINER), `search_memories()` (cosine), `purge_expired_memories()`, `set_waitlist_position()`. Vista: `pending_signals`. Bucket: `whatsapp-exports` (privado, RLS por carpeta).

### 2.2 Tablas de v2 (33 migraciones, `0001`–`0046`)

`profiles, self_metrics, health_metrics, sleep_records, finance_movements, goals, signals, people, relationships, memories, snapshots, observations, person_synthesis, person_logs, longitudinal_summaries, relationship_events, rate_limits, person_sensitive_data, self_diagnosis, person_links, objective_steps, calendar_connections`.

### 2.3 Diferencias relevantes (qué de v1 NO está en v2, o difiere)

| Concepto | v1 | v2 | Acción sugerida |
|---|---|---|---|
| **Embeddings vectoriales** | `memories.embedding vector(768)` + índice HNSW + `search_memories()` RPC | `memories` con embeddings (mig. `0015_memories_embeddings.sql`) — **confirmar que hay índice vectorial + RPC de búsqueda** | Verificar paridad de búsqueda semántica |
| **Capas de memoria** | enum `memory_layer` 8 capas (sensory…prophetic), consolidación por importancia | tipos `episodic/semantic/emotional/social/...` sin pipeline de consolidación sensory→working→episodic | Evaluar si el pipeline de 8 capas aporta o es over-engineering |
| **human_state / disponibilidad** | `human_state_logs` (mood, energy, composite/availability/interaction_risk) usado por el Advisor | `self_metrics`/`self_diagnosis` (auto-modelo más rico) | v2 ya cubre esto mejor; reusar para ponderar acciones |
| **action_suggestions** | tabla dedicada con date_bucket | **no existe** | Portar si se trae Daily Actions |
| **ritual_suggestions** | tabla + engine | **no existe** | Portar con el motor de rituales |
| **people_dates** | fechas custom recurrentes por persona | `people.special_dates` (JSONB) | v2 lo resuelve en JSONB — ok, distinto enfoque |
| **relationship_events** | señales en `signals` | tabla `relationship_events` dedicada (mig. 0021) | v2 mejora aquí |
| **Integraciones OAuth** | `google_integrations`, `microsoft_integrations` (multi-cuenta), `whatsapp_links` | solo `calendar_connections` (incipiente) | Portar si se reactivan syncs |
| **notification_logs** | push/email/in_app con urgency, DND, tope diario | **no existe** | Portar si v2 añade notificaciones |
| **ai_usage / cost** | tracking + budget por plan | **no existe** | Portar antes de monetizar |
| **waitlist/beta/admin/feedback/usage_events** | sí | no (mono-usuario) | Descartar salvo que v2 se abra a multiusuario |
| **person_sensitive_data** | `people.sensitive_context`/`cycle_data` (JSONB en la fila) | **tabla separada** `person_sensitive_data` con RLS | v2 mejora (separación + RLS) |

**Datos a portar (no estructura):** si la DB viva de v1 tiene personas/relaciones/memorias reales de Aaron, el orquestador debería mapear `people` v1→v2 (nombres de columnas difieren: v1 `notes_professional/social/personal`, `instagram_url`; v2 `instagram_handle`, `special_dates`, `importance_score/trust_level/energy_impact`). Es migración con transformación, no copia directa.

---

## 3. Aprendizajes / deuda técnica

### 3.1 Seguridad RLS — el punto que disparó la auditoría

**Hallazgo del advisor de Supabase sobre v1 (confirmado en el repo):**
- **RLS deshabilitado** en `usage_events`, `admin_audit_log`, `feedback` — confirmado: `20260524000001_admin_audit_log.sql` y `20260524000002_feedback_and_events.sql` crean estas tablas **sin** `ENABLE ROW LEVEL SECURITY` ni policies ("append-only por convención"). Riesgo real: cualquier rol con acceso a la API podría leer/escribir.
- **SECURITY DEFINER en la vista `pending_signals`** — matiz técnico: el DDL (`20260513000004_signals.sql:35-38`) es una vista *plana* (no declara `security definer`), **pero** el advisor la marca igual porque una vista corre con los permisos de su **owner** (postgres) y **bypassa el RLS del usuario que consulta**. La alerta del advisor es legítima aunque el SQL no diga "security definer".

**¿v2 repite el patrón? → NO. v2 ya lo resolvió (verificado en `supabase/migrations`):**
- ✅ **RLS habilitado en las 22 tablas** (`alter table ... enable row level security` en `profiles, people, relationships, memories, signals, observations, person_synthesis, person_logs, person_sensitive_data, self_diagnosis, finance_movements, goals, health_metrics, sleep_records, self_metrics, snapshots, longitudinal_summaries, relationship_events, rate_limits, objective_steps, person_links, calendar_connections`).
- ✅ **Cero vistas** en v2 (`CREATE VIEW` → sin resultados) → **estructuralmente no puede caer en el flag de SECURITY DEFINER-view** de `pending_signals`.
- ✅ Los **dos** `SECURITY DEFINER` de v2 son **correctos y deliberados**:
  - `handle_new_user()` trigger (`0001_initial_schema.sql:224`) — patrón estándar/necesario (igual que v1).
  - `rate_limits` RPC (`0023_rate_limits.sql:37`) — **patrón seguro a propósito**: tabla con **RLS on + sin policies**, accesible *solo* vía el RPC SECURITY DEFINER (comentado explícitamente en `0023:27-28`). Esto es buena práctica, no la anti-práctica de v1.

**Conclusión punto 3 (seguridad):** v2 **no hereda** la deuda RLS de v1. No hay acción de seguridad pendiente por este motivo. (Recomendación menor: cuando v2 incorpore tablas tipo `feedback`/`usage_events`/`admin_audit_log` para analítica append-only, habilitar RLS + policy de solo-insert desde el arranque, para no repetir el patrón de v1.)

### 3.2 Otra deuda/fragilidad de v1 a evitar en v2

1. **Scoring duplicado en 4+ lugares.** La fórmula `strength*0.4 + reciprocity*0.3 + trust*100*0.3` está copy-pasteada en `red/[slug]/page.tsx:188`, `briefing/route.ts:323`, `briefing/executive/route.ts:114`, `acciones/generate.ts`, `advisor/route.ts`, y `mobile/usePersonDetail.ts`. Si se porta a v2, **centralizar en una sola función** (v2 ya tiende a esto con `src/lib/people/relationalScore.ts`).
2. **Importancia/score como heurística mágica.** `scoreImportance` (`packages/ai/src/memory/engine.ts:74-86`) usa bases por tipo (0.30–0.85) + length boost — números sin tests de regresión documentados. En v2, si se adopta, dejar las constantes en un módulo con tests (la memoria del proyecto ya registra que normalizar importance fue trabajoso — ver Fase C1).
3. **Acoplamiento a Neo4j** para la capa social: doble fuente de verdad (`relationships.neo4j_sync_status` pending/synced/failed) que añade operación y modos de fallo. v2 lo resolvió manteniendo el grafo en Postgres — **mantener esa decisión**, no reintroducir Neo4j salvo necesidad real.
4. **8 capas de memoria** con consolidación temporal (sensory 30s → working 20 items → episodic/semantic) es elegante pero pesado; gran parte nunca se aprovechó en UI. v2 simplificó. **No reintroducir las 8 capas sin un caso de uso que las pague.**
5. **Prompts sin invariantes de seguridad en v1.** Los prompts de v1 son potentes pero el de visión llega a inferir `cycle_data`/estado emocional. v2 estandarizó invariantes ("#1 bienestar no engagement", "#5 correlación ≠ causa", prohibido diagnóstico) en `person-synthesis/prompt.ts`, `person-briefing/prompt.ts`, `derivePrompt.ts`. **Al portar prompts de v1, envolverlos con los invariantes de v2.**
6. **Sin control de costo en v2.** v1 tenía cost-tracker + budget. v2 va directo a Sonnet en cada synthesis/briefing/derive. Antes de cualquier uso intensivo o multiusuario, portar un cost-tracker (aunque sea simple) — es deuda preventiva.
7. **`dist/` y `coverage/` commiteados en v1** (`packages/ai/dist/`, `apps/*/coverage/`). v2 evitarlo (mantener en `.gitignore`).

---

## 4. Recomendación priorizada (qué rescatar / qué descartar)

### 🔴 Alto valor — rescatar a v2

1. **Prompt de extracción por screenshot (Claude Vision)** — `analyze-screenshot/route.ts:46-113` + regex de handles (`page.tsx:187-206`). Es el prompt mejor afinado de v1 y v2 ya tiene el canal de captura donde enchufarlo. **Esfuerzo bajo, impacto alto.**
2. **Daily Actions + scoring de urgencia** — `acciones/generate.ts`. La regla "message_suggestion copiable sin editar" + ponderar por disponibilidad del usuario (que v2 ya modela mejor en `self_metrics`). Crea tabla `action_suggestions`. **Es la diferencia entre "CRM que muestra datos" y "asistente que te dice qué hacer hoy".**
3. **Delta de interacción por calidad** — `QUALITY_DELTA` + update de strength/reciprocity. **Destraba la dimensión Reciprocidad que hoy está NULL en v2.**
4. **Estructura de 3 ejes narrativos** (profesional/social/personal) como campos persistidos editables, combinada con la síntesis IA que v2 ya tiene. Añadir el eje "Vida social" que falta.
5. **Motor de rituales por reglas** — `rituals/engine`. Barato (sin IA), alto valor relacional (cumpleaños, reconexión, follow-up de cambios). Crea `ritual_suggestions`.

### 🟡 Medio valor — rescatar si/cuando aplique

6. **Briefing ejecutivo semanal** — `briefing/executive`. Útil cuando haya volumen de relaciones/señales.
7. **Parser de export WhatsApp multi-formato** + análisis de tono — `whatsapp/import`. Alto valor de ingesta; medio porque requiere flujo de subida de archivo (v2 hoy es screenshot/paste).
8. **Sync Gmail / Google+MS Calendar/Contacts** — alto valor de ingesta automática, pero costo de re-implementar OAuth multi-cuenta + tablas de integración. Priorizar **Calendar** (señales de interacción automáticas) sobre Contacts.
9. **Cost-tracker + budget** — `packages/ai/src/cost-tracker.ts`. Portar antes de uso intensivo o monetización.
10. **Capa Ollama-first con fallback** — `packages/ai/src/client.ts`. Ahorro de costo/latencia; medio porque depende de tener Ollama corriendo.
11. **Dashboard de salud de red** — `red/salud/page.tsx`. Buena vista agregada cuando la red crezca.

### 🟢 Bajo valor / descartar

12. **Chrome Extension** — gema técnica, pero los selectores DOM de LinkedIn/Instagram se rompen seguido (alto mantenimiento) y v2 cubre el caso con screenshot+Vision. **Descartar** salvo que la captura automática sea prioridad estratégica.
13. **Neo4j / capa social en grafo externo** — **descartar**; v2 acertó con Postgres.
14. **8 capas de memoria + consolidación temporal** — **descartar** la complejidad; quedarse con el modelo simplificado de v2.
15. **Waitlist / beta / admin / billing / emails transaccionales / notification_logs** — **descartar** mientras v2 sea mono-usuario (Aaron OS). Reconsiderar solo si se abre a terceros.
16. **Mobile app (Expo)** — fuera de alcance de v2 hoy; descartar como rescate (es reescritura, no port).

---

## Apéndice A — Prompts de v1 que vale la pena conservar (rutas)

- Vision/extracción screenshot multiplataforma: `apps/web/src/app/api/people/[id]/analyze-screenshot/route.ts:46-113`
- Briefing de persona (6 secciones): `apps/web/src/app/api/briefing/route.ts:71-...`
- Briefing ejecutivo / reporte semanal: `apps/web/src/app/api/briefing/executive/route.ts:19-72`, `executive/report/route.ts:28-78`
- Daily actions (JSON estricto, mensaje copiable): `apps/web/src/app/(app)/acciones/generate.ts:105-130`
- Voice note (mentions/emotion/topics/signals): `apps/web/src/app/api/voice/transcribe/route.ts:40-97`
- System prompt base SIR: `packages/ai/src/memory/engine.ts:29-33`
- Extracción de señales por reglas (regex + opportunity_score): `apps/web/src/app/api/signals/capture/route.ts:56-81`

## Apéndice B — Fórmulas/heurísticas de v1 (referencia)

- Relationship score: `strength*0.4 + reciprocity*0.3 + trust_score*100*0.3`
- Salud de red: `freq*0.30 + reciprocity*0.25 + strength*0.25 + signalHandling*0.20`
- Urgencia de acción/contacto: `overdue*0.4 + healthNeed*0.3 + stageUrgency*0.3` (+30 fecha, +10 señal)
- `stageUrgency`: `{dormant:80, prospect:50, active:20, strategic:15}`
- `QUALITY_DELTA`: `{1:-5, 2:-2, 3:0, 4:+3, 5:+6}`
- Importancia de memoria: base por tipo (0.30–0.85) + `min(0.15, len/1000)`
- Gmail strength bonus: `min(20, floor(emails/3))`; Calendar: +5 por reunión
- Ollama→Claude: timeout 3s (`AI_TIMEOUT_MS`)

---

*Fin de la auditoría. Documento de hallazgos; no se modificó código ni datos en v1 ni en v2.*
