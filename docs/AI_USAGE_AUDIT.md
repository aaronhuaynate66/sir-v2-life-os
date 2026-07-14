# AI Usage Audit — SIR (rutas API)

> Fecha: 2026-07-13 · ADRs: [0011](decisions/0011-llm-multiproveedor-y-datos.md) (multi-proveedor) · [0012](decisions/0012-algoritmo-primero.md) (algoritmo-primero) · Spec: [LLM_PROVIDER_ARCHITECTURE](LLM_PROVIDER_ARCHITECTURE.md)
> Auditoría de TODOS los usos de LLM en las rutas, para bajar costo (migrar a `lib/llm/` → proveedor barato + fallback + telemetría) y reducir dependencia de IA (algoritmo-primero). Documento vivo — tildar a medida que se migra.

## Cómo leer

- **`complete()`** (`src/lib/llm/`) mapea `task` → tier → modelo. Tiers: `cheap` (Haiku/deepseek-chat…), `balanced` (Sonnet/deepseek…), `capable` (Anthropic-primero). Router `router.ts:22-29`, modelos `registry.ts`.
- **Clasificación (ADR 0012):** `esencial-IA` (NL/síntesis/extracción de texto-imagen ambigua/juicio) · `reemplazable-por-modelo-barato` (sigue con IA pero cheap/balanced basta) · `reemplazable-por-algoritmo` (matar la llamada).

## Hallazgos transversales

1. **`complete()` NO soporta visión ni tool-calling aún** (`content` es `string`). ⇒ visión (14 rutas) y el chat con tools NO migran hasta extender la capa. Parte el trabajo en tracks.
2. **~35 constantes `MODEL_ID` hardcodeadas** por archivo (deriva de model-ids); migrar centraliza en el registry.
3. **Telemetría de costo solo vía `complete()`** → migrar = observabilidad gratis.
4. **Ya migradas (NO re-hacer):** `briefing/daily`, `daily-actions/message`, `alignment/narrative`, `alignment/infer-links`.

## Estado de migración (checklist)

### ✅ Migradas a `complete()`
- [x] `api/briefing/daily` — `briefing_daily`/balanced
- [x] `api/daily-actions/message` — `message_draft`/cheap
- [x] `api/alignment/narrative` — `synthesis`/capable
- [x] `api/alignment/infer-links` — `extract`/cheap

### (a) Migrar tal cual (texto, sin tools/visión) — behavior-preserving, MÁXIMO AHORRO
Ordenadas por ahorro (tokens × frecuencia):
- [ ] `api/ingest/document` (3000 tok) → `cheap`  ·  `api/seed/extract` (2500) → `cheap`
- [ ] `lib/memories/deriveForPerson` (3500 tok; usada por `api/memories/derive` + `derive-all`) → `balanced` *(helper, M)*
- [ ] `api/capture/whatsapp-export/interpret` (1500, por-chunk) → `cheap`
- [ ] `lib/longitudinal/generate` (900; usada por `api/longitudinal/weekly` + `api/cron/weekly-summary`) → `balanced` *(helper, M)*
- [ ] extracción corta → `cheap`: `api/capture/note`, `api/empresas/extract`, `api/relaciones/intake-suggest`
- [ ] narrativa corta Sonnet→barato: `api/longitudinal/correlation-narrative`→`cheap`, `api/horario/brief`→`cheap`; `api/self/rumbo`, `api/self/arquetipo`, `api/self/coherencia`, `api/empresas/strategic`, `api/ciclo/event-brief`, `api/person-synthesis`, `api/person-briefing`, `api/contradiction-flag`, `api/verificar/deep` → `balanced`
- [ ] alto-valor → `capable` (migrar por fallback+telemetría, NO bajar calidad): `api/decision`, `api/decision/premortem`, `api/reason`, `api/influence/rehearse`, `api/influence/frame`, `api/profiling/relational`, `api/profiling/hypotheses`, `api/alter-ego`
- [ ] `api/relato/reprocess-tone` (ya Haiku) → `cheap`

### (b) Reemplazar por algoritmo (matar/reducir IA)
- [ ] `api/longitudinal/correlation-narrative` → templar prosa desde el digest (ya es determinístico) o dejar `cheap` *(evaluar calidad)*
- [ ] `api/ai/health` → derivar de `availableProviders()` sin ping
- [ ] `api/relato/reprocess-tone` → tono 1-5 por léxico *(batch, prioridad media-baja)*
- [ ] `api/avatars/detect` → CV local *(impacto ínfimo, baja prioridad, L)*
- [ ] `api/capture/route` (detector de tipo) → si el usuario elige tipo en UI, se elimina *(cambio de producto)*

### (c) Dejar esencial-IA (migrar a `capable` cuando toque, no bajar modelo)
- Conversacional con tools: `api/sir/ask`, `api/telegram/webhook` — **prerequisito: tool-calling en `complete()`**.
- Juicio sensible: `profiling/*`, `decision*`, `reason`, `influence/*` → `capable`.
- `api/capture/document` (DNI/pasaporte): visión `capable`.

### (E) Vía `runSirChat` (parsean JSON, tools innecesarias) — migrar quitando tools
- [ ] `api/sir/router`, `api/habits/suggest`, `api/self/retrato`, `api/self/premortem`, `api/self/espejo-lectura`

### (F) Visión — BLOQUEADAS hasta soportar `image` en la capa
14 rutas (`capture/*`, `identity/capture`, `relato/transcribe`, `trackers/extract`, `meds/extract`, `avatars/detect`…). Mientras tanto, sin tocar la capa: **bajar Sonnet→Haiku** en las 5 que están en Sonnet: `capture/route`, `capture/process`, `relato/transcribe`, `identity/capture` (dejar `capture/document` en Sonnet por precisión).

### (H) No-chat (informativo, dejar)
- Embeddings: OpenAI `text-embedding-3-small` (`lib/embeddings/client.ts`). Barato, dejar.
- STT: OpenAI Whisper (`lib/ai/transcribeAudio.ts`). Claude no hace audio; evaluar STT barato aparte.

## Trabajo habilitador (desbloquea tracks enteros)
- **Extender `lib/llm/` para bloques `image`** (L) → desbloquea las 14 rutas de visión.
- **Extender `complete()` para tool-calling** (L) → recién ahí migra el chat.

## Orden recomendado
1. Bucket (a) — máximo ahorro, riesgo mínimo, todo S/M.
2. Habilitador visión (L) → migrar (F) + bajar los 5 de visión en Sonnet.
3. Bucket (b) selectivo.
4. Habilitador tools → migrar chat (G).
