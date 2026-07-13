# SIR V2 — Estado y pendientes (handoff)

> **Actualizado:** 2026-07-13. Para retomar en un chat nuevo: leé esto + `docs/BACKLOG.md` (source of truth del backlog) + la memoria en `~/.claude/.../memory/MEMORY.md`.
> **No contiene valores de tokens** (viven en Vercel). Cuando digan "el token", es el que ya está en Vercel.

---

## ✅ Qué quedó funcionando (sesión 2026-07-11 → 07-13)

**WhatsApp ingerido y cableado al cerebro:**
- Sustrato `chat_messages`: ~430k mensajes (30+ chats) + **Diana Carolina** (71.852 msgs) + notas de voz transcritas (Whisper): ~2.250 + 234 de Diana.
- Memorias derivadas + indexadas (embeddings) + observaciones frescas.
- **askSir lee el sustrato real + voz + búsqueda full-text (FTS)** — no solo la muestra vieja (PR #724, #731/#732).
- Fixes: autor invertido de papá (#725), `last_contact` al último mensaje (#735), dedup de voz en re-import (#736), zips >2GB por streaming (#741), perf/paralelización de askSir (#733).

**Canal conversacional (Telegram + web, hilo unificado):**
- **@sir_aaron_bot** (relacional) — webhook `/api/telegram/webhook`. LIVE.
- **@sir_aaron_dev_bot** (dev) — webhook `/api/telegram/dev-webhook`, responde estado del repo (PRs/CI/commits). LIVE y verificado (#738).
- **Captura de notas por chat** (4 acciones: interacción/objetivo/persona/cierre) con botones de confirmación (#726/#727/#728).
- **Brief de la mañana por Telegram** (#729, opt-in `TELEGRAM_MORNING_BRIEF=1`).
- **Brief de la tarde** (#734, opt-in `TELEGRAM_EVENING_BRIEF=1` — invita a dictar notas).
- **"mi papá / mi vieja / mi novia" resuelve a la persona** vía `person_links` (#740) — verificado en prod.
- **Cruce por fecha**: al preguntar por una fecha, busca menciones en el chat, no solo el calendario (#739).

---

## 🔴 PENDIENTES ACTIVOS (lo inmediato)

1. **WhatsApp Web scraping en la otra PC** — la maneja el agente Telegram **"Botcinho"**.
   - Extensión `extension/sir-reader/` (ya soporta WA Web). Guía: `extension/sir-reader/WHATSAPP_OTRA_PC.md`.
   - Ya se le pasó la guía + el token del reader. Falta que instale + abra WhatsApp Web + vaya abriendo/scrolleando chats.
   - **Verificar cuando arranque:** query `reader_threads` filtrando `platform='whatsapp'` (si aparecen hilos, entra bien). Método usado antes con Teams (21) y correo (9).
   - **Caveat:** un chat cae en `chat_messages` (lo que usa el cerebro) SOLO si el nombre del chat en WA Web matchea un contacto ya cargado en SIR; si no, solo queda observación. Priorizar chats de gente ya cargada.

2. **Verificar los flags de brief** en Vercel Production:
   - `TELEGRAM_MORNING_BRIEF=1` — ¿quedó activado? (se dieron instrucciones; confirmar). Dispara ~6am Lima.
   - `TELEGRAM_EVENING_BRIEF=1` — opcional, activar si se quiere el cierre de día.

3. **Higiene de tokens (opcional):** en esta sesión se pegaron en el chat el token del bot de dev, el `READER_INGEST_TOKEN` y (el bot de dev) su token. Si preocupa, rotarlos:
   - Bots: @BotFather → `/revoke` → nuevo token → actualizar Vercel + re-registrar webhook (yo lo hago).
   - Reader: nuevo valor en Vercel `READER_INGEST_TOKEN` + `extension/sir-reader/config.js` de la otra PC (mismo valor).

---

## 🟡 PENDIENTES que necesitan DECISIÓN/ACCIÓN de Aaron

- **A3 — Privacidad de terceros (Principio #5):** con los imports se guardó mucha data sensible de terceros (salud de familiares, etc.). Falta una **política explícita** de qué se guarda/muestra. Bloquea C4.
- **C4 — Ciclo desde WhatsApp:** derivar `cycle_start_date` de la pareja escaneando el chat = inferencia sensible de tercero → **diferido a propósito** hasta definir A3. NO construir a ciegas.
- **A2 — Análisis UX/UI de Rimu (competidor):** necesita **capturas visuales** que pase Aaron. Con eso se hace.
- **Mobile / pulido iPhone (#44):** necesita capturas de uso real de Aaron.

---

## 📋 Backlog más amplio (referencia, NO re-hacer lo ya hecho)

- **Source of truth:** `docs/BACKLOG.md`. Roadmap por capas: `docs/STRATEGIC_ROADMAP.md`.
- OJO: el backlog estaba **desfasado** — en esta sesión se verificó que varios "pendientes" YA estaban hechos (evolución del vínculo, sugerencia conductual, etc.). Verificar contra el código antes de construir.
- `MASTER_PLAN.md` NO es fuente de verdad (auto-generado; su sync quedó apagado a manual, PR #737).
- Ítem de baja prioridad no hecho: **dedup de media por hash** (fotos/docs — Aaron los marcó ruido; el caveat de voz ya se cerró).

---

## 🛠️ Infra clave / cómo se trabaja (para el próximo agente)

- **Directo a prod:** rama → PR → CI "validate" (type-check+lint+test+build) → merge squash → Vercel deploya solo. Migraciones (`supabase/migrations/00NN_*.sql`) las aplica el workflow `migrate.yml` tras el merge.
- **Credenciales:** PRs con el archivo `github-token` (fine-grained PAT). Pushes que tocan `.github/workflows/` necesitan GCM: `git -c credential.https://github.com.helper= -c credential.helper=manager push`.
- **No hay Vercel CLI/token** local → los cambios de env vars los hace Aaron por el dashboard (navegador). Los secrets de runtime (Telegram/GitHub/reader) viven solo en Vercel.
- **user_id de Aaron (mono-usuario):** `5c23c82c-2beb-401b-8555-706ac0b81248`.
- **Verificar el bot sin la app:** el webhook persiste cada intercambio en `sir_messages`; se puede mandar un update crafteado (con el `secret_token` header) y leer la respuesta ahí. OJO: `curl -d` en Git Bash (Windows) **corrompe acentos UTF-8** → usar body en archivo (`--data @file`) o node fetch.
- **Endpoints de ingesta:** `/api/reader/ingest` (extensión, token), `/api/capture/whatsapp-export/*` (export .zip), `/api/telegram/webhook` (SIR relacional), `/api/telegram/dev-webhook` (dev).
- **Import masivo de WhatsApp:** `scripts/import-whatsapp.mjs` (local, contra prod Supabase; usa `.env.local`).
