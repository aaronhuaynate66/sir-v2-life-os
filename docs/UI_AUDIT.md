# SIR V2 — Auditoría UI (UX + Accesibilidad)

> Corrida el 2026-07-03 con dos agentes (UX Architect + Accessibility Auditor)
> sobre las superficies principales, con foco en la capa cognitiva nueva.
> Revisión estática de código (falta verificar con lector de pantalla real).

## A. UX / diseño / consistencia

### 🔴 Alto
1. **Tres "focos" compiten en /panel** — `WeekInFocusCard` ("Semana en foco"), `CognitiveFocusCard` ("Foco ahora") y el hero Peace Score ("Foco del día"). Viola el principio #4 (un foco a la vez). → Elegir UNO primario; que "Foco ahora" (el unificado) sea el hero o absorba "Foco del día"; renombrar para no repetir "foco".
2. **Redundancia de contenido** — `runCognitivePipeline` ingiere los mismos `threats`+`recs` que después se re-renderizan sueltos ("Atención" del Peace Score, "Foco del día"). Mismo dato 2-3 veces. → Si "Foco ahora" es el resumen, ocultar las listas duplicadas.

### 🟠 Medio
3. **Colisión de nombres cognitivos** — "Preguntá a SIR" (/sir), "Pensar con SIR" (botón reasoner), "Decidir" (/decidir) son indistinguibles. → Familia "Pensar" con verbos claros: *preguntar* (Q&A), *pensar* (multi-lente sobre tu estado), *decidir* (evaluar una decisión). Cambiar el botón a algo como "Verlo por las 12 lentes" + microcopy.
4. **PatronesPanel sobrecargado** — 5 secciones apiladas mezclando pasado (patrones observados) y futuro (Tu momento, Proyección, Madurez). → Separar en 2 cards: **"Lo que se observa"** vs **"Hacia dónde va"**.

### 🟡 Bajo
5. Microcopy "unificado · por prioridad" (CognitiveFocusCard) rompe el tono cálido → "lo que más pesa hoy".
6. CognitiveFocusCard desaparece en silencio si no hay foco (sin estado calibrando honesto como el resto).
7. /decidir no persiste decisiones (efímero) — considerar guardarlas como moment/memoria.

**Alto nivel:** un solo foco primario + resto on-demand; definir la "familia Pensar"; adoptar la convención *observar vs anticipar* de forma transversal.

## B. Accesibilidad (WCAG 2.1 AA)

### 🔴 Crítico
1. **Inputs sin label accesible** (solo placeholder) en flujos núcleo: /decidir (título+contexto), KnowledgeGapPanel, Registro rápido de /panel, input de /medicacion. WCAG 4.1.2 / 3.3.2. → `<label htmlFor>` o `aria-label`/`aria-labelledby`.

### 🟠 Alto
2. **Falta skip link** — ~30 links de nav antes del contenido. WCAG 2.4.1. → `<a href="#main" class="sr-only focus:not-sr-only">Saltar al contenido</a>` + `id="main"` en `<main>` (AppShell).
3. **Botón "Resolver" de señales invisible salvo hover** — `opacity-0 group-hover` no responde a foco de teclado. WCAG 2.4.7. → `focus-visible:opacity-100`.
4. **Contraste insuficiente** — `text-muted-foreground/60 /50 /40` en 10-11px (el propio globals.css lo documenta como ~3.4:1). WCAG 1.4.3. → usar `text-muted-foreground`/`text-text-tertiary` sólido en texto informativo.

### 🟠 Medio
5. **Jerarquía de headings rota** — rótulos de sección ("Foco ahora", "Patrones observados", SectionTitle…) son `<div>`, no `<h2>/<h3>`. WCAG 1.3.1. → componente `SectionHeading` semántico.
6. **Color como único indicador** — punto de urgencia rojo/ámbar sin texto/ícono. WCAG 1.4.1.
7. **Gráfico de barras de /medicacion sin alt textual** — datos solo en `title=` sobre `<div>`. WCAG 1.1.1. → `role="img"` + `aria-label` resumen, o tabla sr-only.
8. `Select` de tipo de movimiento sin nombre accesible; barras/medidores (ScoreBar, Madurez) sin `role="progressbar"`.

### 🟡 Bajo
9. Texto de 8px en el eje del gráfico de medicación; títulos de grupo de nav `<div>` + contraste /50.

**Bien (preservar):** `aria-current` en nav activo, íconos decorativos con `aria-hidden`, botones-ícono con `aria-label`, `:focus-visible` global, Sheet con título sr-only. `PersonDetail` usa `<Label htmlFor>` — es el patrón a replicar.

## Plan de fixes (ver BUILD_PLAN.md → U1/U2)
- **U1 (UX):** podar los 3 focos → 1 hero + quitar duplicados; renombrar la familia "Pensar"; split observar/anticipar en /salud. Esf M.
- **U2 (A11y):** labels en inputs núcleo + skip link + focus-visible del botón resolver + contraste del texto muted + `SectionHeading` semántico. Esf M, sistémico.
