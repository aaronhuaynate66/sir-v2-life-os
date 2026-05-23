# 02 — MEMORY SYSTEM
# SIR V2 — Sistema de Memoria

---

## Filosofía de la Memoria

SIR V2 no intenta recordar todo. Intenta recordar lo que importa.

La memoria es selectiva, contextual y evolutiva.
Lo que recuerdo hoy puede ser interpretado diferente mañana.

---

## Tipos de Memoria

### Memoria Episódica
Registro de eventos específicos con contexto temporal.
- ¿Qué pasó?
- ¿Cuándo?
- ¿Con quién?
- ¿Cómo me sentí?
- ¿Qué aprendí?

### Memoria Semántica
Conocimiento abstracto derivado de múltiples episodios.
- Patrones que se repiten
- Verdades personales validadas
- Modelos mentales propios
- Reglas de vida derivadas de experiencia

### Memoria Emocional
Registro del impacto emocional de eventos.
- Qué genera paz / estrés / alegría / miedo
- Qué personas me energizan o drenan
- Qué situaciones activan mis ciclos negativos
- Qué recuerdos tienen carga emocional alta

### Memoria Relacional
Contexto acumulado de cada relación.
- Historia de la relación
- Momentos importantes compartidos
- Patrones de interacción
- Deudas simbólicas y reciprocidad
- Última interacción y su calidad

### Memoria Temporal
Registro con dimensión temporal explícita.
- Qué pensaba hace 6 meses
- Cómo ha evolucionado un objetivo
- Ciclos estacionales en mi comportamiento
- Predicciones pasadas y su resultado

### Memoria Predictiva
Anticipaciones basadas en patrones históricos.
- Si X sucede, probablemente Y sigue
- Esta persona tiende a comportarse así en Z situación
- En estos meses mi energía suele bajar
- Este tipo de decisión me suele costar Z

---

## Qué Recordar

**Siempre recordar:**
- Eventos relacionales importantes (cumpleaños, cambios de vida, conflictos, acuerdos)
- Decisiones importantes y su contexto
- Estados emocionales significativos
- Datos biológicos clave (salud, sueño, energía)
- Movimientos financieros significativos
- Objetivos y su evolución
- Señales detectadas y lo que resultaron ser

**Recordar selectivamente:**
- Conversaciones con contexto importante
- Reflexiones y insights personales
- Feedback recibido
- Sincronías y patrones curiosos

---

## Qué Resumir

Después de N días/semanas, resumir:
- Episodios del período
- Evolución del estado emocional
- Progreso en objetivos
- Cambios relacionales
- Insights generados

---

## Qué Olvidar

El sistema debe poder "olvidar" activamente:
- Datos que ya no son relevantes
- Ruido sin señal
- Información desactualizada que puede distorsionar el modelo actual
- Patrones que han sido superados

El olvido no es pérdida. Es limpieza cognitiva.

---

## Estructura de Memoria

```typescript
interface Memory {
  id: string
  type: MemoryType        // episodic | semantic | emotional | relational | temporal | predictive
  content: string
  entities: string[]     // personas, lugares, temas relacionados
  emotionalCharge: number  // -1 a 1 (negativo a positivo)
  importance: number     // 0 a 10
  timestamp: Date
  lastAccessed: Date
  decayRate: number      // qué tan rápido pierde relevancia
  tags: string[]
  relatedMemories: string[]
}
```
