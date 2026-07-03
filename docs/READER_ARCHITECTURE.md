# SIR Reader — leer el navegador logueado y alimentar SIR (arquitectura)

> Visión de Aaron (2026-07-03): *"dejar Teams abierto en una PC, en el navegador,
> y que SIR vaya leyendo/guardando eso. Y luego generalizar: Teams, LinkedIn,
> Facebook, Instagram. Pensemos en grande."*
>
> Este doc es la **spec** para construirlo por fases. Empezamos por Teams (bajo
> riesgo) y dejamos las redes sociales como opt-in con advertencia explícita.

## 0. Investigación previa (lo que ya existe)

- **Teams**: hay varios exportadores open-source (p.ej. `gediz/teams-web-chat-exporter`,
  `ingo/microsoft-teams-chat-extractor`). Los mejores **no scrapean el DOM** —
  llaman la **Teams Chat Service API con el token de sesión ya presente** en tu
  navegador logueado. Es más estable y completo que leer burbujas.
- **LinkedIn**: el User Agreement §8.2 **prohíbe el acceso automatizado**. LinkedIn
  **detecta extensiones** (escanea el DOM por `chrome-extension://`, caso
  "BrowserGate") y **marca cuentas** con scraping sostenido (~4-8 semanas).
- **Instagram/Facebook**: la API oficial no da lo necesario; scrapear viola el ToS.
- **Patrón defendible** (según la literatura de captura personal): **pasivo** —
  leer lo que el navegador YA descargó al navegar de forma natural, **sin** requests
  automáticos ni scroll sintético. No elimina el riesgo en redes sociales, pero es
  la única postura razonable.

**Conclusión de diseño:** captura **pasiva, local-first, por deltas**. Teams primero
(tu data, tu sesión). Redes sociales: opt-in, pasivo, con aviso de riesgo de cuenta.

## 1. Arquitectura (dos piezas)

```
┌─ Navegador (PC de Aaron, sesión logueada) ──────────┐        ┌─ SIR (Vercel) ─────────────┐
│  Extensión "SIR Reader" (MV3)                        │        │                            │
│   • content script por host permitido                │  POST  │  /api/reader/ingest        │
│   • lee deltas de conversación (pasivo)              │ ─────► │   (token-auth, como Health)│
│   • dedup local (IndexedDB) + cola offline           │ batch  │   → pipeline de conversación│
│   • adaptador por plataforma (Teams/LinkedIn/…)      │        │   → observations + memorias │
│  Indicador visible ON/OFF por plataforma             │        │                            │
└──────────────────────────────────────────────────────┘        └────────────────────────────┘
```

### 1a. La extensión (cliente)
- **Manifest V3**, content scripts solo en **hosts allow-listados** (arranca:
  `teams.microsoft.com`). El usuario prende/apaga por plataforma; indicador visible.
- **Lectura pasiva**: `MutationObserver` sobre el contenedor de mensajes. Cuando
  renderiza un mensaje nuevo (porque Aaron está mirando/scrolleando normal), se
  extrae `{platform, threadId, threadName, author, text, ts}`. **Nada de auto-scroll
  ni de disparar requests**. (Para Teams, alternativa robusta: leer vía la Chat
  Service API reusando el token de sesión — decisión de implementación en Fase 1.)
- **Dedup + delta**: hash por mensaje (`sha1(threadId|author|ts|text)`); solo se
  encolan los nuevos. Cola en **IndexedDB** → sobrevive recargas y trabaja offline.
- **Envío**: batch cada N mensajes o cada T segundos a `/api/reader/ingest` con un
  **token personal** (mismo patrón que `HEALTH_INGEST_TOKEN`). Local-first: lo único
  que sale del navegador va a **tu** SIR.

### 1b. SIR (servidor)
- **`POST /api/reader/ingest`** (token-auth, service-role, mono-usuario) recibe
  `{ platform, threadId, threadName, messages: [{author, text, ts}] }`.
- **Reusa el pipeline de conversación que YA existe** (el de export de WhatsApp):
  `chunkConversation → interpretChunk (Sonnet) → consolidate` → **1 observación** por
  hilo/período, con un `capture_type` nuevo (`teams_chat`) o reusando
  `dm_conversation`. Alimenta *Lo personal* / recencia / memorias / tono → reciprocidad.
- **Atribución de persona**: reusa el matcher por huella/alias (`chat_identities`,
  `person_identities`) con `threadName`/`author` → liga a la persona correcta o
  propone candidato. Idempotente por hash de mensaje (no re-inserta lo ya visto).
- **Incremental**: como el import de WhatsApp, solo procesa mensajes **posteriores**
  al último visto por hilo (`getLastImportedISO`), así "dejar Teams abierto" acumula
  sin re-trabajar.

## 2. Riesgo por plataforma (honesto)

| Plataforma | Riesgo | Postura recomendada |
|---|---|---|
| **Microsoft Teams** | Bajo — es TU data laboral, TU sesión. Gate = política M365 de tu org. | **Fase 1.** Pasivo o Chat Service API con tu token. |
| **LinkedIn** | **Alto** — §8.2 prohíbe automatización; detecta extensiones; marca cuentas en ~4-8 sem. | Opt-in, **pasivo puro**, con aviso. Preferir captura **on-demand** (screenshot/pegar) al scraping continuo. |
| **Instagram / Facebook** | Alto — ToS lo prohíbe; sin API útil. | Igual que LinkedIn: opt-in + aviso; on-demand por ahora. |

> Regla: **activo** (auto-scroll, requests, crawl de fondo) = riesgo de ban.
> **pasivo** (leer lo ya cargado) = defendible. SIR Reader es pasivo por diseño.

## 3. Plan por fases

- **Fase 0 — hoy, cero build:** screenshot del chat → `/captura` (`dm_conversation`).
  Teams/Slack ya reconocidos por el detector (PR #504). Bueno para hilos cortos.
- **Fase 1 — SIR Reader (Teams):** endpoint `/api/reader/ingest` + extensión MV3
  mínima con adaptador Teams (pasivo o API con token). "Dejás Teams abierto → SIR
  lee y guarda." **Este es el pedido central.**
- **Fase 2 — framework multi-plataforma:** adaptadores pluggables; LinkedIn/IG/FB
  como **opt-in** con advertencia de ToS/cuenta, pasivo-only.
- **Fase 3 — Teams por Graph OAuth (opcional, lo más robusto):** API oficial, sin
  scraping, pero necesita consentimiento de tu M365 (posible admin).

## 4. Primer ladrillo a construir

`POST /api/reader/ingest` (lado SIR) — es **agnóstico de plataforma y de bajo riesgo**,
reusa el pipeline de conversación, y es lo que cualquier cliente (extensión, userscript,
incluso pegar texto) enchufa. Construir esto primero desbloquea todo lo demás sin
comprometer una decisión de extensión/ToS todavía.

**Env nuevo:** `READER_INGEST_TOKEN` (secreto, como `HEALTH_INGEST_TOKEN`).
