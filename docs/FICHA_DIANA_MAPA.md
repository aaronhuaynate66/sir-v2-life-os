# Mapa de la ficha de persona (Diana) — inventario UX

> Inventario de TODO lo que aparece en `/relaciones/[slug]` (`PersonDetail.tsx`): cada panel, su fuente de datos, sus botones y por qué está. Para llevar a un constructor visual.

## Leyenda de fuentes

| Ícono | Fuente | Qué significa |
|---|---|---|
| 🤖 | **IA-generada** | Llama a un LLM (Anthropic **Claude Sonnet 4.5**). Casi siempre cacheada u on-demand (botón). |
| ⚙️ | **Computada** | Motor determinista PURO (sin IA). Reglas + estadística sobre tus datos. |
| 📸 | **Extraída de captura** | Sale de Visión/OCR/pegado de screenshots o chats (esa extracción sí usa LLM/Vision). |
| ✍️ | **Manual** | Vos lo escribiste / respondiste. |
| 🗄️ | **DB directa** | Solo lee una tabla y la muestra. |

**Hallazgos clave:**
- **~La mitad de los paneles son motores puros (⚙️), NO IA.** Muchos parecen "inteligentes" pero son reglas + estadística.
- **La IA está concentrada y casi siempre cacheada/on-demand** (no gasta tokens al re-abrir la ficha). Solo el **Briefing IA** corre siempre y efímero.
- **Ningún panel usa OpenAI.** Todo LLM es Anthropic Sonnet 4.5. La extracción de capturas usa Anthropic Vision.
- **"Pre-derivado" ≠ IA en vivo:** *Lo personal* y *Memorias* muestran texto que un LLM generó ANTES (guardado en DB); al abrir la ficha solo se lee.

---

## 0) Cabecera + acciones globales

| Elemento | Fuente | Acción |
|---|---|---|
| **← Volver a Relaciones** | — | Link a `/relaciones`. |
| **Avatar + Nombre + badges** (categoría, relación) | 🗄️/📸 | Avatar puede venir de captura; nombre/badges de DB. |
| **PersonActions** → **Briefing IA** | 🤖 **IA (efímero, NO cacheado)** | Abre un Sheet lateral y corre Claude Sonnet 4.5 (`/api/person-briefing`) sobre memorias + red + tu estado → TL;DR / Contexto / Dinámica / Sugerencia. Botón **Regenerar** re-llama. No se guarda. |
| **PersonActions** → **Chat WhatsApp** | ⚙️ | `<a>` a `https://wa.me/{tel}` si hay teléfono; `disabled` si no. No pega a IA. |
| **Card "Identidad"** → **Editar** | ✍️ Manual | Form inline (nombre, alias, slug, relación, categoría, **cadencia**, confianza, importancia, etc.). Guardar → `updatePerson` (store → Supabase). |
| **Exportar / Imprimir dossier** | ⚙️ | `window.print()` con CSS de print. |
| **Registros CSV** / **Observaciones CSV** | 🗄️ | Descarga client-side de logs / observaciones. |

---

## 1) Columna principal (en orden de aparición)

### A — Síntesis y estado del vínculo

**1. ResumenPersona** — ⚙️ Computada (`buildPersonSummary`)
Franja de vistazo al tope: score, última interacción, próxima fecha, fase del ciclo, próxima acción. Sin botones. **Siempre.**

**2. EstadoConPersona** — 🤝 Híbrida (⚙️ base + 🤖 prosa cacheada 24h)
Etiqueta general + insights (tono, delta, vencidos, ciclo) y opcional síntesis en prosa. Botones: **Análisis con IA**, **Regenerar**. Panel siempre; botón IA solo si hay datos.

**3. SemanaConPersona** — ⚙️ Computada
Timeline de 7 días con ciclo, tono y moments por día. Sin botones. **Condicional** (se oculta si los 7 días están vacíos).

**4. RecomendacionesSemanales** — 🤖 IA (cacheada por semana)
3-5 acciones concretas para la semana, con checkbox. Botones: **Pedir sugerencias**, **Regenerar**, **click en cada ítem** (marca hecho). Siempre montada; lista si hay recos.

**5. PatronesCiclo** — ⚙️ Computada
Moments por fase de ciclo/luna + tono por fase. Sin botones. **Condicional** (≥3 moments c/ciclo, ≥5 c/luna, o ≥5 logs de tono).

**6. PendientesConPersona** — 🗄️ DB + urgencia computada
Moments abiertos por urgencia. Botones: **Resolver** → textarea → **Marcar resuelto** (PATCH) · **Cancelar** · **Ver todos**. **Condicional** (oculto sin moments abiertos).

**7. RelationalHealthCard "Salud del vínculo"** — ⚙️ Computada (`assessLinkHealth`)
Guía cualitativa (tono, cadencia, modo afectivo/profesional). **Sin score visible (línea ética).** Sin botones. **Condicional** (si hay algo que sugerir).

**8. RelationalEnergyCard** — ⚙️ Computada (`readRelationalEnergy`)
Si la persona drena/energiza, corroborado con tus self-metrics. Sin botones. **Condicional** (impacto no neutral).

**9. RelationalBidCard** — ⚙️ Computada (`suggestMicroBid`)
UN gesto concreto de mantenimiento. Sin botones. **Condicional** (si hay gesto).

### B — Contacto y conversación

**10. ContactWindowBadge** — ⚙️ Computada (+ 🗄️ una señal de conflictos)
"¿Buen momento para escribirle?" — estado + razón + tono sugerido (cruza último contacto, fechas, ciclo, tono, importancia + `/api/moments` para conflictos). Sin botones. **Siempre** (default "Cuando quieras").

**11. BondEvolutionPanel** — ⚙️ Computada sobre 🗄️ DB (`person_score_snapshots`)
"Evolución del vínculo": tendencia + delta + quiebres reales del score. Sin botones. **Siempre** (empty state si falta historial).

**12. ConversationAnalyticsCard "Pulso de la conversación"** — ⚙️ Computada (C0) sobre mensajes 📸 extraídos
Volumen + changepoint, cadencia, balance, latencia, tono, temas que suben + **insight sintetizado** ("abrís vos pero se engancha"). **CERO LLM.** Sin botones. **Condicional** (≥6 mensajes).

**13. MencionadasPanel** — ⚙️ Computada (parsing) sobre datos ✍️/📸
Terceros detectados en fechas importadas (ej. "sobrino de X"). Botones: **Crear** · **Vincular** · **Descartar** · input nombre + select tipo. **Condicional** (si hay menciones sin manejar).

**14. CicloPanel** — ⚙️ Computada sobre datos ✍️ manuales
Donut de fase menstrual, día del ciclo, PMS/fértil, anticipación de cuidado, atunamiento (solo pareja), próximo período. Sin botones (links a editar). **Condicional** (solo si `gender=female` o hay `cycleStartDate`).

**15. CorrelacionPanel** — 🤝 Híbrida (⚙️ base + 🤖 prosa on-demand)
Ánimo/energía/sueño/dolor por fase lunar y de ciclo (barras). Botón: **Lectura en prosa (IA)** (Claude, no cacheada). **Siempre** (empty si falta data; botón IA solo con data).

### C — Captura, registro y red

**16. AgregarCapturaPanel** — 🤖 IA + 📸 Extracción + ✍️ Manual
Agregar captura en contexto: **pegar texto** / **subir imágenes (+PDF)** / **conversación WhatsApp (.txt/.zip)**. Todo lo extraído pasa por Anthropic Vision/LLM (`/api/capture/process`, `/note`), audios por Whisper. Pantalla de revisión antes de guardar. Botones: tabs de modo, file inputs, checkboxes (audios/docs/stickers), **Confirmar y guardar** · **Descartar** · checklist de fechas. **Siempre.**

**17. RegistrarInteraccionPanel** — ✍️ Manual → 🗄️ DB
5 estados emocionales (💔→😊) + nota, para trackear el tono. Botones: 5 emociones · textarea · **Registrar interacción**. **Siempre.**

**18. MomentosPanel** — ✍️ Manual → 🗄️ DB
Momentos/decisiones abiertos y resueltos (multi-persona). Botones: **Registrar** · inputs título/detalle/fechas · buscador de co-participantes · **Guardar** · por fila **Resolver** (prompt) / **Borrar**. **Siempre.**

**19. PersonMoneyPanel** — ✍️ Manual → 🗄️ DB + ⚙️ totales
Plata por persona (le pasaste / te devolvió) con neto y pendiente. Botones: **registrar** · toggle dirección · inputs monto/fecha/concepto · **Guardar** · por fila **saldar** / borrar. **Condicional** (totales solo si hay movimientos).

**20. IdentidadesPanel** — ✍️ Manual → 🗄️ DB
Alias por red (WhatsApp/IG) para homologar imports a la persona. Botones: **Agregar** · select red + input · **Guardar** · X por badge. **Siempre.**

**21. NotaDeVozPanel** — ✍️ Manual (audio) → 🗄️ Storage
Grabador de nota de voz + playback. **NO transcribe** (audio crudo). Botones: **Grabar** / **Detener** · **Guardar** / **Descartar** · Play / borrar por nota. **Condicional** (mensaje si el navegador no soporta grabar).

**22. FamiliaPanel** — ✍️ Manual + ⚙️ sugerencias (puras, NO IA)
Familia como aristas reales del grafo (self↔persona + persona↔persona), bidireccional + sugerencias por inferencia. Botones: **Agregar** · "Es mi X" · buscador con autocompletar / **Crear nueva** · select parentesco · **Vincular** · sugerencias **Sí**/**Descartar** · X quitar. **Siempre.**

**23. ProfessionalLinksPanel** — ✍️ Manual (gemelo de Familia, SIN IA)
Vínculos profesionales/sociales como aristas. Botones: **Agregar** · buscador · select tipo · input contexto · **Vincular** · X quitar. **Condicional** (tras montar).

**24. NetworkPathsCard "Cómo llegar a X"** — ⚙️ Computada (`findBridges`)
Mutuos de tu red que la conocen, rankeados como puentes de presentación. Solo links de navegación. **Condicional** (oculto si nadie la conecta).

### D — Perfil, memorias e historial

**25. LoPersonal** — 🤖 IA-generada **(pre-derivada, cacheada)**
Síntesis narrativa de 3 párrafos del vínculo. Al render **solo lee** de `person_synthesis`; el LLM (Sonnet 4.5) corre al pulsar **Generar** / **Regenerar**. **Siempre** (empty si no hay conversaciones).

**26. CuratedObservationsPanel** — ⚙️ Computada sobre 🗄️ DB
Conteo de observaciones curadas por tipo (panel de validación del filtro `is_obsolete=false`). Sin botones. **Siempre.**

**27. WhatMattersChips "Qué le importa"** — ⚙️ Computada (`extractWhatMatters`)
Chips de temas recurrentes + tags. Sin botones. **Condicional** (oculto si no hay temas/tags).

**28. RelationalProfileCard** — 🤖 IA-generada **(on-demand, cache diaria)**
Perfil privado "cómo vincularte": apego, personalidad, valores, comunicación, próximo movimiento, qué no hacer. Botones: **Generar perfil** · **actualizar** (regenera). **Siempre** (perfil solo tras generar).

**29. BigFiveCard** — ✍️ Manual + ⚙️ score (NO IA)
Big Five (OCEAN) por **autoreporte** de la persona (test de 10 ítems), no inferencia. Botones: **Hacer el test** · 1–5 por ítem · **Guardar perfil** · Cancelar. **Condicional** (tras cargar).

**30. MemoriasAsociadasPanel** — 🗄️ DB al render + 🤖 acciones
Memorias destiladas por tipo (colapsadas) + privadas aparte. Al render **solo lee** `memories`. Botones: **Derivar desde conversaciones** (🤖 Claude) · **Actualizar memorias** (backfill idempotente) · filtros por tipo · **Ver todas** · toggle privadas · por memoria: marcar privada / descartar. **Siempre.**

**31. RehearsalHistoryPanel** — 🗄️ DB directa (lista ensayos LLM previos)
Histórico de simulaciones de la Sala de Ensayo con la persona, expandibles. Solo toggle expandir. **Condicional** (oculto si no hay ensayos).

---

## 2) Columna derecha (rail — "Línea de tiempo")

**LastInteractionPanel** — 📸 Extraída + ✍️ Manual (display puro)
Última interacción ("hace N días"): el chat WhatsApp capturado o el registro manual, el más reciente; muestra últimos 6 mensajes verbatim o el resumen. Toggle `<details>`. **Siempre.**

**HistorialSearch** — 🗄️ DB + ⚙️ búsqueda
Buscador full-text del historial archivado (`conversation_archives`), con snippets fechados. Input + **Buscar**. **Siempre** (aviso si no hay archivo).

**AnotarAhora** — ✍️ Manual → 🗄️ DB
Registro rápido de una nota del momento.

**Bitacora** — 🗄️ DB directa (display puro)
Timeline unificado y cronológico de TODO: person_logs + observations + snapshots de notas + moments (omite memorias, tienen su panel). Botones: colapsar · **Ver todas** · por observación: descartar / regenerar summary. **Siempre.**

**RelationalFlagsCard** — ⚙️ Computada (`detectRelationalFlags`)
Red flags recurrentes de auto-protección detectadas en TUS notas (no diagnostica a la persona). Sin botones. **Condicional** (solo si hay recurrencia, nunca por una nota suelta).

---

## 3) Resumen por fuente

| Fuente | Componentes |
|---|---|
| 🤖 **IA en vivo (on-demand)** | Briefing IA (efímero), Estado (prosa), Recomendaciones, Correlación (prosa), Captura (extracción), Lo personal (generar), Perfil relacional, Memorias (derivar) |
| ⚙️ **Motor puro (nunca IA)** | ResumenPersona, SemanaConPersona, PatronesCiclo, Salud del vínculo, Energía, Bid, ContactWindow, Evolución del vínculo, Pulso de conversación, Mencionadas, Ciclo, Correlación (base), Network paths, Qué le importa, Curated obs, Flags relacionales, Historial (búsqueda) |
| ✍️ **Manual / 🗄️ DB** | Pendientes, Registrar interacción, Momentos, Plata, Identidades, Nota de voz, Familia, Vínculos profesionales, Big Five, Última interacción, Bitácora |
| 🤖→🗄️ **Pre-derivado (LLM antes, se lee al render)** | Lo personal (synthesis), Memorias asociadas |

---

_Generado por SIR (clasificado leyendo el código real, 2026-07-07)._
