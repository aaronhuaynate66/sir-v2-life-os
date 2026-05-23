# 07 — SIGNAL ENGINE
# SIR V2 — Motor de Señales

---

## Filosofía

Una señal es cualquier dato que indica algo relevante sobre el estado del mundo, de mis relaciones, de mi cuerpo o de mi mente.

El Signal Engine no genera ruido. Filtra y amplifica lo que importa.

---

## Tipos de Señales

### Señales Relacionales
- Alguien no ha respondido en X días (ruptura de patrón)
- Alguien que no contactaba aparece de repente
- Cambio en el tono o frecuencia de comunicación
- Ausencia en evento importante
- Comportamiento inusual detectado
- Escalada o des-escalada de intensidad relacional

### Señales Sociales (LinkedIn)
- Nueva posición o empresa
- Cambio de ubicación
- Publicación sobre tema relevante
- Logro o premio publicado
- Actividad inusual (muchos posts, silencio repentino)
- Conexión con persona relevante para mis objetivos

### Señales Sociales (Instagram)
- Cambio de vida visible (viaje, pareja, proyecto)
- Publicación emocionalmente significativa
- Interacción con mi contenido
- Silencio inusual
- Cambio de estilo o presentación

### Señales de Calendario
- Evento importante próximo (preparar)
- Aniversario o fecha especial de relación clave
- Período de baja energía histórica
- Fecha límite de objetivo
- Oportunidad temporal que se cierra

### Señales Biológicas
- Sueño por debajo del umbral óptimo X días seguidos
- Peso fuera de rango
- Energía cronicamente baja
- Frecuencia cardíaca en reposo elevada
- Patrón de estrés sostenido
- Señal positiva: recuperación completa

### Señales Financieras
- Gasto inusualmente alto en categoría X
- Ingreso por debajo de proyección
- Oportunidad de inversión detectada
- Riesgo de liquidez próximo
- Objetivo financiero en riesgo

### Señales Emocionales
- Peace Score bajo sostenido
- Patrón de mood negativo
- Estrés crónico sin resolución
- Alegría o energía inusualmente alta
- Ciclo emocional identificado

---

## Clasificación de Señales

```typescript
type SignalType = 
  | 'opportunity'   // algo que podría aprovechar
  | 'warning'       // algo que requiere atención
  | 'pattern'       // patrón repetido detectado
  | 'timing'        // momento oportuno
  | 'emotional'     // estado emocional significativo
  | 'relational'    // cambio en relación
  | 'biological'    // señal del cuerpo
  | 'financial'     // señal económica

type SignalUrgency = 
  | 'immediate'     // actuar hoy
  | 'soon'          // actuar esta semana
  | 'monitor'       // observar sin actuar
  | 'archive'       // registrar para contexto futuro
```

---

## De Señal a Contexto

```
SEÑAL RAW
    ↓
¿Es real o es ruido? (filtro de relevancia)
    ↓
¿Qué significa en el contexto actual?
    ↓
¿Hay señales relacionadas que la amplifican?
    ↓
¿Cuál es la urgencia?
    ↓
¿Requiere acción o solo registro?
    ↓
CONTEXTO ENRIQUECIDO
    ↓
→ Memory System (registrar)
→ Recommendation Engine (si requiere acción)
→ UI (si es urgente, mostrar en Mission Control)
```

---

## Combinación de Señales (Pattern Recognition)

El sistema detecta cuando varias señales se combinan:

Ejemplo: 
- Señal biológica: sueño bajo por 3 días
- Señal emocional: mood bajo
- Señal relacional: conflicto pendiente

→ PATRÓN: Estado de vulnerabilidad. No es momento para decisiones importantes.
→ RECOMENDACIÓN: Recovery mode. Priorizar sueño y reducir exposición al conflicto.

---

## Señales de Alta Prioridad

Señales que siempre generan alerta inmediata:
1. Peace Score < 3
2. Sueño < 4 horas por 3 días consecutivos
3. Objetivo crítico en riesgo de deadline
4. Relación clave en crisis detectada
5. Alerta financiera de liquidez
