# Aaron OS — Inventario contra SIR V2

> **Qué es esto.** "Aaron OS" era un proyecto aparte (Mission Control personal). Mucha de esa visión ya vive en SIR. Este documento mapea cada módulo de la visión contra lo que SIR **ya tiene**, clasifica **TENEMOS / PARCIAL / FALTA**, apunta el archivo/ruta que lo cubre, y prioriza qué construir o conectar por impacto.
>
> **Regla base:** no duplicar lo que ya existe. Construir sobre la arquitectura real de SIR (Next.js + Supabase + auth + sync). El prompt original de Aaron OS asumía "solo localStorage" — eso se ignora.
>
> Fecha: 2026-05-31 · Migraciones actuales: hasta `0025`.

> **Progreso (2026-06-01) — roadmap P0–P6 COMPLETO.**
> - ✅ **P0** — Diagnóstico personal en `/yo` (mig. `0030`).
> - ✅ **P1** — Gasto por intención (obligatorio/necesario/no-esencial) + desglose en `/finanzas` (mig. `0031`).
> - ✅ **P2** — Weekly score compuesto con tiers S/A/B/C/D en `/panel` (`src/engines/weekly`).
> - ✅ **P3** — Correlación emocional↔financiera ("estrés↑→gasto no-esencial↑") en `/finanzas`.
> - ✅ **P4** — Recovery Mode dinámico en `/panel`: triggers de sobrecarga → severidad → simplifica la UI (`src/engines/recovery`).
> - ✅ **P5** — Calendario Outlook `.ics` read-only en `/agenda` (parser + `/api/calendar`, TZ Lima, recurrentes). **Acción: setear `OUTLOOK_ICS_URL` en Vercel** (ver [CALENDAR_SETUP.md](CALENDAR_SETUP.md)).
> - ✅ **P6** — `/horario`: timeline operativo del día (bloque actual/próximo, countdown, sobrecarga) sobre el feed ICS.
>
> **Acciones pendientes de Aaron:** correr migraciones `0030` + `0031` (SQL Editor) y setear `OUTLOOK_ICS_URL` en Vercel para activar el calendario + `/horario`.

---

## Tabla resumen

| # | Módulo de la visión | Estado | Dónde vive en SIR |
|---|---------------------|--------|-------------------|
| 1 | Integración calendario Outlook (.ics real) | **FALTA** | — (existe `/agenda` con agregación interna, no calendario externo) |
| 2 | `/horario` — timeline operativo (bloque actual/próximo, countdown, intención por bloque, sobrecarga) | **FALTA** | parcialmente `src/engines/timing` (ventana circadiana, no bloques) |
| 3 | `/hoy` — estado operativo, misión, bloque actual, Top 3, checklist | **PARCIAL** | `src/app/panel` (es el "hoy" de facto) |
| 4 | Financial OS nativo (saldo, ahorro, cashflow, gasto por intención, registro, alertas, score, correlación emocional↔financiera) | **PARCIAL** | `src/app/finanzas` + `src/engines/financial` |
| 5 | Weekly score con tiers S/A/B/C/D | **FALTA** | parcialmente `src/engines/peace` (Peace Score 0–10, sin tiers ni semana) |
| 6 | Recovery Mode dinámico (baja el score → simplifica UI) | **PARCIAL** | `evaluateRecoveryMode` en `src/engines/peace` + banner en `/panel` |
| 7 | Espacio personal / diagnóstico (estado emocional, ansiedades, bloqueos, visión, valores) | **FALTA** | — (objetivo del **Entregable 2**, va en `/yo`) |
| — | Correlación longitudinal (lunar/ciclo ↔ ánimo) | **TENEMOS** | `src/lib/longitudinal/correlation.ts` (base reusable) |

---

## Detalle por módulo

### 1. Integración de calendario Outlook (.ics) — **FALTA**

No hay parsing de iCal/ICS ni sync de calendario externo en el repo. Lo que existe es **otra cosa con nombre parecido**: `/agenda` (`src/app/agenda/page.tsx` + `src/lib/agenda/build.ts`) arma un panel "Próximo" **a partir de data interna de SIR** (cumpleaños, fechas especiales de personas, target dates de objetivos, señales críticas, recordatorios de "sin contacto"). Es determinístico, sin LLM, sin red.

- El enum `SignalSource` en `src/types` ya contempla `'calendar'` como fuente posible, pero **nadie lo consume**.
- **Qué sirve:** el panel "Próximo" ya es el lugar natural donde aterrizarían los eventos del calendario.
- **Qué falta:** fetch + parse del feed `.ics`, normalización a eventos, merge en el agregador de `/agenda`.
- ⚠️ **Seguridad:** el feed ICS de Outlook lleva un **token privado** en la URL. Nunca hardcodear. Va por env var / config del usuario (idealmente una columna de settings por usuario con RLS, no `NEXT_PUBLIC_*`).

### 2. `/horario` — timeline operativo premium — **FALTA**

No existe scheduler de bloques de tiempo, ni "bloque actual / próximo", ni countdown, ni intención por bloque, ni detección de sobrecarga.

Lo más cercano: `src/engines/timing/index.ts` → `getCurrentTimingWindow()` mapea hora + estado biológico a una **ventana circadiana** (pico 6–10am, evitar 2–4pm, buena 5–8pm). Es un consejo circadiano, **no un horario**. Se muestra en `/panel` como "Ventana actual".

- **Qué falta (todo el núcleo):** modelo de bloques del día, intención/contexto por bloque, navegación actual→próximo, countdown a la siguiente transición, alerta de sobrecarga.
- **Dependencia:** este módulo cobra sentido real cuando hay fuente de eventos → idealmente **después** del calendario (#1) o alimentado por bloques manuales.

### 3. `/hoy` — dashboard operativo del día — **PARCIAL** (es `/panel`)

`src/app/panel/page.tsx` ya **es** el "hoy" de SIR. Tiene:

- ✅ Misión ("Conseguir Paz", hardcodeada)
- ✅ Ventana circadiana actual
- ✅ **Peace Score** (hero, 0–10, con tendencia y desglose bio/financiero/objetivo/emocional/relacional + amenazas)
- ✅ "Foco del día" (top recomendación con razón, impacto en paz, timing AHORA/HOY/SEMANA)
- ✅ Panel "Próximo" (agenda, top 6)
- ✅ Cards bio / finanzas / objetivos / alertas relacionales / señales activas
- ✅ Formularios rápidos (sueño, energía/estrés, movimiento financiero, señal)
- ✅ `DailyBriefingCard` (briefing diario LLM)

**Qué falta para cerrar la visión de "hoy":**
- ❌ **Weekly score con tiers S/A/B/C/D** (ver #5)
- ❌ **Top 3 del día** explícito (checklist accionable, distinto del "Foco del día" único)
- ❌ Resumen de "estado operativo" en una línea
- ❌ Bloque actual/próximo del horario (ver #2)

> Recomendación: **no crear `/hoy` nuevo**. Enriquecer `/panel`. Renombrar conceptualmente si Aaron quiere, pero la página ya existe y es buena.

### 4. Financial OS — **PARCIAL** (base sólida)

`src/app/finanzas/page.tsx` + `src/engines/financial/index.ts` + tabla `finance_movements` (mig. `0001`, multi-moneda desde `0003`).

**Ya tiene:**
- ✅ Registro de movimientos: ingreso / gasto / inversión / transferencia / deuda
- ✅ Dual currency PEN+USD con fetch de tipo de cambio en vivo (`src/lib/exchange`)
- ✅ Categorías (vivienda, comida, transporte, salud, etc.) + flag recurrente
- ✅ **Stability score** (0–10), balance mensual, tasa de ahorro, nivel de riesgo, tendencia
- ✅ Alertas (`detectFinancialAlerts`): liquidez < 2 meses (crítico), gasto > 90% ingreso (warning)
- ✅ Chart de balance acumulado + export CSV

**Qué falta de la visión:**
- ❌ **Gasto por intención** (obligatorio / necesario / no-esencial) — hoy hay *categoría* (qué se compró) pero no *intención* (cuán prescindible era). Es el dato más accionable de la visión. **Aditivo:** columna `intent` en `finance_movements`.
- ❌ **Financial score** separado del stability score (o renombrar/tier-izar el existente).
- ❌ **Correlación emocional↔financiera** ("estrés↑ → delivery↑ → gasto hormiga↑ → paz↓"). La maquinaria de correlación **ya existe** (`src/lib/longitudinal/correlation.ts`) pero hoy solo cruza `person_logs` contra fase lunar/ciclo; falta una variante self que cruce `self_metrics` (estrés/ánimo) contra `finance_movements` (gasto por intención).
- ❌ Metas de ahorro / presupuesto por categoría.

### 5. Weekly score con tiers S/A/B/C/D — **FALTA**

No hay score semanal ni clasificación por tiers. Solo el **Peace Score** (`src/engines/peace`), que es continuo 0–10 e instantáneo, no agregado semanal.

- **Qué sirve:** la fórmula compuesta de paz (bio 25% / financiero 20% / objetivo 20% / emocional 20% / relacional 15%) es una base ideal para agregar por semana y mapear a tiers.
- **Qué falta:** agregación semanal + función pura `score → tier (S/A/B/C/D)` + comparación semana a semana. La tabla `snapshots` (snapshot diario con `peace_score`) y `longitudinal_summaries` (resúmenes semanales) ya dan el sustrato de datos.

### 6. Recovery Mode dinámico — **PARCIAL** (mínimo)

`evaluateRecoveryMode(PeaceScore)` en `src/engines/peace/index.ts` ya activa modo recuperación si `peace.total < 4`, con razón (agotamiento bio / tensión financiera / estado emocional) y recomendaciones de texto. La UI lo refleja con un **banner rojo + badge "RECUPERACIÓN"** en `/panel`.

- **Qué falta:** la parte "dinámica" real — **simplificar la UI** (esconder cards no esenciales, priorizar descanso, diferir acciones), criterios de salida, tracking de recuperación. Hoy es señalización, no adaptación.

### 7. Espacio personal / diagnóstico — **FALTA** → **Entregable 2**

No existe espacio para el diagnóstico personal de Aaron (estado emocional, ansiedades, bloqueos, "lo que dejé de tolerar", "lo que entiendo", visión de vida ideal, yo futuro, frases ancla/valores). Va en `/yo`. Detalle de implementación en la sección de plan más abajo.

### Bonus — Correlación longitudinal — **TENEMOS** (reusable)

`src/lib/longitudinal/correlation.ts` cruza `person_logs` (ánimo/energía/sueño/dolor 1–5) contra **fase lunar** (8 fases) y **fase de ciclo** (4 fases), 100% determinístico. Hay narrativa LLM opcional (`correlationNarrative.ts`). Es la base perfecta para la correlación emocional↔financiera de #4.

---

## Recomendación priorizada (por impacto / esfuerzo)

> Aaron textual: *"Lo importante es hacerlo funcionar bajo lo que estamos construyendo."* — Todo es aditivo sobre SIR, sin reescribir.

| Prioridad | Qué | Por qué | Esfuerzo | Sobre qué se monta |
|-----------|-----|---------|----------|--------------------|
| **P0 — ya** | **Espacio personal/diagnóstico en `/yo`** (Entregable 2) | Aaron lo pidió explícito; es lo que "le ayuda a llevar mejor vida". Alto valor, riesgo bajo (aditivo). | M | tabla nueva + sección `/yo` |
| **P1** | **Gasto por intención** (obligatorio/necesario/no-esencial) en finanzas | El dato más accionable que falta; desbloquea la correlación emocional↔financiera. | S | columna `intent` en `finance_movements` + UI registro |
| **P2** | **Weekly score + tiers S/A/B/C/D** | Cierra la sensación de "Mission Control"; reusa la fórmula de paz y `snapshots`. | M | engine puro nuevo sobre `peace` + `snapshots` |
| **P3** | **Correlación emocional↔financiera** | El insight estrella ("estrés→gasto hormiga→paz↓"); la maquinaria ya existe. | M | variante self de `longitudinal/correlation` cruzando `self_metrics`×`finance_movements` |
| **P4** | **Recovery Mode dinámico** (simplificar UI real) | Convierte la señalización actual en adaptación útil cuando Aaron está mal. | S–M | `/panel` + flag de `evaluateRecoveryMode` ya existente |
| **P5** | **Calendario Outlook (.ics)** | Alto valor pero mayor superficie (token privado, parsing, settings por usuario). Habilita `/horario`. | L | config usuario con RLS + parser + merge en `/agenda` |
| **P6** | **`/horario` timeline operativo** | El módulo más ambicioso; rinde mejor *después* del calendario. | L | depende de #5 (calendario) |

**Lectura corta:** el camino de menor riesgo y mayor retorno es **P0 (diagnóstico) → P1 (gasto por intención) → P3 (correlación)**, porque encadenan: el diagnóstico da contexto emocional, la intención da el dato financiero accionable, y la correlación une ambos en el insight que Aaron describió. Weekly score (P2) y Recovery dinámico (P4) son quick wins de UI sobre engines existentes. Calendario y `/horario` (P5/P6) son fases mayores, dejarlas para cuando lo anterior esté en prod.

---

## Notas de coordinación

- Otra sesión trabaja en **Relaciones** (`src/components/relaciones/*`, campos nuevos en `people`, tabla `person_sensitive_data`, captura de documento). **No tocar esos archivos.**
- Migraciones de esa sesión: `0024_person_relationship_fields`, `0025_person_sensitive_data`. El Entregable 2 toma **`0030`** con margen, dejando `0026–0029` libres para evitar colisión.
