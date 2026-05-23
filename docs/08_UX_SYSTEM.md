# 08 — UX SYSTEM
# SIR V2 — Sistema de Experiencia de Usuario

---

## Filosofía Visual

SIR V2 no es un dashboard. Es un Mission Control.

La diferencia:
- Un dashboard muestra métricas → SIR V2 revela contexto
- Un dashboard actualiza en tiempo real → SIR V2 muestra lo que importa
- Un dashboard es para muchos → SIR V2 es solo para mí

---

## Principios de Diseño

1. **Silencio visual** — el espacio vacío es parte del diseño
2. **Dark por defecto** — protege la energía cognitiva
3. **Premium sin ostentación** — elegante, sobrio
4. **Un foco a la vez** — la pantalla principal tiene un solo mensaje primario
5. **Estabilidad sobre dinamismo** — no animaciones innecesarias
6. **No SaaS** — sin métricas vacías, sin gamification, sin onboarding

---

## Paleta de Color

```css
--background: #0a0a0a      /* negro casi puro */
--surface: #111111         /* superficie principal */
--surface-raised: #1a1a1a  /* superficie elevada */
--border: #222222          /* bordes sutiles */
--text-primary: #f5f5f5    /* texto principal */
--text-secondary: #888888  /* texto secundario */
--text-muted: #444444      /* texto muted */
--accent: #3b82f6          /* azul para acción */
--peace: #22c55e           /* verde para paz/ok */
--warning: #f59e0b         /* ámbar para alerta */
--danger: #ef4444          /* rojo para crítico */
--gold: #d4af37            /* dorado para premium */
```

---

## Mission Control — Vista Principal

Layout:

```
┌─────────────────────────────────────────┐
│ MISIÓN: Conseguir Paz         ● LIVE    │
├──────────────┬──────────────────────────┤
│              │                          │
│  PEACE       │   RECOMENDACIÓN          │
│  SCORE       │   PRINCIPAL              │
│    7.2       │                          │
│              │   → [acción concreta]    │
├──────────────┤                          │
│  ESTADO      │                          │
│  OPERATIVO   ├──────────────────────────┤
│              │   SEÑAL ACTIVA           │
│  ● Estable   │   ⚠ [señal relacional]   │
├──────────────┴──────────────────────────┤
│  BLOQUE ACTUAL    │   OBJETIVO CLAVE    │
│  14:00 - 16:00    │   [objetivo #1]     │
├───────────────────┼─────────────────────┤
│  BIOLOGÍA         │   FINANZAS          │
│  Sueño: 6.5h      │   Score: Estable    │
│  Energía: 7/10    │   [alerta si hay]   │
└───────────────────┴─────────────────────┘
```

---

## Recovery Mode

Cuando el Peace Score < 4, la UI entra en Recovery Mode:

- Fondo más oscuro, casi negro puro
- Solo se muestra: Peace Score + una sola recomendación
- Todo lo demás se oculta
- Mensaje: "Estás en modo recuperación. Un paso a la vez."
- Color de acento: ámbar suave en lugar de azul

---

## Vistas del Sistema

### Vista Hoy (Dashboard Principal)
- Peace Score
- Bloque actual
- Recomendación del día
- Señales activas
- Biología básica
- Alerta financiera si hay

### Vista Relaciones
- Lista de personas clave con estado
- Señales relacionales activas
- Próximas fechas importantes
- Relaciones que necesitan atención

### Vista Objetivos
- Objetivos activos con progreso
- Próximas acciones
- Alineación con paz

### Vista Finanzas
- Score de estabilidad financiera
- Movimientos del período
- Alertas
- Proyección simple

### Vista Biología
- Registro de sueño
- Métricas de salud
- Tendencias de energía

---

## Tipografía

```css
font-family: 'Inter', system-ui    /* texto principal */
font-family: 'JetBrains Mono'      /* datos, métricas */

/* Escala */
--text-xs: 0.75rem
--text-sm: 0.875rem
--text-base: 1rem
--text-lg: 1.125rem
--text-xl: 1.25rem
--text-2xl: 1.5rem
--text-display: 3rem   /* para números grandes como Peace Score */
```

---

## Animaciones (Framer Motion)

Principio: animaciones que respiran, no que bailan.

- **Entrada de cards**: fade in + slide up suave (duration: 0.3s)
- **Cambio de vista**: crossfade (duration: 0.2s)
- **Peace Score change**: número que se desliza (spring animation)
- **Recovery Mode**: transición gradual de oscurecimiento
- **Señal nueva**: pulse suave una sola vez

NO usar:
- Animaciones de loop continuo
- Efectos de confetti o celebración excesiva
- Transiciones de página complejas
