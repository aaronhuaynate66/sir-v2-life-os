# SIR V2 — Auditoría Técnica Profunda

> **Fecha:** 2026-05-31 · **Auditor:** Comité técnico (Staff/Principal Eng, Architects, SRE, Security, DevOps, AI Systems, Data, Growth, QA, Perf, Observability, CTO SaaS)
> **Repo:** `sir-v2-life-os` · **Stack:** Next.js 15.1.11 (App Router) · React 18 · Zustand 5 · Supabase (Postgres + Auth + Storage + Realtime + pgvector) · Vercel · Anthropic SDK + OpenAI embeddings
> **Commit auditado:** `3fc8dd8` · **tsc:** ✅ limpio (exit 0) · **Tests:** ✅ 402/402 en 36 archivos · **Lente de evaluación:** life-OS **personal single-user**, no SaaS multi-tenant.

---

## 0. Cómo leer este documento

- Cada hallazgo está anclado en **evidencia real** (`archivo:línea`, comando, salida). Donde digo "verificado" es porque leí el código o corrí el comando, no porque lo supongo.
- Los hallazgos que **requieren inspección en vivo** (headers HTTP servidos, network real, Lighthouse, consola del browser, bundle real) están marcados con **`[LIVE]`** para que Aaron los complete desde Chrome.
- **Severidad** se calibra con el lente single-user. Donde un hallazgo sería Crítico en multi-tenant pero es Medio/Bajo en single-user, lo digo explícitamente.

### ⚠️ Corrección de un falso positivo (importante)
Un primer pase automático reportó *"secretos commiteados en `.env.local`"*. **Es FALSO.** Verificado:
```
$ git ls-files | grep -E "\.env"      → (vacío: ningún .env trackeado)
$ git check-ignore .env.local          → .env.local (exit 0 = ignorado)
$ grep -n env .gitignore               → 8:.env*.local  9:.env
```
`.env.local` existe en disco (931 bytes) pero **está gitignoreado y nunca entró al repo**. No hay secretos en el historial. Lo aclaro para que no quede un fantasma en el doc final.

---

## 1. SCORECARD (0–100)

| # | Dimensión | Score | Una línea |
|---|-----------|:---:|-----------|
| 1 | **General** | **71** | Ingeniería de lógica pura sobresaliente; capa operacional (observabilidad, gates, costos) inmadura. |
| 2 | **Frontend** | **70** | Arquitectura client-heavy coherente, pero god-components (972 LOC) y el gotcha de static cache. |
| 3 | **Backend** | **74** | 20 routes consistentes, auth en todas, RLS sólida; falta validación tipada (Zod) y rate limiting. |
| 4 | **Security** | **68** | RLS real en 100% de tablas + auth global + noindex; pero **0 security headers** y superficie de prompt-injection. |
| 5 | **Performance** | **64** | Doble `getUser()` por request, sync que pushea blobs, static-cache stale, casi sin code-splitting. |
| 6 | **Scalability** | **42** | Arquitectura localStorage-first + last-write-wins + migraciones manuales = no escala a multi-tenant tal cual. |
| 7 | **AI Readiness** | **61** | Engines puros excelentes y fallback determinístico; pero SDK disperso, **cero cost guards**, sin caching, sin abstracción de proveedor. |
| 8 | **Growth Engineering** | **18** | Cero analítica de producto, cero taxonomía de eventos, cero funnels. (Contextualizado: app personal.) |
| 9 | **Infrastructure** | **58** | Vercel+Supabase base sólida; CI existe pero **no gatea tests**, sin staging, migraciones SQL a mano, DR no documentado. |
| 10 | **Observability** | **31** | Sentry instalado pero **inerte** (sin DSN); logging = `console.*` (11 usos); 0 logs en API. |

**Promedio ponderado (lente single-user):** ~**62/100**. La nota la hunden Scalability/Growth/Observability — tres ejes que para un life-OS personal son *parcialmente* opcionales hoy, pero son exactamente lo que faltaría para multi-usuario.

---

## 2. NIVEL DE MADUREZ

> **Veredicto: MVP funcional sólido, con calidad de ingeniería de "startup temprana" en el núcleo de lógica — pero operacionalmente pre-startup.**

Justificación honesta:
- **Por qué NO es "MVP roto":** typecheck limpio, 402 tests verdes, RLS completa, auth global por middleware, 22 migraciones aplicadas y reconciliadas con prod, features reales en producción. Funciona y está en uso.
- **Por qué NO es "startup escalable":** la arquitectura de estado (Zustand+localStorage como working copy, Supabase como source-of-truth con upsert last-write-wins) es excelente para **un usuario en pocos dispositivos** y estructuralmente incapaz de soportar multi-tenant con garantías. Las migraciones se aplican **a mano sin runner** (el incidente 0012 lo prueba). Observabilidad inerte. Sin rate limiting → un endpoint LLM expuesto es una bomba de costo.
- **El núcleo (engines puros, tipados, testeados) es de calidad "startup escalable / casi enterprise".** El problema no es el código de dominio; es la **plataforma alrededor** (gates, observabilidad, límites, DR).

**Para SU scope declarado (life-OS personal):** está en el **percentil alto** — mejor instrumentado y más disciplinado que el 90% de los side-projects. **Para evolucionar a producto multi-usuario:** le falta una capa entera (auth de terceros real, rate limiting, observabilidad activa, runner de migraciones, staging, DR, analítica). Ver §11.

---

## 3. ARQUITECTURA (Frontend + Backend)

### 3.1 Frontend — rendering y composición

| Hallazgo | Evidencia | Sev |
|---|---|:---:|
| **26 páginas son `'use client'`; solo 2 server components.** Toda la data viaja por Zustand+sync, no por RSC. Se pierde el beneficio principal del App Router (streaming server-side, menos JS al cliente). | Excepciones: `src/app/relaciones/[slug]/page.tsx` (server, `Promise.all` de 6 queries:85-97) y `src/app/resumen/page.tsx` (`export const dynamic='force-dynamic'`:11). El resto client. | Medio |
| **God-component: `captura/page.tsx` = 972 LOC.** Lógica de captura, detección, matcher, creación de persona, preview y post-save matcher en un solo archivo. Lógica de create+link duplicada (líneas ~181-226 vs ~641-682). | `wc -l`: 972. Verificado. | Alto (mant.) |
| **God-component: `PersonDetail.tsx` = 718 LOC** con 8 props opcionales drilleadas a sub-paneles. `WhatsAppCapturePreview.tsx` = 652 LOC. | `wc -l` confirmado. | Medio |
| **Gotcha de static cache en `/captura`** *(vivido en prod)*. Página client sin `export const dynamic`/`revalidate` → Next 15 la prerenderiza como HTML estático; tras deploy puede servir el bundle viejo hasta hard-reload. El commit `3fc8dd8` ("forzar bundle nuevo") es un parche al síntoma. | `next.config.ts` sin `headers()`; no hay `dynamic` export en `captura/page.tsx:1`. Memoria del proyecto lo confirma. | Alto |
| **Hydration fix #418 manejado correctamente** vía patrón mount-safe por componente (timezone UTC server vs Lima client). No hay `suppressHydrationWarning` colgado. `<html className="dark">` hardcodeado (next-themes en deps pero el tema es fijo). | `PersonDetail.tsx:18-28` documenta el fix; `layout.tsx:17`. | Bajo (resuelto) |
| **Code-splitting casi inexistente.** Único `dynamic(ssr:false)`: `GraphCanvas` (react-force-graph-2d) en `GraphView.tsx:20-30`. framer-motion importado en ~10 archivos (uso liviano). | Verificado. | Bajo |
| **`useHasHydrated()` gatea el render de 8 stores** → toda página muestra skeleton hasta que localStorage hidrata. Latencia percibida atada al tamaño de localStorage. | `hooks/useHasHydrated.ts:24-46`. | Medio |

### 3.2 Backend — API routes

- **20 route handlers** bajo `src/app/api/**/route.ts`. **Las 20 chequean auth** (`getUser()`), 19 usan cliente anon (RLS), 1 usa service-role (cron, gateado). 17/20 hacen además filtro explícito `user_id` (defense-in-depth).
- **Separación de responsabilidades buena:** routes delgadas → lógica en `src/lib/*` (prompts, fetch, adapters) y `src/engines/*` (puros). No hay un monolito de 2000 LOC en un route.
- **Riesgo monolítico real:** no en backend sino en **frontend** (`captura/page.tsx`).

---

## 4. DATOS / DB (Supabase)

### 4.1 Esquema
- **15 tablas de dominio** + 6 buckets de storage. Tablas: `profiles, self_metrics, health_metrics, sleep_records, finance_movements, goals, signals, people, relationships, memories, snapshots` (0001) + `observations, person_synthesis` (0010) + `person_logs` (0013) + `longitudinal_summaries` (0016) + `relationship_events` (0021).
- **34 índices.** Cobertura **muy buena**: todos los FK indexados, todas las columnas timeline tienen `(user_id, ts desc)`, índices parciales en FKs nullables, único parcial `(user_id, slug)` en people.

| Hallazgo DB | Evidencia | Sev |
|---|---|:---:|
| **Anomalía de tipo: `person_logs.user_id` es `text`** (las otras 14 tablas usan `uuid`). RLS funciona vía `auth.uid()::text = user_id` pero es deuda de consistencia y rompe el patrón de FK a `auth.users`. | `0013_person_logs.sql:21,44`. | Bajo |
| **`relationships.history` es JSONB de crecimiento ilimitado.** Mitigado en 0021 copiando a `relationship_events` (append-only), pero el JSONB queda y **viaja en cada upsert del sync** (ver §5). | `0021_relationship_events.sql:9-10`. | Medio |
| **`person_synthesis` sin unique constraint en `(user_id, person_id, is_current=true)`** → múltiples filas "current" posibles, mitigado solo por lógica de app. | `0010:...` (índice parcial, no constraint). | Bajo |
| **ON DELETE bien modelado:** CASCADE de `auth.users`→todo y `people`→hijos; `observations`→`memories.observation_id` es SET NULL. **Sin orphans posibles.** | `0001`, `0010`. | ✅ |
| **pgvector: HNSW + cosine, `vector(1536)`** (OpenAI text-embedding-3-small). RPC `match_memories` es SECURITY INVOKER + filtra `user_id=auth.uid()` (defense-in-depth), cap 50 resultados. | `0015:22,26-28,34-67`. Verificado: `using hnsw (embedding vector_cosine_ops)`. | ✅ |

### 4.2 RLS — cobertura real (contada)
- **RLS habilitada en las 15 tablas.** **~62 policies** (44 base = 11 tablas × 4 CRUD en 0001, +8 en 0010, +4 en 0013, +4 en 0016, +4 en 0021, +9 de storage).
- **Todas son ownership checks reales** `auth.uid() = user_id` (o `::text`). **Cero `USING true`/permisivas.** Storage usa aislamiento por carpeta `(storage.foldername(name))[1] = auth.uid()::text`.
- **Veredicto:** RLS es la barrera principal y está **bien construida**. Para single-user es sólida. **Pero es la *única* barrera** en los 19 routes anon — si una policy se rompe en una migración futura, no hay segunda línea en código para 17/20 (los que sí filtran user_id explícito sobreviven; los stateless y los puramente-RLS no).

### 4.3 Migraciones — el approach manual y el incidente 0012
| Hallazgo | Evidencia | Sev |
|---|---|:---:|
| **No hay runner de migraciones.** SQL crudo aplicado a mano en el dashboard de Supabase. Sin tabla de versiones, sin `supabase db push` en CI, sin lock. | Estructura `supabase/migrations/0001..0022`, `package.json` sin script de migración. | **Alto** |
| **Incidente 0012 (drift real):** `/api/memories/derive` falló en prod con *"column memories.source_event_id does not exist"* — la migración 0012 **nunca se aplicó en prod**. Reparado retroactivamente por **0022** (red de seguridad idempotente). | `0022_memories_columns_safety.sql:26-58`; commit `2617226`. | **Alto** |
| **Churn de tipos id (0002→0006):** 0002 pretendía convertir `id uuid→text` en TODAS las tablas pero solo se aplicó a 2 en prod; 0006 lo detectó (síntoma: error 22P02 en upsert de báscula) y completó las 8 restantes. | `0006_fix_id_types.sql:4-9`. | Medio (resuelto) |
| **0012/0022/0017-0019 son idempotentes** (`if not exists`); **0002/0006 NO** (fallarían si se re-corren). Sin destructivos (no DROP TABLE, no DELETE masivo). | Lectura de los `.sql`. | Bajo |
| **`scripts/audit-prod-schema.mjs`** (untracked) introspecciona el schema de prod — buena señal de que el drift se está vigilando manualmente. | git status. | ✅ (paliativo) |

### 4.4 Split-brain Zustand/Supabase + Realtime
- **Realtime activo ("Camino A") en 9 tablas** (`people, relationships, self_metrics, health_metrics, sleep_records, goals, signals, finance_movements, memories`) con `REPLICA IDENTITY FULL` (necesario para que DELETE evalúe RLS) y publicación con `insert,update,delete,truncate`. Bien razonado.
- **NO en realtime:** `observations, person_synthesis, person_logs, longitudinal_summaries, relationship_events` → estas no se reconcilian en vivo entre dispositivos.

Ver el modelo y sus riesgos en §5.

---

## 5. EL MODELO SPLIT-BRAIN (riesgo arquitectónico central)

**Cómo funciona** (`src/lib/supabase/sync/engine.ts`, 456 LOC):
1. **localStorage (Zustand persist) = working copy.** Mutación → estado reactivo inmediato (optimista).
2. **Push por mutación:** subscriber diffea slices por igualdad referencial → colapsa insert/update en un **`upsert(rows, {onConflict:'id'})`** (`engine.ts:273-299`). **Pushea el objeto entero** (blob), no un delta.
3. **Last-write-wins implícito:** no hay comparación de timestamp ni campo de versión. El último upsert gana (`engine.ts:282`).
4. **Pull-on-mount** filtrado por `user_id` (RLS), DB-authoritative (`reconcile`).
5. **Realtime:** un canal por engine; cualquier evento `postgres_changes` dispara re-pull debounced 600ms (`engine.ts:362-384`).
6. **Pending tracking:** `sync-pending:{table}:{userId}` en localStorage; 3 reintentos, toast "No pude sincronizar", re-push en `online`/focus.

| Riesgo | Detalle | Sev |
|---|---|:---:|
| **Last-write-wins sin vector clock** | Dos dispositivos editan la misma fila → el más lento sobreescribe al más rápido silenciosamente. Sin merge, sin conflicto visible. | Medio (single-user, multi-device) |
| **Pérdida de edits offline en Device B** | Device B con cambios locales NO pusheados recibe evento Realtime → re-pull DB-authoritative → los cambios locales no-pending de B se clobbean. | Medio |
| **Upsert de blobs completos** | Editar una `relationship` reenvía todo el `history` JSONB. A medida que crece, cada mutación trivial sube un payload grande. | Medio (perf/costo) |
| **5 tablas sin realtime** | Cambios en `observations/person_synthesis/person_logs/...` no se propagan en vivo; un segundo dispositivo ve data vieja hasta recargar. | Bajo |

**Para single-user pocos dispositivos:** aceptable y bien mitigado (pending+retry+toast). **Para multi-tenant o uso intensivo multi-device:** insuficiente — necesitaría CRDT/OT o server-authoritative con optimistic concurrency (ver §11).

---

## 6. APIs — inventario y evaluación

**Auth/ownership:** 20/20 con `getUser()`. 19 usan anon+RLS; 1 (cron) service-role gateado por `CRON_SECRET` (`route.ts:29-38`, rehúsa correr sin el secreto — **buen default fail-closed**).

| Hallazgo API | Evidencia | Sev |
|---|---|:---:|
| **CERO rate limiting en todo el repo.** Sin Upstash/`@vercel/kv`/`p-limit`/bottleneck. Confirmado por grep global vacío. | `git grep -ni "ratelimit\|upstash\|@vercel/kv\|p-limit\|bottleneck"` → NONE. | **Alto** (costo/DoS, ver §8) |
| **Sin validación tipada (Zod).** Parsing manual con `.trim()`/`.slice()`. Caps existen (image 10MB, query 1000 chars, batch 1-200, days 1-31) pero ad-hoc. Ej: `sanitizeSignals()` no capea longitud de `label` → labels de 10k chars pasan al LLM. | `alignment/narrative/route.ts:49-62`. | Medio |
| **Idempotencia parcial.** Idempotentes: `memories/backfill` (`ON CONFLICT DO NOTHING`), `memories/derive` (PK). **NO idempotentes:** `person-logs`, `person-synthesis` (doble-click = synthesis duplicada), `voice-notes`. | Por route. | Medio |
| **Middleware corre `getUser()` en `/api/*` también** (el matcher no excluye `/api`), y la route **vuelve a llamar `getUser()`** → **2 round-trips de auth a Supabase por request de API.** | `src/middleware.ts:13`, matcher; routes con `getUser()`. | Medio (perf) |
| **API no autenticada recibe redirect HTML 307 a `/auth/login`, no un 401 JSON.** Un cliente programático contra `/api/*` sin sesión recibe HTML, no error tipado. | `middleware.ts:39-44`. | Bajo |
| **Manejo de errores tipado y consistente** vía `src/lib/api/errors.ts` + `ApiErrorNotice` + error boundaries (`error.tsx`, `global-error.tsx`). Mensajes capeados a ~300 chars. Leve fuga posible de `r.detail` de Supabase en `longitudinal/weekly:~55`. | Convención del proyecto verificada. | Bajo |
| **Comparación de `CRON_SECRET` no constant-time** (`!==`). Timing attack teórico; despreciable para un bearer único. | `cron/.../route.ts:36`. | Bajo |

---

## 7. SECURITY

| Hallazgo | Evidencia | Sev |
|---|---|:---:|
| **CERO security headers.** Sin CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. `next.config.ts` no tiene `async headers()`; `vercel.json` solo define el cron. | `grep headers next.config.ts` → NO headers; `vercel.json` verificado. **[LIVE]** confirmar qué manda Vercel por default en los response headers reales. | **Alto** |
| **Secretos: limpios.** `SERVICE_ROLE_KEY`/`ANTHROPIC`/`OPENAI`/`GOOGLE_CLIENT_SECRET` **no** están en código ni con prefijo `NEXT_PUBLIC_`. Las únicas menciones a SERVICE_ROLE en código son lecturas server-side (`cron route:45`) o comentarios aclarando que NO es público (`embeddings/client.ts:7`). `.env.local` gitignoreado. | `git grep` verificado; `git check-ignore`. | ✅ |
| **RLS como única barrera** en routes stateless/puramente-RLS. Si una migración rompe una policy, no hay defensa en código para esos. (17/20 mitigan con filtro explícito.) | §4.2. | Medio |
| **Superficie de prompt-injection.** Datos de DB (influenciados por extracción LLM de WhatsApp/IG/LinkedIn) se concatenan en prompts **sin delimitadores ni escaping**. Ej: `${personName}: ${c.emotionalOther}` y `Objetivo declarado: "${input.title}"`. Un `emotionalOther` extraído malicioso podría inyectar instrucciones. | `lib/person-synthesis/prompt.ts:~60`, `lib/alignment/narrativePrompt.ts:54-65`. | Medio (single-user: el "atacante" es el propio dato del usuario) |
| **Auth global por middleware** (redirect a `/auth/login` si no hay user) — buena postura fail-closed. OAuth callback excluido correctamente del matcher. | `middleware.ts:39-44`. | ✅ |
| **CSRF:** mutaciones vía Supabase JS (Bearer token en header, no cookie-form) → superficie CSRF baja. **XSS:** React escapa por default; revisar que no haya `dangerouslySetInnerHTML` con contenido LLM. **[LIVE]** | Revisar render de narrativas LLM. | Bajo |

---

## 8. AI / LLM READINESS

**Orquestación:** Anthropic SDK para generación+visión (11 routes), OpenAI solo embeddings. Modelos hardcodeados: `claude-sonnet-4-5-20250929` (10 routes), `claude-haiku-4-5-20251001` (báscula), `text-embedding-3-small` (1536d).

| Hallazgo AI | Evidencia | Sev |
|---|---|:---:|
| **CERO cost guards = bomba de costo/DoS.** Sin rate limit por usuario/endpoint, sin contabilidad de tokens enforced, sin presupuesto. Visión acepta imágenes de 10MB; retry-on-JSON-fail puede **duplicar** la llamada. Blast radius: floodear `/api/capture` con imágenes grandes → costo ilimitado. | Sin rate limit (grep vacío). `max_tokens` existe (300-2000) pero no cap de input efectivo. Retry: `capture/route.ts`, `whatsapp/route.ts`. | **Alto** |
| **Sin abstracción de proveedor.** `new Anthropic()` instanciado en cada route; cambiar de modelo/proveedor = editar 11 archivos. No hay gateway central para observabilidad/control/fallback. | 11 routes. | Medio |
| **Sin prompt caching** (`cache_control`/`ephemeral` ausente). Los system prompts (estables) se re-pagan en cada llamada. Anthropic prompt caching ahorraría notable en briefings/synthesis recurrentes. | `git grep cache_control` → NONE. | Medio (costo) |
| **Engines = funciones puras** (13: alignment, biological, context, financial, goal, memory, peace, recommendation, relationship, self, signal, timing, ai-brain). **Ninguno llama LLM ni DB** — son heurísticos deterministas, testeables, sin latencia. El `/panel` "brain" renderiza sus outputs sin costo. **Excelente decisión arquitectónica.** | `src/engines/*`; 11 tienen test. | ✅✅ |
| **Fallback determinístico robusto** en `/api/memories/derive`: si Anthropic falla o devuelve vacío → `baseMemoriesFromObservations()` siempre produce resultado, idempotente por PK, fail-silent. | `derive/route.ts:132-161`. | ✅ |
| **Embeddings sólidos:** HNSW+cosine, batch 1-200, cap 8000 chars/item, idempotente (`embedding IS NULL`). Costo despreciable vs visión. | `0015`, `memories/embed/route.ts`. | ✅ |

---

## 9. OBSERVABILITY / DEVOPS / CI

| Hallazgo | Evidencia | Sev |
|---|---|:---:|
| **Sentry instalado pero INERTE.** Init condicional a `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`; sin DSN seteado → **cero eventos**. El cableado es correcto (`error.tsx:29`, `global-error.tsx:21`, `instrumentation.ts`) pero no reporta nada. | `sentry.server.config.ts:13-22`; `.env.local` sin DSN. **[LIVE]** confirmar si hay DSN en Vercel env. | **Alto** |
| **Logging = `console.*` (11 usos totales).** **0 logs en los 20 routes de API.** Sin logger estructurado (Pino/Winston). Fallos de servidor son silenciosos. | `git grep console` → 11; API routes sin logs. | Alto |
| **CI existe pero NO gatea tests.** `validate.yml`: type-check + lint + build. **Falta `npm run test`.** Además corre en `on: push: main` — **el mismo trigger que el deploy de Vercel** → CI y deploy corren en paralelo; CI no es gate previo (salvo que Vercel esté configurado con "wait for CI", lo cual no está en el repo). **[LIVE]** verificar setting de Vercel. | `.github/workflows/validate.yml` (sin step de test). | **Alto** |
| **402 tests / 36 archivos, todos verdes — pero solo lógica pura.** Cubiertos: 11 engines + ~25 libs (dates, capture validators, timeline, sync, longitudinal, export, etc.). **0 tests de API routes, 0 de componentes, 0 E2E.** `vitest environment: node` (sin jsdom). | `npx vitest run` → 402 passed; `git ls-files *.test.*` por dir. | Alto |
| **Deploy commit-directo-a-main → prod, sin staging.** `deploy.bat` (untracked): limpia locks, pide mensaje, `git push origin main`. Sin canary, sin feature flags, rollback = git revert manual. | `deploy.bat`; `vercel.json`. | Medio (single-user) |
| **DR/backups no documentados.** Sin script de export/restore, sin RTO/RPO. Depende del PITR default de Supabase (no verificable desde el repo). `audit-prod-schema.mjs` ayuda con drift pero no es backup. | `scripts/`, docs. **[LIVE]** confirmar tier/PITR de Supabase. | Medio |
| **`sync-roadmap.yml`:** auto-sync de MASTER_PLAN en eventos de issues, `[skip ci]` para evitar loops, scheduled diario 13:00 UTC. Automatización de housekeeping bien hecha. | `.github/workflows/sync-roadmap.yml`. | ✅ |

---

## 10. GROWTH / ANALYTICS · SEO · A11Y · MOBILE

- **Growth/Analytics: prácticamente inexistente.** Solo `<Analytics/>` de Vercel (Web Vitals) en `layout.tsx:22`. **Cero** GA4/PostHog/Mixpanel/Segment, **cero** taxonomía de eventos, **cero** funnels, **cero** `track()`. *Para una app personal single-user esto es defendible*, pero es exactamente lo que faltaría para entender adopción si se abre a usuarios. Score 18 refleja la ausencia objetiva, no un juicio de que "debería" tenerlo hoy.
- **SEO: noindex global correcto.** `metadata.robots {index:false, follow:false}` (`layout.tsx:12`) + `robots.ts` con `disallow: '/'`. App privada, bien resuelto.
- **A11Y:** usa Radix UI (accesible por default: dialogs, selects, labels, alert-dialog). `lang="es"` en `<html>`. **[LIVE]** correr axe/Lighthouse para contraste real (tema dark hardcodeado `#0a0a0a`/`#f5f5f5`), focus management, aria en componentes custom.
- **Mobile/responsive:** Tailwind con utilidades responsive. **[LIVE]** verificar en viewport real (especialmente `captura` y el grafo de fuerza, que es canvas y suele ser hostil en touch).

---

## 11. TOP 20 PROBLEMAS MÁS GRAVES

| # | Problema | Sev | Ref |
|---|---|:---:|---|
| 1 | Cero rate limiting → endpoints LLM/visión = bomba de costo/DoS | Alto | §8 |
| 2 | Migraciones SQL manuales sin runner (causó el drift 0012) | Alto | §4.3 |
| 3 | Sentry inerte (sin DSN) → cero visibilidad de errores en prod | Alto | §9 |
| 4 | CI no gatea tests + corre en paralelo al deploy (no es gate) | Alto | §9 |
| 5 | Cero security headers (CSP/HSTS/X-Frame/etc.) | Alto | §7 |
| 6 | Sin logging estructurado; 0 logs en API → fallos silenciosos | Alto | §9 |
| 7 | God-component `captura/page.tsx` (972 LOC) + lógica duplicada | Alto | §3.1 |
| 8 | Static-cache stale en `/captura` (parcheado al síntoma) | Alto | §3.1 |
| 9 | Split-brain last-write-wins sin versión/merge | Medio | §5 |
| 10 | Sin validación tipada (Zod) en inputs de API | Medio | §6 |
| 11 | Doble `getUser()` por request de API (middleware+route) | Medio | §6 |
| 12 | Upsert de blobs completos (history JSONB crece) | Medio | §5 |
| 13 | Sin abstracción de proveedor LLM (11 routes acoplados) | Medio | §8 |
| 14 | Sin prompt caching (re-paga system prompts) | Medio | §8 |
| 15 | Superficie de prompt-injection (sin delimitar user data) | Medio | §7 |
| 16 | Idempotencia ausente en person-logs/synthesis/voice-notes | Medio | §6 |
| 17 | DR/backups no documentados ni testeados | Medio | §9 |
| 18 | Sin staging; commit-a-main = prod | Medio | §9 |
| 19 | RLS como única barrera en routes stateless | Medio | §4.2 |
| 20 | `person_logs.user_id text` (inconsistencia de tipo) + 5 tablas sin realtime | Bajo | §4 |

## 12. TOP 20 MEJORAS DE MAYOR IMPACTO

| # | Mejora | Impacto | Esfuerzo |
|---|---|---|:---:|
| 1 | Rate limit por usuario en endpoints LLM (Upstash/`@vercel/kv` + sliding window) | Corta el riesgo de costo de raíz | S |
| 2 | Setear `SENTRY_DSN` en Vercel + `Sentry.captureException` en cada catch de API | Visibilidad de errores inmediata | XS |
| 3 | Agregar `npm run test` a `validate.yml` y configurar Vercel "wait for CI" | Gate de calidad real | XS |
| 4 | `async headers()` en `next.config.ts`: CSP, HSTS, X-Frame, X-Content-Type, Referrer-Policy | Sube Security notablemente | S |
| 5 | Logger estructurado (Pino) con request-id en todas las routes | Observabilidad + auditoría | S |
| 6 | Anthropic prompt caching (`cache_control`) en system prompts | -30/50% costo en briefings/synthesis | S |
| 7 | Gateway LLM central (`lib/llm/`) con modelos en config + fallback | Desacopla, observabilidad, multi-model | M |
| 8 | Adoptar runner de migraciones (`supabase db push` en CI o Drizzle/Atlas) | Elimina la clase de bug 0012 | M |
| 9 | Zod en todos los route bodies (un schema por endpoint) | Validación + tipos + menos LLM-junk | M |
| 10 | Romper `captura/page.tsx` en hooks + componentes; deduplicar create+link | Mantenibilidad | M |
| 11 | `export const dynamic='force-dynamic'` (o revalidate=0) en `/captura` y páginas con bundle volátil | Mata el stale-cache | XS |
| 12 | Excluir `/api` del matcher de middleware (o devolver 401 JSON) → un solo `getUser()` | Latencia API | XS |
| 13 | Idempotency-Key en person-logs/synthesis/voice-notes | Robustez ante doble-submit | S |
| 14 | Delimitar/escapar user-data en prompts (`<user_data>…</user_data>`) | Cierra prompt-injection | S |
| 15 | Mover `relationships.history` fuera del slice sincronizado (leer de `relationship_events`) | Reduce payload de sync | M |
| 16 | Versionado optimista (campo `updated_at`/`version` + check en upsert) | Mitiga last-write-wins | M |
| 17 | Script de export/backup + documentar PITR/RTO/RPO | DR real | S |
| 18 | Tests de contrato de API (supertest/route handlers) + smoke E2E (Playwright) en flujos clave | Cobertura donde más duele | M |
| 19 | Normalizar `person_logs.user_id` a uuid + FK a auth.users | Consistencia de schema | S |
| 20 | Analítica de producto mínima (PostHog self-host) si se planea abrir a usuarios | Base para growth | M |

---

## 13. RIESGOS POR CATEGORÍA

- **Críticos (hoy):** costo LLM sin tope (§8 #1), errores invisibles por Sentry inerte (§9 #3), drift de migraciones por proceso manual (§4.3 #2).
- **Escalabilidad:** arquitectura localStorage-first + last-write-wins + sync de blobs **no escala a multi-tenant** ni a uso multi-device intensivo sin rediseño (§5). Migraciones a mano no escalan a un equipo.
- **Costos cloud/LLM:** visión a $/imagen sin rate limit + retry que duplica + sin prompt caching = costo super-lineal con uso/abuso. Embeddings despreciables.
- **Seguridad:** RLS sólida pero única barrera; sin headers; prompt-injection latente. En single-user el riesgo es contenido; en multi-tenant escalaría a Alto.
- **Mantenimiento:** god-components y lógica duplicada en `captura`; acoplamiento del SDK LLM en 11 routes.
- **Growth/Analytics:** sin instrumentación → ninguna capacidad de medir adopción/retención/funnel si se abre el producto.

---

## 14. ARQUITECTURA RECOMENDADA PARA EVOLUCIONAR

**Mantener (es bueno):** engines puros, RLS por ownership, Realtime camino-A, separación route→lib→engine, error handling tipado, tests de lógica pura, noindex/auth global.

**Evolución por capas:**
1. **Capa de protección (corto):** `lib/ratelimit` (Upstash Redis sliding-window) + `lib/llm` gateway central con cost-accounting + prompt caching. Security headers en `next.config`/middleware.
2. **Capa de confianza de datos (medio):** optimistic concurrency (`version`/`updated_at` check en upsert), sacar JSONB pesados del sync, runner de migraciones versionado.
3. **Capa de observabilidad (corto):** Sentry activo + Pino estructurado + request-id + dashboard de costo LLM.
4. **Si se va a multi-tenant (largo):** server-authoritative writes (Server Actions o RPC) en vez de localStorage-first; o CRDT (Yjs/ElectricSQL) si se quiere local-first serio; rate limit y quotas por tenant; staging environment; auth de terceros (Clerk/Supabase Auth ya está).

**Stack recomendado (incremental, no rewrite):**
- **Rate limit / cache:** Upstash Redis (`@upstash/ratelimit`) — encaja con Vercel sin infra.
- **Validación:** Zod (+ `zod-to-openapi` si se documenta API).
- **Migraciones:** Supabase CLI en CI, o Drizzle Kit / Atlas para versionado + diffing.
- **Observabilidad:** Sentry (ya instalado) + Pino + Vercel Log Drains; OpenTelemetry si crece.
- **LLM:** capa propia `lib/llm` o **Vercel AI Gateway** (failover multi-proveedor, observabilidad, cost tracking, zero-retention) — buen fit dado que ya está en Vercel.
- **Local-first robusto (solo si multi-device se vuelve crítico):** ElectricSQL o PowerSync sobre Postgres.
- **Analytics (si se abre):** PostHog (self-host o cloud) para eventos + funnels.

---

## 15. ROADMAP TÉCNICO

**Corto (1-2 semanas):** rate limit en endpoints LLM · `SENTRY_DSN` en Vercel + captureException en API · `npm run test` en CI + wait-for-CI · security headers · `dynamic='force-dynamic'` en `/captura` · excluir `/api` del middleware (un solo getUser).

**Medio (1-2 meses):** gateway LLM `lib/llm` + prompt caching + cost dashboard · Zod en todas las routes · runner de migraciones en CI · logger Pino estructurado · romper `captura/page.tsx` · Idempotency-Key · tests de contrato de API + smoke E2E · sacar `history` JSONB del sync.

**Largo (3-6 meses):** optimistic concurrency / evaluar local-first (ElectricSQL) · staging environment + feature flags · DR documentado y testeado · si multi-tenant: quotas por tenant, server-authoritative writes, analítica de producto.

---

## 16. LECTURA HONESTA DE SCOPE

El roadmap declara el principio de **"no convertirse en un life-OS/second-brain genérico"**. La evidencia del código muestra una **tensión real** con eso:

- **Lo coherente con el principio:** el núcleo es **relacional-cognitivo** (people, relationships, observations, memories, person-synthesis, alignment objetivo↔comportamiento). Las features de IA giran alrededor de *entender personas y vínculos* — eso SÍ es un producto con tesis.
- **Lo que tira hacia el "second-brain genérico":** `finance_movements`, `goals`, `signals`, `self_metrics`, `sleep_records`, `health_metrics`, báscula, agenda, charts de tendencias. Cada uno es defendible aislado ("contexto del yo para razonar mejor sobre lo relacional"), pero **en conjunto reproducen el feature-set de un Notion/second-brain genérico**: tracking financiero + objetivos + salud + sueño + agenda. La capa biológica (báscula→health_metrics) y la financiera son las que más se alejan del eje relacional.
- **Diagnóstico honesto:** el proyecto está **a una o dos features de cruzar la línea** que su propio roadmap pinta. La pregunta de producto no es técnica: *¿finanzas y biología son "contexto del yo para lo relacional" (justificado) o módulos por derecho propio (scope creep)?* Si es lo primero, deberían estar **subordinados visiblemente** al núcleo relacional (ej. solo aparecer como señales en el panel de una persona/objetivo). Si crecen como módulos autónomos con su propia UI rica (charts, export, CSV — que ya existen en `/finanzas`), **ya cruzaron la línea** y conviene admitirlo y re-encuadrar el principio.
- **Recomendación:** definir un **test de admisión de features** ("¿esto mejora la comprensión relacional o es tracking por sí mismo?") y aplicarlo retroactivamente a finanzas/biología antes de sumar el próximo módulo.

---

## 17. APÉNDICE — comandos de verificación corridos

```
git ls-files | grep -E "\.env"                  → vacío (sin .env trackeado)
git check-ignore .env.local                      → .env.local (exit 0)
npx tsc --noEmit                                  → exit 0 (limpio)
npx vitest run                                    → 36 files, 402 tests passed
git grep -ni "ratelimit|upstash|@vercel/kv|p-limit" → NONE
git grep -ln "cache_control|ephemeral"           → NONE (sin prompt caching)
grep hnsw supabase/migrations/0015...            → using hnsw (embedding vector_cosine_ops)
grep headers next.config.ts                       → NO headers()
wc -l (top): captura/page.tsx 972, PersonDetail 718, WhatsAppCapturePreview 652
find src/app/api -name route.ts                   → 20 routes
ls supabase/migrations                            → 0001..0022 (22 migraciones)
```

**Pendientes de inspección en vivo `[LIVE]` (Aaron, desde Chrome):**
1. Response headers HTTP reales (¿qué manda Vercel por default? confirmar ausencia de CSP/HSTS).
2. ¿`SENTRY_DSN` configurado en Vercel env? (si sí, Sentry NO está inerte).
3. ¿Vercel configurado con "wait for CI checks" antes de promover deploy?
4. Tier de Supabase + PITR/backups habilitados.
5. Lighthouse/axe: a11y real (contraste dark, focus, aria), performance score, bundle real servido (tamaño JS por ruta).
6. Network: tamaño real de los payloads de upsert del sync engine (¿blobs grandes?).
7. ¿Hay `dangerouslySetInnerHTML` renderizando narrativas LLM? (XSS).
8. Comportamiento touch real de `/red/grafo` (canvas force-graph) en mobile.

---
*Fin del findings report. Generado con evidencia anclada en el código del commit `3fc8dd8`. Severidades calibradas con lente single-user; donde escalarían en multi-tenant, está anotado.*
