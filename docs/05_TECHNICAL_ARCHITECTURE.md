# 05 — TECHNICAL ARCHITECTURE
# SIR V2 — Arquitectura Técnica

---

## Stack Actual (Fase 1)

```
Frontend:         Next.js 15 + React 18
Language:         TypeScript (strict)
Styling:          Tailwind CSS v4
Animation:        Framer Motion
State:            Zustand + Context API
Storage:          localStorage (inicial)
Deployment:       Vercel
Package Manager:  npm / pnpm
```

---

## Stack Futuro (Fase 4+)

```
Database:         PostgreSQL via Supabase
Vector DB:        pgvector (embeddings de memoria)
Auth:             Supabase Auth
Storage:          Supabase Storage
AI Gateway:       OpenRouter / AI SDK
LLMs:             OpenAI GPT-4o + Claude 3.5 + Groq (Llama)
Embeddings:       OpenAI text-embedding-3-small
Background Jobs:  Supabase Edge Functions
```

---

## Estructura del Proyecto

```
sir-v2-life-os/
├─ docs/                    # Documentación del sistema
├─ src/
│  ├─ app/                  # Next.js App Router
│  │  ├─ dashboard/         # Mission Control principal
│  │  ├─ layout.tsx
│  │  └─ page.tsx
│  │
│  ├─ components/           # Componentes de UI
│  │  ├─ dashboard/         # Componentes del dashboard
│  │  ├─ ui/                # Componentes base (atoms)
│  │  └─ shared/            # Componentes compartidos
│  │
│  ├─ engines/              # Lógica de negocio
│  │  ├─ self/
│  │  ├─ relationship/
│  │  ├─ goal/
│  │  ├─ signal/
│  │  ├─ memory/
│  │  ├─ context/
│  │  ├─ timing/
│  │  ├─ peace/
│  │  ├─ financial/
│  │  ├─ biological/
│  │  ├─ ai-brain/
│  │  └─ recommendation/
│  │
│  ├─ data/
│  │  └─ fixtures/          # Datos de ejemplo para testing
│  │
│  ├─ lib/                  # Utilidades y helpers
│  ├─ types/                # Tipos TypeScript globales
│  └─ styles/               # Estilos globales
│
├─ public/
├─ package.json
├─ tailwind.config.ts
├─ tsconfig.json
└─ README.md
```

---

## Data Flow

```
User Input / External Signal
        ↓
    Signal Engine (detecta y clasifica)
        ↓
    Context Engine (construye contexto)
        ↓
    Memory System (conecta con historia)
        ↓
    Self Model (actualiza modelo del usuario)
        ↓
    [Peace | Biological | Financial | Goal | Relationship] Engine
        ↓
    Timing Engine (evalúa cuándo actuar)
        ↓
    Recommendation Engine (genera recomendación)
        ↓
    AI Brain (razona y enriquece)
        ↓
    UI (Mission Control muestra)
```

---

## Engines

Cada engine tiene la misma estructura base:

```typescript
// types.ts — interfaces del engine
// engine.ts — lógica pura (funciones)
// index.ts  — exports públicos
```

Los engines son funciones puras cuando es posible.
No tienen efectos secundarios directos.
El estado se maneja via Zustand stores.

---

## Principios Técnicos

1. **Frontend-first** — la UI funciona antes del backend
2. **localStorage primero** — persiste datos localmente en fase inicial
3. **Type-safety total** — TypeScript strict, sin any
4. **Engines desacoplados** — cada engine es independiente
5. **Vercel-ready** — deployable inmediatamente
6. **Preparado para AI** — estructura lista para integrar LLMs
7. **No over-engineering** — solo la complejidad necesaria

---

## Stores Zustand

```typescript
useSelfStore()         // perfil y estado del self
useRelationshipStore() // personas y relaciones
useGoalStore()         // objetivos
useSignalStore()       // señales activas
useMemoryStore()       // memorias
usePeaceStore()        // peace score y recovery mode
useFinancialStore()    // datos financieros
useBiologicalStore()   // salud y sueño
useRecommendationStore() // recomendaciones activas
```
