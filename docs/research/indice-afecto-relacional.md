# Índice de Afecto Expresado (IAE) — investigación

> ¿Se puede medir el cariño en una relación por la frecuencia de palabras/frases
> afectivas ("te amo", "te quiero") en la mensajería a lo largo del tiempo?
> Investigación con base científica + relevamiento de software + plan de aplicación
> sobre SIR. Fecha: 2026-07-23.

## TL;DR honesto

Sí hay base científica para **piezas** del problema (la positividad predice
estabilidad — Gottman; el estilo lingüístico compartido predice duración —
Pennebaker/LSM; la comunicación afectuosa correlaciona con satisfacción y salud —
Floyd). **Pero NO existe estudio validado que establezca que "menos 'te amo' en el
chat = menos amor", ni que una caída semanal en mensajes cariñosos sea señal
temprana confiable de deterioro.** La teoría dominante (Floyd, Postulado 2) dice
explícitamente que **afecto expresado ≠ afecto sentido**. Lo defendible es un
índice de *afecto expresado* como **disparador suave de conversación**, con
detección de anomalías bien calibrada y muchas advertencias — nunca un veredicto.

Y un dato duro para la ansiedad: **una semana no alcanza para concluir nada**
(n≈7 ni siquiera permite estimar la varianza; se necesitan ≥21–28 días de línea
base). Además, el amor romántico *persiste* en relaciones largas mientras la
expresión apasionada se habitúa (Acevedo & Aron 2009): menos "te amo" es
compatible con habituación sana **y** con deriva real — la frecuencia sola no las
distingue.

---

## 1. Base científica

### Gottman — ratio de positividad
- **Magic ratio 5:1** (positivas:negativas) en parejas estables *durante conflicto*
  de laboratorio; parejas rumbo a ruptura ~0.8:1. Fuente: Gottman (1994),
  *What Predicts Divorce?*; divulgación en Gottman & Silver (1999).
- **Four Horsemen** (lo negativo): crítica, desprecio (el predictor más fuerte),
  defensividad, stonewalling.
- ⚠️ Las cifras de predicción "90%+" son discriminación *dentro de muestra*, nunca
  validadas cruzadamente (crítica decisiva: Heyman & Slep 2001). El "86%/33%" de
  *bids* y el "0.8:1" vienen de libros de divulgación, no de journals.
- **Uso:** valida el **principio del balance positivo:negativo** (un *ratio*, no un
  conteo absoluto), con referencia ≈5:1. No trasplantar el 5:1 como umbral literal
  a chat (se midió en conflicto presencial codificado).

### Pennebaker / LIWC — we-talk y Language Style Matching
- **We-talk** (uso de "nosotros") predice funcionamiento relacional: efecto pequeño
  pero fiable **r ≈ .075–.10** (efectos fijos); el we-talk *de la pareja* predice
  más que el propio. Meta-análisis: Karan, Rosenthal & Robbins (2019, *JSPR*).
- **Language Style Matching (LSM)** — sincronía en palabras funcionales, más difícil
  de fingir que "te amo". Fórmula (Ireland & Pennebaker 2010, *JPSP*):

  ```
  LSM_cat = 1 − |cat1 − cat2| / (cat1 + cat2 + 0.0001)
  LSM = promedio de las 9 categorías (pronombres, artículos, auxiliares,
        adverbios alta-frec, preposiciones, conjunciones, negaciones,
        cuantificadores, pron. impersonales)
  ```
  Predice estabilidad: speed-dating **OR=3.05**; mensajería a 3 meses **OR=1.95**
  (76.7% sobre la mediana seguían juntos vs 53.5% bajo).
- **LIWC** operacionaliza afecto como **% de tokens que matchean un diccionario**
  (`posemo`/`tone_pos`); "love" ∈ posemo. Esa es la definición canónica de "densidad
  de afecto".

### Floyd — Affection Exchange Theory
- El afecto expresado **se mide por frecuencia de conductas** (Affectionate
  Communication Index: verbal / no-verbal / apoyo). Correlaciona con bienestar
  **r≈0.24** (Hesse et al. 2021); el afecto *compartido* es el más fuerte (r≈0.28).
- **~45% del afecto expresado es heredable** (gemelos, Floyd 2020) → **líneas base
  personales, no umbrales universales.**
- **Postulado 2 (el límite clave):** sentir y expresar afecto *pueden* covariar,
  pero no necesariamente. El chat capta solo la porción verbal-mediada.

### Mensajería y satisfacción
- Expresar afecto por texto ↑ apego percibido (Schade 2013); "expresar afecto" es
  de las razones #1 para textear (Coyne 2011).
- Asimetría: el afecto **positivo** por texto ayuda, pero **frecuencia alta de
  texting** y el conflicto por texto se asocian a *menor* calidad (Halpern & Katz
  2017, el diseño más causal). Las llamadas se asocian a más amor que los textos.
- **Hueco de la literatura:** no hay estudio peer-reviewed sólido de que una *caída*
  en afecto textual sea señal temprana validada de deterioro. Lo más cercano es de
  ciencias de la computación (Garimella 2014, arXiv) — sugerente, no validado.

---

## 2. Software / recursos (relevamiento OSS)

**No existe herramienta OSS madura** que mida cariño de pareja por frecuencia de
palabras en el tiempo. Lo que hay: analizadores genéricos de WhatsApp con
sentimiento léxico superficial, notebooks personales, y demos de curso. **El
sentimiento por léxico en español está confirmado como débil.**

- **Parseo:** `whatstk` (Python, GPL, mantenido) o el import de WhatsApp que SIR ya
  tiene. `chat-analytics` (AGPLv3) útil solo para estudiar su UX de timeline.
  `RajeebLochan/Whatsapp_analysis` (MIT) valida la arquitectura mood-trend con LLM
  en español — leer por ideas, no como dependencia.
- **Léxicos ES:** SEL (nativo, ponderado, clase "alegría"), ML-SentiCon (MIT, solo
  polaridad), NRC/LIWC/pysentimiento (no comercial o de pago). **Ninguno tiene una
  clase "amor/cariño" buena → el léxico bespoke peruano hecho a mano es donde vive
  la señal real.**
- **Sentimiento ES:** el camino primario es **LLM barato vía OpenRouter** (maneja
  jerga peruana, emojis, sarcasmo, etiqueta "cariño" custom, comercial-seguro).
- **Series/anomalías (JS/TS):** `simple-statistics` (ISC, mantenido) + ~15 líneas
  propias (z modificado con mediana+MAD, EWMA, regresión lineal para tendencia).

---

## 3. Qué ya tiene SIR (construir encima, no desde cero)

- **`chat_messages`** (mig 0141): mensajes a nivel individual — `sender` (`user`=Aaron
  / `other`=la persona), `sent_at`, `content` completo, `person_id`. Índice por
  `(user_id, person_id, sent_at)`; FTS en español. Lectura:
  `fetchChatMessages()` en `src/lib/chat-messages/read.ts` (falta un wrapper por
  ventana `[desde,hasta]` — trivial).
- **Léxico afectivo YA escrito:** `src/lib/capture/interactionTone.ts`
  (`POSITIVE_ROOTS`: cariño/afecto/amor/abrazo/calidez…) y
  `src/lib/conversation-analytics/analyze.ts` (POS/NEG + emojis ❤️🥰).
- **Patrón de señales diarias a clonar:** `buildDailySignals()` en
  `src/lib/forecast-conductual/dailySignals.ts` (agrupa por día, cuenta hits de
  léxico, normaliza). **Hoy NO hay señal `affection`** — solo fricción/retiro/
  sensibilidad. Ese es el hueco que llena el IAE.
- **Persistencia:** columna `affection` aditiva en `person_daily_signals` (mig 0135).
- **UI natural:** tab "Conversación" de `PersonDetail.tsx` (ya monta un `TrendChart`
  "Tono de interacción") → un `TrendChart` "Afecto expresado" al lado.
- **LLM barato:** `complete({task:'classify', tier:'cheap'})` para calibración
  opcional; pero el camino léxico puro ya es el dominante del repo (0 costo/latencia,
  determinístico, testeable).
- ⚠️ Verificar en Diana que `sender='other'` = ella (fix del "autor invertido").

---

## 4. Fórmula propuesta (IAE)

Disparador de conversación, no veredicto. Construida sobre lo respaldado: densidad
de afecto (LIWC), ratio de positividad (Gottman), detección robusta para series
cortas de conteo.

**Paso 1 — puntaje diario** (mensajes enviados por la persona):
```
A_d = 3·E_d + 2·P_d + 1·M_d + 0.5·O_d
  E = frases explícitas ("te amo", "te quiero", "mi amor")
  P = apodos / pet names
  M = emojis de cariño (❤️😘🥰😍)
  O = otras posemo/afiliación (extraño, gracias, contigo)
  (pesos ilustrativos; fijarlos una vez, no cambiarlos retroactivo)
```

**Paso 2 — normalizar por volumen** (densidad, no verborrea):
```
AD_d = A_d / (T_d + k0)      T_d = mensajes/tokens del día, k0≈5
```

**Paso 3 — ratio Gottman (contexto):**
```
PR_d = (A_d + 1) / (N_d + 1)    N_d = marcadores negativos
```

**Paso 4 — línea base personal robusta** (≥21–28 días; <14 = provisional):
```
m̃ = mediana(AD);  MAD = mediana(|AD − m̃|);  σ_rob = 1.4826·MAD  (con piso)
```

**Paso 5 — detección de deriva sostenida** (no un día malo):
```
y_d = 2·√(AD_d + 3/8)                     # estabiliza varianza (Poisson)
S_d = 0.2·y_d + 0.8·S_{d-1}               # EWMA
alarma si S_d < μ_y − 3·σ_y·√(0.2/1.8)  Y  se mantiene ≥3 días
```

**Paso 6 — z semanal interpretable:**
```
z_w = (IAE_w − m̃_sem) / σ_rob_sem     alarma sólo z_w < −2 (no −1.6)
```

**Reglas no negociables (ética):**
- Umbrales **personales**, nunca poblacionales.
- Framing como **pregunta**, no diagnóstico: *"esta semana hubo menos cariño que tu
  promedio — ¿todo bien o solo ocupado?"* Nunca "tu pareja te quiere menos".
- Sobre **los propios mensajes con consentimiento**, no vigilancia de la pareja
  (Tokunaga 2011: vigilar es síntoma de inseguridad y es auto-cumplido — puede
  *crear* la distancia que teme).
- Combinar con señales menos falsificables (LSM, ratio positividad:negatividad).
- **Declarar la incertidumbre:** ningún estudio valida "caída de afecto textual =
  deterioro"; es un heurístico por analogía.

---

## 5. Plan de aplicación en SIR (propuesto)

1. **Lexicón** de cariño peruano (extender `interactionTone.ts`: apodos, "mi amor",
   "mi vida", "bb", diminutivos, emojis).
2. **Lib pura** `buildAffectionSeries(messages)` clonando `buildDailySignals` →
   `AD_d`, `PR_d`. Tests con casos reales.
3. **Detección** (`simple-statistics`): z modificado + EWMA + persistencia 3 días.
4. **Endpoint + persistencia** (columna `affection` en `person_daily_signals`).
5. **UI**: `TrendChart` "Afecto expresado" en la tab Conversación de la ficha, con el
   framing de pregunta y la línea base personal. Mostrar "provisional" con <21 días.
6. (Opcional) que SIR lo mencione en el chat con el mismo tono de pregunta.

### Fuentes clave
Gottman (1994); Gottman & Levenson (1992, 2000); Heyman & Slep (2001, crítica);
Ireland & Pennebaker (2010, LSM); Ireland et al. (2011); Karan, Rosenthal & Robbins
(2019, we-talk); Floyd (2006, AET; 2002, TAS); Floyd & Morman (1998, ACI); Hesse et
al. (2021, meta); Coyne et al. (2011); Schade et al. (2013); Halpern & Katz (2017);
Acevedo & Aron (2009); Impett, Park & Muise (2024, crítica love languages);
Tokunaga (2011, vigilancia); Iglewicz & Hoaglin (1993, MAD); Roberts (1959, EWMA).
