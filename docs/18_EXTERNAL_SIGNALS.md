# 18 — SEÑALES EXTERNAS

SIR mira casi todo **hacia adentro** (tu sueño, ánimo, gente, plata, objetivos).
Las **señales externas** traen el afuera: eventos del mundo que pueden influirte
—el dólar, el clima, una fecha macro, algo que le pasa a alguien de tu red— y los
**cruzan con tu contexto** para que sumen sin volverse ruido.

---

## La tesis (y la línea que la salva del ruido)

**Externo × interno = señal. Externo solo = ruido.**

Una noticia del mundo, sola, no te sirve — es scroll infinito. Se vuelve **señal**
solo cuando **toca un nodo tuyo**: tus finanzas, un objetivo, una fecha, una
persona, tu energía. Por eso SIR NO es un feed de noticias: es un **filtro de
relevancia** que deja pasar lo externo únicamente cuando cruza con algo tuyo, y
lo dice con honestidad (*correlación ≠ causa*).

Tres reglas que lo mantienen útil:
1. **Relevancia primero.** Si no toca un nodo tuyo, no aparece. Cero "por si te
   interesa".
2. **Solo si se MOVIÓ.** Un dato externo estable no molesta (el dólar plano no es
   noticia). El cambio es la señal.
3. **Contexto, no alarma.** Los eventos del mundo se presentan como *contexto a
   confirmar*, nunca como veredicto ni pánico. La mayoría son "puede que", no "es".

---

## Lo que ya existe (y por qué está sub-explotado)

SIR ya tiene la **semilla** de esto, pero angosta:

| Señal | Dónde vive | Cobertura hoy |
|---|---|---|
| **Tipo de cambio USD/PEN** | `lib/external/fxExposure` (`computeFxSignal`, `penImpact`) + `GET /api/external/fx` (`fetchUsdToPenRate`) | solo en objetivos-viaje (`ExternalSignalsPanel`) |
| **Eventos por lugar (GDELT)** | `lib/external/events` + `GET /api/external/events` | solo en objetivos-viaje |
| **Calendario / fechas** | Calendar v2 (feeds .ics), `roleDates`, `commercialCalendar` | agenda/horario |
| Señales internas | `engines/signal`, `/senales`, `lib/signals/relevance` | derivadas de tu data |

**Diagnóstico:** la maquinaria de FX y eventos externos ya está construida y
probada — pero solo asoma cuando un objetivo tiene un viaje. Toda la vida de
Aaron pasa por el dólar (Perú, la mudanza, el **Mundial WFG26** que es el norte
del año, gastos en USD) y por fechas macro, y SIR no lo cruza fuera del caso
viaje. Ahí está la veta: **generalizar la capa externa a nodos que ya tenés**.

---

## Qué construir (por partes)

De alto valor / bajo costo (reusa infra existente) a más complejo. Cada uno
respeta la tesis: externo × interno, solo si se movió, contexto no alarma.

**M1 — Dólar generalizado a tus finanzas (confianza alta).** Sacar el FX del
caso-viaje: una señal "el dólar" en `/finanzas` (o `/panel`) que aparece **solo si
se movió** vs tu última visita, con el impacto honesto ("subió X% → por cada
US$1000 que necesites, son ~S/Y más"). Reusa `computeFxSignal` + `/api/external/fx`;
baseline en localStorage (tu última visita, cero backend). Cruza con lo más real
para vos: la mudanza y el Mundial (USD). **Empezar por acá.**

**M2 — Clima → energía/ánimo (confianza media).** Clima de Lima (Open-Meteo, sin
API key) cruzado con tu energía: días de mucho gris/lluvia (temporada) como
*contexto* de un bajón, nunca como excusa. Honesto: es correlación débil, se
muestra como pista. Toca: nuevo `lib/external/weather` + `self_metrics`.

**M3 — "Eventos que sigo" (modelo manual, confianza alta).** Lo más honesto y
general: Aaron declara eventos externos que le importan (el Mundial, una elección,
un deadline de la red, un lanzamiento) con fecha + qué nodo tocan (finanzas /
objetivo / persona) + impacto esperado. SIR los surfacea en el horizonte y los
cruza con tu estado. Sin scraping, sin ruido, sin ToS — vos elegís qué mundo
mirar. Toca: nueva tabla `watched_events` (mig) + card en `/horario`/`/panel`.

**M4 — Eventos por ubicación de persona/objetivo (opt-in, confianza baja).**
Generalizar GDELT más allá del viaje: eventos donde vive alguien clave o donde
cae un objetivo. Opt-in y siempre "contexto a confirmar" (GDELT es ruidoso).
Toca: `lib/external/events` (ya existe) + person.location.

**M5 — Calendario macro cruzado (confianza media).** Feriados, fechas comerciales
(`commercialCalendar`/`roleDates` ya existen) cruzados con tu agenda y tus
objetivos: "viene un feriado largo — ventana para X" / "quincena — tu quincena
suele venir con más gasto". Toca: lo que ya existe + `/horario`.

Orden sugerido: **M1 → M3 → M5 → M2 → M4** (primero lo de mayor señal y menor
costo; el scraping de eventos por lugar al final, por ruidoso).

---

## Modos de falla / qué NO hacer

- **No ser un feed de noticias.** Si no toca un nodo tuyo, no entra. La tentación
  de "traer el mundo" es justo lo que lo arruina.
- **No alarmar.** Los eventos externos son contexto, no pánico. "Puede que", no
  "es". Nada de titulares que asustan.
- **Correlación ≠ causa.** El clima gris *puede* coincidir con un bajón; no lo
  explica. El dólar sube *y* eso toca tus USD; no toca los soles que ya tenés.
  Enunciar el vínculo con honestidad y su límite.
- **Solo el cambio es señal.** Un dato externo estable no se muestra. Filtro de
  acción: si no cambió, no molesta.
- **Costo y dependencias.** Preferir fuentes gratis y sin key (Open-Meteo, GDELT,
  exchange). Nada de atar SIR a un servicio pago para una señal de bajo valor.
- **Privacidad.** Las señales externas no exponen tu data hacia afuera — solo
  traen data pública del mundo hacia adentro.
