# 00 — MASTER SYSTEM
# SIR V2 — Life Operating System

> **Objetivo raíz: Conseguir Paz.**

---

## Visión

SIR V2 es un sistema operativo cognitivo-relacional privado.
No es una app. No es un dashboard SaaS. No es un CRM.

Es la infraestructura mental que me permite operar mi vida con claridad, intención y estabilidad.

## Qué ES SIR V2

- Mi segundo cerebro personal
- Mi sistema operativo cognitivo-relacional  
- Mi Mission Control de vida
- Mi sistema de inteligencia personal, relacional y financiera
- Mi motor de paz mental

## Qué NO es SIR V2

- No es un startup ni SaaS
- No es un CRM ni red social
- No es un dashboard genérico
- No es público

## Filosofía

Datos → Señales → Contexto → Memoria → Timing → Recomendación → Acción

## Sistemas

1. Self System
2. Relationship System
3. Goal System
4. Signal Engine
5. Memory System
6. Context Engine
7. Timing Engine
8. Financial System
9. Biological System
10. Peace Engine
11. AI Brain
12. Self Model Engine
13. Temporal Engine
14. Recommendation Engine
15. Knowledge Graph

## Principios

1. Privacidad total
2. Silencio visual
3. Contexto primero
4. Paz como norte
5. Evolución continua
6. Timing sobre velocidad
7. Relaciones como sistema
8. Biología como base
9. Finanzas como libertad
10. Identidad como ancla

---

## Mapa de la carpeta (base científica)

La base científica de SIR vive ordenada en estos docs. **00–09** son el núcleo
del sistema; **10–15** profundizan la mente cognitiva (cada uno con "qué construir
por partes" + su señal de confianza, listos para implementar por módulos).

| Doc | Qué es |
|---|---|
| `00_MASTER_SYSTEM` | Este mapa: visión, sistemas, principios. |
| `01_COGNITIVE_ARCHITECTURE` | Cómo piensa SIR: pipeline de 9 capas (bucle cerrado), decisión, prioridades, principios transversales. |
| `02_MEMORY_SYSTEM` | Memoria episódica/semántica + cross-session. |
| `03_SELF_MODEL` | Modelo dinámico del self ("cómo venís"). |
| `04_AI_BRAIN` | Cerebro-grafo tipado (F1 proyección, F2 difusión, F3 Hebbian, F4 surfacing). |
| `05_TECHNICAL_ARCHITECTURE` | Stack, motores puros, patrón de implementación. |
| `06_DATA_MODEL` | Tablas y relaciones. |
| `07_SIGNAL_ENGINE` | Percepción: señales y capturas. |
| `08_UX_SYSTEM` | Reglas de UX (aditivo, nunca formularios vacíos). |
| `09_ROADMAP` | Rumbo de producto. |
| **`10_COGNITIVE_PERSONAS`** | Las 12 lentes en profundidad: marco, cuándo se activa, modo de falla. |
| **`11_CHRONOBIOLOGY`** | Sueño/energía: cronotipo, curva intradía, jet-lag social. |
| **`12_BEHAVIOR_CHANGE`** | Hábitos: señal→prompt, fricción, drift (Fogg, WOOP, SDT). |
| **`13_EMOTION_REGULATION`** | Ventana de tolerancia, reevaluación, HRV (Gross, Barrett). |
| **`14_DECISION_SCIENCE`** | Sesgos, premortem, reversibilidad (Kahneman, Bezos, Klein). |
| **`15_RELATIONAL_INTELLIGENCE`** | El norte: Dunbar, reciprocidad, salud del vínculo (apego, Gottman). |
| **`16_INFLUENCE_SOCIAL_INTELLIGENCE`** | Posicionarte con ética: influencia (Milgram, Zimbardo, Cialdini), agenda-setting, inteligencia social + defensa contra manipulación. |
| **`17_MENSTRUAL_CYCLE`** | Ciclo menstrual: fases, ventana PMS/fértil, trazabilidad por fecha y predicción — para cuidar mejor, nunca para descalificar. |
| **`18_EXTERNAL_SIGNALS`** | Señales externas: el afuera (dólar, clima, eventos) cruzado con tu contexto. Externo × interno = señal; externo solo = ruido. |
| **`19_RELATIONAL_PROFILING`** | Leer a la persona: apego, personalidad, valores + modo "explorar hipótesis" — para vincularte/protegerte, nunca para etiquetar/diagnosticar. |
| **`20_STRATEGIC_AGENCY_POLICY`** | Política de agencia estratégica: cuándo y cómo SIR actúa/recomienda con intención, dentro de la línea ética (influencia genuina + defensa, nunca manipulación). |

Operativos (no base científica): `ESTADO_ACTUAL` (estado vivo + backlog),
`BUILD_PLAN`, `AARON_OS_INVENTORY`, `STRATEGIC_ROADMAP`, `MIGRATIONS`, auditorías.

---

## Evolución de SIR (de la base científica a lo construido)

SIR no se construyó como app y después se le buscó sentido; se construyó **al
revés**: primero la base científica (docs 00–20), y sobre cada dominio se fueron
levantando módulos con su motor puro y su señal de confianza. Este es el arco.

### Capa 0 — Cerebro y arquitectura cognitiva
- **Pipeline de 9 capas** (doc 01): Datos → Señales → Contexto → Memoria → Timing → Recomendación → Acción, en bucle cerrado.
- **Cerebro-grafo tipado** (doc 04): `lib/brain` proyecta 14 tablas a aristas tipadas con peso base (**F1**), difunde activación por BFS con decaimiento (**F2**), refuerza/debilita por uso al estilo Hebbian (**F3**), y **surfacea** lo relevante en `/horario` (**F4**). Consolidación nocturna por cron (decae lo no reforzado).
- **Memoria** (doc 02): observaciones → memorias derivadas (idempotente), con memorias privadas/excluidas que no van a IA.

### Capa 1 — Percepción e ingesta (el afuera entra solo)
- **Captura sin fricción**: foto/screenshot → Visión (perfiles LinkedIn/IG, sueño, FC, báscula, medicación), texto pegado sin OCR, export de WhatsApp por bloques, multi-imagen → 1 observación.
- **Ingesta del entorno**: SIR Reader (extensión MV3, Teams/WhatsApp → SIR), correo M365 por Graph, grabador de llamadas (cortes 5min → Whisper), Apple Health (endpoint + import por archivo).
- **Señales externas** (doc 18): externo × interno = señal.

### Capa 2 — Motores de inteligencia
- **Motor de predicción (3 capas)**: C0 Pulso, C1 sueño/forecast/N-de-1 cruzado (sueño→energía r≈0.56), C2 trayectoria de vínculos.
- **Inteligencia relacional** (doc 15): reciprocidad por quality-delta, urgencia de contacto, rituales, esfuerzo ponderado por parentesco, Daily Actions.
- **Cronobiología del ciclo** (doc 17): fases + ventana PMS/fértil + predicción por fecha — para cuidar, nunca para descalificar.
- **Verificación** (doc 16): 23 técnicas de propaganda + alter ego filosófico (recomienda corriente por escenario).
- **Alignment engine**: objetivo ↔ comportamiento (aligned/drifting/needs_attention).

### Capa 3 — Superficie operativa
- **Horario cockpit**: brief del día/semana/mes, plan del día editable, cruce calendario × OKR × estado físico.
- **Objetivos SMART + OKR + tareas Jira-light**, TU AÑO (brújula anual), Forecast de fin de mes, Financial OS por intención.
- **Ficha de persona** (lo más reciente): rediseñada en **tabs**, **adaptativa por tipo de vínculo** (`fichaProfile`: Cuidado solo afectivo, comercial solo colega/lead), con el **Horizonte del ciclo** como módulo protagonista (timeline real/predicción + tono + ventanas + lecturas de cuidado).

### Línea ética (transversal, no negociable)
Docs 16/17/19/20: influencia genuina + defensa, **nunca manipulación**. En
vínculos afectivos se prioriza **cuidado, presencia y timing**, no gestión tipo
CRM. El ciclo se muestra para cuidar mejor, jamás para descalificar.

> El estado detallado (qué está en producción, qué falta, backlog priorizado)
> vive en `docs/ESTADO_ACTUAL.md`.
