# 03 — SELF MODEL
# SIR V2 — Modelo Dinámico del Self

---

## Filosofía

SIR V2 construye un modelo dinámico de mí. No un perfil estático.
El modelo se actualiza con cada dato, cada evento, cada señal.

El objetivo no es etiquetarme. Es entenderme.

---

## Perfil Psicológico

```typescript
interface PsychologicalProfile {
  mbti?: string              // Tipo MBTI si validado
  attachmentStyle: string    // secure | anxious | avoidant | disorganized
  coreValues: string[]       // valores más importantes
  coreBeliefs: string[]      // creencias fundamentales
  limitingBeliefs: string[]  // creencias que me frenan
  decisionStyle: string      // analytic | intuitive | collaborative | decisive
  conflictStyle: string      // avoiding | competing | collaborating | accommodating
  motivators: string[]       // qué me mueve profundamente
  stressors: string[]        // qué me genera más estrés
  defenseMechanisms: string[] // cómo me defiendo bajo presión
}
```

---

## Perfil Biológico

```typescript
interface BiologicalProfile {
  age: number
  weight: number
  height: number
  bloodType?: string
  chronicConditions: string[]
  medications: string[]
  allergies: string[]
  sleepBaseline: number      // horas óptimas de sueño
  energyCycleType: string    // morning | evening | variable
  exerciseCapacity: string   // sedentary | light | moderate | high | athlete
  nutritionApproach: string  // omnivore | vegetarian | etc
}
```

---

## Perfil de Rendimiento

```typescript
interface PerformanceProfile {
  peakHours: string[]        // horas del día de mayor rendimiento cognitivo
  focusCapacity: number      // minutos de focus profundo sostenido
  recoveryTime: number       // horas necesarias después de evento estresante
  multitaskingTolerance: string // low | medium | high
  creativePeakConditions: string[]
  decisionFatigue: number    // cuántas decisiones importantes por día
}
```

---

## Perfil Emocional

```typescript
interface EmotionalProfile {
  dominantEmotions: string[]     // emociones más frecuentes
  emotionalRange: string         // narrow | moderate | wide
  regulationAbility: string      // low | developing | good | excellent
  empathyLevel: string           // low | medium | high | empathic
  emotionalTriggers: string[]    // qué me activa emocionalmente
  emotionalAnchors: string[]     // qué me estabiliza
  griefPatterns: string[]        // cómo proceso pérdidas
}
```

---

## Hábitos

```typescript
interface HabitProfile {
  morningRoutine: string[]
  eveningRoutine: string[]
  weeklyRhythm: Record<string, string[]>
  productiveHabits: string[]
  destructiveHabits: string[]
  habitsInProgress: string[]    // hábitos que estoy construyendo
  habitsToEliminate: string[]   // hábitos que quiero eliminar
}
```

---

## Sueño

```typescript
interface SleepProfile {
  averageHours: number
  sleepQuality: number       // 0 a 10
  sleepIssues: string[]      // insomnio, apnea, etc.
  optimalBedtime: string
  optimalWakeTime: string
  napHabits: string
}
```

---

## Identidad

```typescript
interface IdentityProfile {
  coreIdentity: string          // cómo me defino en una frase
  roles: string[]               // hijo, emprendedor, amigo, etc.
  aspirationalIdentity: string  // quién quiero ser
  identityGaps: string[]        // distancia entre quién soy y quién quiero ser
  proudOf: string[]             // de qué estoy orgulloso
  ashamed: string[]             // qué llevo con vergüenza o peso
  mission: string               // mi misión de vida actual
}
```

---

## Evolución Personal

El Self Model no es estático. Registra la evolución:

```typescript
interface SelfEvolution {
  snapshots: SelfSnapshot[]    // fotos del self en diferentes momentos
  majorShifts: MajorShift[]   // cambios importantes en identidad o perspectiva
  growthAreas: string[]       // áreas donde estoy creciendo
  stagnationAreas: string[]   // áreas donde estoy estancado
}
```
