# Cómo está cableado SIR — cuerpo, entorno y una persona

Corrida real del **25-jul-2026** sobre la data de Aaron. Tres ejes: lo que SIR sabe
de su **cuerpo**, de su **entorno** y de **una persona**. Para cada uno: qué entra,
quién lo consume hoy, y qué cruce falta.

Todos los números salen de consultas a la base ese día, no de estimaciones.

---

## Eje 1 · El cuerpo

**Entra:** `health_metrics` — 672 lecturas, 23 tipos. `sleep_records` — 43 noches.

| señal | lecturas | último valor |
|---|---|---|
| peso | 42 | 81.4 kg (25-jul) |
| IMC | 42 | 26.2 · sobrepeso |
| grasa corporal | 42 | 25.2 % |
| grasa visceral | 42 | 11 |
| músculo esquelético | 26 | 33.3 kg |
| FC reposo / mín / máx | 42 / 43 / 43 | 49 · 43 · 118 ppm |
| VFC (avg/mín/máx) | 11 / 34 / 34 | 82 · 44 · 131 ms |
| SpO₂ · frec. respiratoria | 19 · 18 | 98 % · 16 rpm |
| sueño | 43 noches | 9h34, score 78, 2 despertares |

**Quién lo consume hoy** (verificado en el código):

- `people/selfState.ts` → **ventana de tolerancia** (sueño + VFC + estrés). Es el gate *"¿estás para esto?"* de `/negociar`, `/decidir` y `/ensayo`.
- `health/vitalsAnomaly.ts` → cuando **varias** señales se desvían el mismo día, una línea calma en el brief. Nació del 15-jul, cuando Aaron estaba enfermo y SIR no dijo nada.
- `health/missingData.ts` → *"te falta el peso"*.
- `horario/physical.ts` → estado del día en `/horario`.
- `morning-push` → `bodySignal`, `healthWatch`, `metricAlert` (peso vs categoría del Mundial).
- `askSir` → bloque de salud cuando la pregunta lo pide.

---

## Eje 2 · El entorno

| fuente | volumen | estado |
|---|---|---|
| señales diarias de personas | 5,082 | el sustrato más rico que tiene |
| alertas de estado relacional | 34 | activas |
| reader social (contact_activity) | 32 | + 104 sin asignar |
| ciclos registrados | 15 | de 6 mujeres del círculo |
| episodios/momentos | 7 | 5 abiertos |
| agenda (`personal_events`) | 3 | + 2 calendarios conectados |
| oportunidades comerciales | 2 | |
| movimientos de plata | 5 | |

---

## Eje 3 · Una persona (Diana Carolina)

| capa | volumen |
|---|---|
| mensajes | 72,171 |
| memorias | 151 |
| señales diarias (fricción, retirada, sensibilidad, afecto) | 820 |
| interacciones logueadas | 194 |
| ciclos registrados | 10 |
| episodios | 5 |
| registros de plata | 10 |
| vínculos familiares | 3 |
| actividad del reader | 0 |

Es, con diferencia, la persona mejor cableada del sistema — y aun así **su
actividad del reader es 0**: sigue @firebrothersperu (lo detectamos hoy), pero no
tiene su handle asignado como contacto, así que sus historias no producen señales
de timing.

---

## El cableado que falta

Cada flecha existe como dato en la base, pero **nadie la recorre**.

### 1. Cuerpo → consejo relacional
`selfState` calcula si Aaron está en ventana de tolerancia, y eso ya calibra
`/negociar` y `/decidir`. Pero **el brief de la mañana no lo mira**: el nudge
*"escríbele a tu mamá para cerrar el conflicto"* sale igual con 9h de sueño que
con 4h y la VFC por el piso.

*Debería:* atenuar o posponer el empujón relacional cuando la ventana está
cerrada. Es el mismo principio que ya aplica el gate — falta cablearlo al canal
donde Aaron realmente lee.

### 2. Entorno relacional → cuerpo
820 días de señales de Diana (fricción, retirada) y 43 noches de sueño **no se
cruzan nunca**. La hipótesis obvia —las noches malas siguen a los días tensos— es
medible con lo que ya está guardado.

*Estado real del cruce, corrido hoy:* 25 días tienen cuerpo y relación a la vez,
pero **solo 4 tienen score de sueño**. Con esa muestra no se concluye nada. El día
con fricción registrada (4-jul) tuvo **5 despertares** contra 0.3 de promedio en
los días sin fricción — sugestivo y nada más, con n=1.

*Lo que falta no es código, es continuidad:* con ~30 noches más de sueño
registradas sobre días que ya tienen señal relacional, el cruce pasa de anécdota
a patrón.

### 3. Ciclo del círculo → agenda
El detector de "semana con carga afectiva" sabe que 6 personas están en ventana
sensible. `personal_events` sabe qué tiene agendado. **No se hablan.**

*Debería:* avisar cuando una conversación difícil cae dentro de una ventana
sensible. Es timing, no manipulación — la misma línea ética que el resto del
módulo de ciclo.

### 4. Peso → Mundial
`metricAlert` compara el peso contra la categoría objetivo… que vive en el goal
del Mundial, y **ese goal está vacío**: 0 hitos, sin categoría, sin fecha. IMC 26.2
hoy. El cable existe y no tiene de dónde agarrarse.

### 5. Cuerpo → objetivos
143 tareas sueltas en el sistema y **9 de 10 objetivos activos sin un solo hito**.
El examen médico del 7-ago no cuelga del Mundial. Sin esa estructura, el panel
mide "avance" por la fecha de edición y todo se ve estancado.

---

## Lo que esto implica

El patrón se repite: **SIR mide bien y conecta poco**. Las tres capas están
razonablemente pobladas; lo que falta son los cruces, y casi todos son baratos
porque los datos ya están.

Orden por relación valor/esfuerzo:

1. **Cuerpo → brief** (barato, alto impacto diario).
2. **Poblar el goal del Mundial** (destraba el peso, el examen y el panel de una).
3. **Ciclo → agenda** (barato, evita pisar callos).
4. **Cruce cuerpo↔relación** (esperar data; el código puede escribirse ya).
