# SIR V2 — Guía de Continuidad (handoff para otra terminal)

> Cómo retomar el desarrollo de SIR V2 desde cero en cualquier máquina.
> Última actualización: 2026-06-23. Estado: `main` al día, todo desplegado.

---

## 1. Qué es

**SIR V2 — Life Operating System.** App privada de inteligencia relacional y
personal de Aaron: registra su gente (conversaciones, interacciones, vínculos),
su salud, objetivos, finanzas y "episodios" de vida, y se lo devuelve como
contexto accionable (briefing diario, día-X, score relacional, chat con SIR).

- **Repo:** `github.com/aaronhuaynate66/sir-v2-life-os` (público).
- **Prod:** `https://sir-v2-life-os.vercel.app` (Vercel, deploy automático al pushear a `main`).
- **Un solo usuario** (Aaron). No es multi-tenant; las decisiones de diseño asumen eso.

---

## 2. Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js **15.1.11** (App Router, RSC + client components) |
| Lenguaje | TypeScript 5.4, React 18.3 |
| DB / Auth | **Supabase** (Postgres + RLS por `user_id`), `@supabase/supabase-js` 2.x |
| Hosting | **Vercel** (deploy on push a `main`) |
| Estado cliente | **Zustand** (stores en `src/stores/`, persistidos en localStorage + sync a Supabase) |
| IA | **Anthropic SDK** — Sonnet (`claude-sonnet-4-5`) para interpretar/chat, Haiku (`claude-haiku-4-5`) para visión/barato |
| Transcripción | **OpenAI Whisper** (`whisper-1`, reusa `OPENAI_API_KEY`) |
| Tests | **Vitest** |
| Analítica | GA4 + Microsoft Clarity (enmascarado estricto) + Sentry |

---

## 3. Setup desde cero

```bash
git clone https://github.com/aaronhuaynate66/sir-v2-life-os
cd sir-v2-life-os
pnpm install            # o: npx pnpm@10 install --prod=false
cp .env.local.example .env.local   # si no existe, ver §4 y crearlo
pnpm dev                # next dev en localhost:3000
```

Scripts (`package.json`): `dev`, `build`, `start`, `lint`, `type-check` (`tsc --noEmit`), `test` (`vitest run`), `test:watch`.

> **Gotcha de package manager:** el repo usa **pnpm**. Vercel instala con
> `pnpm --frozen-lockfile`. Si agregás una dependencia, **actualizá `pnpm-lock.yaml`**
> o el deploy falla aunque CI esté verde.

---

## 4. Variables de entorno

Configuradas en Vercel (prod) y en `.env.local` (dev). Las que usa el código:

**Imprescindibles**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — cliente Supabase.
- `SUPABASE_SERVICE_ROLE_KEY` — operaciones server (crons, ingest).
- `ANTHROPIC_API_KEY` — toda la IA (briefing, import, chat, visión). Sin saldo → la IA cae (ver banner de créditos + página `/consumo`).
- `OPENAI_API_KEY` — embeddings (búsqueda semántica) + Whisper (transcripción de audios).

**Push / notificaciones**
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

**Crons / ingest**
- `CRON_SECRET` — protege endpoints de cron.
- `HEALTH_INGEST_TOKEN`, `HEALTH_INGEST_USER_ID` — ingesta de Apple Health.
- `OUTLOOK_ICS_URL` — calendario.

**Analítica / email (opcionales)**
- `NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_CLARITY_ID`, `NEXT_PUBLIC_SENTRY_DSN`.
- `RESEND_API_KEY`, `TRACKER_ALERT_FROM`, `TRACKER_ALERT_TO`.
- `APP_BASE_URL` / `VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL`.

**Pendiente (Aaron):** `OPENROUTER_API_KEY` — para modelos OSS en el chat (no requerido).

---

## 5. Flujo de desarrollo (el que se usa)

1. Rama desde `main`: `git checkout -b feat/lo-que-sea`.
2. Editá. Validá **siempre** antes de PR:
   ```bash
   pnpm type-check && pnpm lint && pnpm test
   ```
3. Commit + push.
4. PR contra `main` → **squash-merge** (no merge commits).
5. CI: **"Validate SIR V2"** corre en *push a main* (tsc + eslint + vitest).
   Si pasa, dispara **"Migrate DB (Supabase)"** (`workflow_run`), que aplica las
   migraciones nuevas. Vercel despliega en paralelo (~3-5 min de lag total).
6. Verificá en prod.

> CI corre en `push` a `main`, **no en el PR**. Por eso se valida local antes de mergear.

---

## 6. Migraciones

- Viven en `supabase/migrations/NNNN_descripcion.sql`, numeradas secuencialmente.
- **Última: `0100_goal_costs.sql`.** La próxima es `0101_...`.
- Se aplican **solas** en cada merge a `main` (workflow Migrate). No correr SQL a mano.
- Convención: **idempotentes** (`create table if not exists`, `do $$ ... end $$`
  con guardas, `drop policy if exists` antes de `create policy`). RLS por `user_id` siempre.
- **GOTCHA crítico:** `people.id` es **TEXT** (migración 0002), no uuid — hay ids
  legacy tipo `per_1780...`. Cualquier columna que referencie a una persona debe
  ser **text**, no uuid (ver fix 0096). El `user_id` sí es uuid (auth.users).

---

## 7. Modelo de datos (lo esencial)

Tablas clave (todas con RLS por `user_id`):
- `people` (id **text**), `relationships` (status: active/ended), `person_links` (árbol familiar).
- `observations` (capturas: `capture_type` whatsapp_chat/whatsapp_info/instagram/linkedin/manual_note/voice_note).
- `person_logs` (interacciones: `kind`=interaction/mood/energy/sleep/pain, `value` 1-5, `note`, `logged_at`).
- `memories` (derivadas; `source`, `observation_id`, `emotional_charge`, `importance`).
- `conversation_archives` (texto CRUDO por persona+source, búsqueda; **bug histórico arreglado en #352: antes mandaba id null y NUNCA persistía**).
- `chat_identities` (huella de participantes → persona, auto-ruteo de re-import).
- `person_identities` (alias por red: WhatsApp/IG/etc → persona; mig 0097).
- `relationship_moments` + `moment_participants` + `moment_references` — **EPISODIOS** (open loops multi-persona + su alcance/referencias).
- `goals` (en store cliente) + `objective_steps` + `goal_costs` (mig 0100).
- `deals` (pipeline B2B), `org_profiles` (empresas).
- `self_metrics`, `health_metrics`, `sleep_records`, `med_intakes`, `finance_movements`, `signals`, `ai_usage` (consumo IA, mig 0099).

> **Patrón "API + query directa":** tablas que NO están en el tipo generado de
> Supabase se acceden con `supabase.from('tabla')` (compila igual) + try/catch
> best-effort en todos lados. Es intencional.

Docs profundas del modelo y arquitectura: `docs/06_DATA_MODEL.md`,
`docs/05_TECHNICAL_ARCHITECTURE.md`, `docs/02_MEMORY_SYSTEM.md`.

---

## 8. Pipeline de importación de WhatsApp (núcleo del proyecto)

Tres entradas, todas en `/captura`:
- **Import de a uno** (`ImportarChat` → `AgregarCapturaPanel`): un .zip, rutea por
  huella/alias, **guard de atribución** avisa si el chat no coincide con la persona.
- **Lote** (`ImportarLote` + `lib/capture/whatsapp/runImport.ts`): varios .zip,
  semáforo (verde alias / amarillo nombre / rojo elegir), cola secuencial.
- **Grupo** (`ImportarGrupo` + `groupImport.ts`): chats grupales, **atribuye por
  autor** a cada miembro (no contamina fichas), el owner se excluye solo.

Secuencia (todas): leer .zip (streaming `zipStream.ts`, soporta multi-GB) →
media opcional (audios→Whisper, fotos→visión triage, stickers→tono) →
parse → **incremental** (`getLastImportedISO` + `sliceParsedSince`: solo mensajes
nuevos) → chunk → `interpretChunk` (Sonnet, por bloque) → consolidar → persistir
observación + interacción + llamadas + huella + archivar crudo →
**fechas limpias** (`lib/people/dateFilter.ts`: dedup + relevancia + no cumple-duplicado).

**Reset:** `/captura` → "Reset de importaciones" (endpoint `/api/reset-imports`,
borra SOLO lo derivado de imports por alcance, conserva lo manual; lo dispara el usuario).

---

## 9. Features recientes (sesión 2026-06-23) — qué buscar

- **Episodios multi-persona:** `relationship_moments` + `moment_participants`,
  `MomentosPanel`, surfacing en día-X. Caso real: "Conflicto por el Mundial" (6 personas).
- **Paso 3 — rastreador de referencias:** `/api/moments/references` barre
  `conversation_archives` por keywords del episodio → candidatos → confirmar.
  `ReferenciasEpisodio.tsx`, `lib/moments/keywords.ts`.
- **Objetivo del Mundial:** significado (`GoalMeaning` + `/api/objectives/meaning`),
  **costos** (`GoalCosts` + `goal_costs` + `/api/objectives/costs`: relacional + material),
  episodio en el grafo (`lib/graph/builder.ts` categoría `episodio`),
  **vista dedicada** `/objetivos/[id]`.
- **Identidades por red** (`person_identities`), **import de grupos**, **consumo IA** (`/consumo`),
  **avatares auto-extraídos** de capturas (`lib/avatars/autoExtract.ts`).
- **Foco del día (recomendaciones):** `src/engines/recommendation/` — el rec de
  sueño ahora gatea por recencia + no se "completa" a mano (se regenera con el sueño).

---

## 10. Gotchas (no tropezar de nuevo)

- `people.id` es **text**, no uuid (ver §6).
- **pnpm-lock** debe ir sincronizado o el deploy de Vercel falla (§3).
- Verificá si una feature **ya existe** antes de construir — los comentarios del
  código a veces mienten (caso ImportarChat duplicado). `grep` primero.
- La API de Anthropic **no expone saldo** restante: `/consumo` mide consumo PROPIO
  (tokens de cada respuesta), no saldo. Si la IA falla en masa = sin créditos → recargar.
- El extractor IA a veces **alucina** eventos (ej. "Boda con Luciano" de un ex
  solo mencionado). Si se ve data inventada, endurecer prompts en `lib/capture/whatsapp/export/interpret.ts`.
- Sandbox/CI de prueba: re-clonar + `npx pnpm@10 install --prod=false` (warm ~12-16s).

---

## 11. Estado actual y pendientes

**Al día:** todo el frente de import (limpio, dedup, guard, reset), episodios + Paso 3,
objetivo del Mundial (significado + costos + vista dedicada), grupos, identidades,
avatares, consumo IA, migraña↔FC.

**Pendiente de build:**
- `#44` Pulido mobile pantalla-por-pantalla (necesita capturas reales del cel).

**Diferido:**
- Predictivo / forecasting — esperando volumen de datos. Tarea agendada revisa madurez ~2026-08-11.
- Foto nivel 2 (reconocimiento facial en fotos grupales) — NO hacer salvo pedido explícito (privacidad/ADR 0009).

**De Aaron (no es código):** re-importar todo limpio (reset → re-import), corregir
handle IG de Nicolle a mano, decidir grabador (Plaud Note), `OPENROUTER_API_KEY` (opcional).

---

## 12. Más documentación

La carpeta `docs/` tiene el detalle profundo:
`00_MASTER_SYSTEM`, `01_COGNITIVE_ARCHITECTURE`, `02_MEMORY_SYSTEM`, `03_SELF_MODEL`,
`04_AI_BRAIN`, `05_TECHNICAL_ARCHITECTURE`, `06_DATA_MODEL`, `07_SIGNAL_ENGINE`,
`08_UX_SYSTEM`, `09_ROADMAP`, `MIGRATIONS.md`, `decisions/` (ADRs).
