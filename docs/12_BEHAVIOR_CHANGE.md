# 12 — CAMBIO DE COMPORTAMIENTO Y HÁBITOS

Base científica para que SIR ayude a Aaron a cambiar comportamiento sin sermonear: qué dice la evidencia, qué de eso ya vive en SIR, y qué construir por partes.

## La ciencia (núcleo)

El cambio de comportamiento no es fuerza de voluntad; es diseño de sistema. Cinco cuerpos de evidencia sostienen esto, y de cada uno sale algo medible.

**Bucle señal-rutina-recompensa (Duhigg, popularizando a Graybiel/MIT).**
Un hábito es un lazo: una *señal* (contexto) dispara una *rutina*, que entrega una *recompensa*, que refuerza el lazo. Para cambiar un hábito no se borra: se mantiene señal y recompensa, se sustituye la rutina.
- Medible: qué contexto (hora, lugar, estado, acción previa) precede a la conducta; con qué consistencia.

**B = MAP (Fogg).**
Un comportamiento ocurre cuando *Motivación*, *Habilidad* (facilidad) y *Prompt* coinciden en el mismo instante. Sin prompt no pasa nada, por alta que sea la motivación. La palanca más barata y confiable es subir la habilidad (bajar fricción), no subir la motivación. "Empezá diminuto": un hábito ancla suficientemente pequeño para no fallar nunca.
- Medible: tamaño del paso (esfuerzo S/M/L), presencia y timing del prompt, tasa de ejecución.

**Intenciones de implementación / WOOP (Gollwitzer; Oettingen).**
Un plan "si pasa X, entonces hago Y" duplica-triplica la tasa de acción vs. sólo tener la meta, porque pre-decide y ata la acción a una señal concreta. WOOP le antepone contraste mental (Wish-Outcome-Obstacle-Plan): imaginar el resultado *y* el obstáculo real, luego el plan if-then para ese obstáculo.
- Medible: existe plan if-then explícito; el "if" es un contexto detectable; se disparó cuando el contexto ocurrió.

**Hábitos como aprendizaje contexto-dependiente (Wood & Neal).**
Con la repetición en un contexto estable, el control pasa de la intención al contexto: el ambiente dispara la conducta casi sin deliberación. Corolario: la estabilidad del contexto importa más que la motivación; los cambios de contexto (mudanza, viaje) rompen hábitos —para mal y para bien (ventana para instalar nuevos).
- Medible: consistencia de contexto, número de repeticiones en él, automaticidad proxy (ejecución sin recordatorio).

**Autodeterminación (Deci & Ryan).**
La motivación durable nace de tres necesidades: *autonomía* (lo elijo yo), *competencia* (progreso, lo logro), *relación* (importa a/con otros). Recompensas externas y presión/culpa erosionan la motivación autónoma. El refuerzo que funciona a largo plazo es el sentido de competencia: progreso visible.
- Medible: progreso hacia KR, rachas, deltas de estado (paz/energía) tras la conducta.

**Fricción y arquitectura de elección (Thaler/Sunstein; Lewin).**
El comportamiento sigue el camino de menor resistencia. Bajar fricción del paso deseado y subir la del no deseado supera a la exhortación. Lewin: es más eficaz remover barreras que empujar más fuerte.
- Medible: número de pasos/decisiones hasta ejecutar; si el próximo paso está pre-definido y a mano.

Regla transversal: **medí ejecución y contexto, no intención.** Lo que SIR no puede observar, no lo afirma.

## Cómo mapea a SIR (lo que ya tiene)

| Concepto científico | Dónde vive hoy en SIR |
|---|---|
| Plan if-then / WOOP | `objective_plan.plan_if` / `plan_then` (router 2b ya los separa al crear objetivo) |
| Recompensa / refuerzo por competencia | `habits`/streaks (racha por día en Lima) — progreso visible |
| Meta concreta y accionable (Ability) | `goals` SMART + `objective_steps` con `criterio` y `esfuerzo` S/M/L |
| Prompt en el momento correcto | `objective_steps.due_date`/`due_time` → franja en /horario |
| Detección de drift (contexto vs. objetivo) | `engines/alignment` (aligned / drifting / needs_attention / insufficient_data) |
| Loop de refuerzo aprendido | `engines/learning` (computeEffectiveness + adjustByLearning: aprende qué recos suben la paz) |
| Jerarquía de motivación / prioridad | `engines/priority` (Paz > Salud > Finanzas > Personal > Relacional > Optimización) |
| Estado que condiciona la habilidad | `self_metrics` (energy/mood/stress) |
| Contexto crudo para inferir señales | `moments`, `person_logs`, franjas de /horario |

Lo importante: SIR ya cierra **un** loop (learning refuerza lo que sube la paz) y ya detecta **drift** (alignment). Lo que falta es el lado *señal→prompt* del hábito y modular la exigencia por energía.

## Qué construir (por partes)

De simple a complejo. Cada módulo declara la tabla/motor que toca y su confianza (qué tan seguro es el resultado con los datos que hoy existen).

**1. Prompt atado a la franja (Fogg: el Prompt).** — Confianza: alta.
Cuando un `objective_step` tiene `due_time`, SIR ya lo ubica en /horario; sumar un recordatorio activo *en* esa franja ("ahora: [paso], esfuerzo S"). Ata la acción a una señal temporal concreta. Toca: `objective_steps`, /horario. Sin motor nuevo.

**2. Reducir fricción del próximo paso (Ability / arquitectura de elección). ✅ HECHO (lib/habits/nextStep)** — Confianza: alta.
Mostrar siempre EL siguiente paso más pequeño y pre-decidido, no la lista entera. Si el paso es L, ofrecer partirlo en un S de arranque ("primer bloque de 10 min"). Toca: `objective_steps` (ya hay `esfuerzo`), `engines/recommendation`. Regla, no IA.

**3. Tamaño del hábito según energía disponible (Fogg + SDT competencia). ✅ HECHO (lib/habits/nextStep)** — Confianza: media.
Cruzar `self_metrics.energy` con `esfuerzo`: energía baja → proponer la versión S ("hábito mínimo viable"), preservar la racha sin exigir el L. Nunca proponer L con energía baja. Toca: `self_metrics` + `engines/priority`/`recommendation`. Degradar a `insufficient` si no hay métrica del día.

**4. Detección de la señal/contexto de un hábito (Wood & Neal + Duhigg).** — Confianza: media-baja.
Inferir qué contexto precede a una conducta registrada: hora típica, franja, acción previa, estado. Con eso, proponer un `plan_if` fundado ("solés hacer X después de Y / a las Z"). Toca: `moments`, `objective_steps` completados, `self_metrics` → propuesta editable para `objective_plan.plan_if`. Requiere volumen de historial; con n bajo, sugerir, no afirmar (principio: nunca formulario vacío, propuesta editable).

**5. Disparar el WOOP cuando el "if" ocurre (Gollwitzer).** — Confianza: media.
Si `plan_if` describe un contexto que SIR puede detectar (una franja, un estado de estrés, una fecha), activar `plan_then` como prompt en ese momento. Convierte el WOOP de texto guardado en un lazo vivo. Toca: `objective_plan` + detector de contexto + /horario. Empezar con "if" temporales (fáciles), luego estados.

**6. Drift temprano por erosión de contexto (Wood & Neal). ✅ HECHO (lib/habits/drift)** — Confianza: media.
`alignment` ya marca drift; sumar señal *anticipatoria*: consistencia de contexto cayendo o racha en riesgo (1 día de gracia antes de romperse) → aviso suave *antes* de la ruptura. Especial atención a cambios de contexto conocidos (mudanza 04-jul: ventana para reinstalar, no para culpar). Toca: `engines/alignment`, `habits`.

**7. Reforzar por competencia, no por culpa (SDT + learning). ✅ HECHO (lib/habits/reinforce)** — Confianza: media, crece con datos.
Extender `engines/learning`: mostrar progreso *acumulado* y el delta de estado (paz/energía) que sigue a un hábito, para que la recompensa percibida sea el avance, no la aprobación de SIR. El lenguaje del refuerzo es "vas 6/7", nunca "fallaste el domingo". Toca: `engines/learning`, `habits`, `self_metrics`.

Orden sugerido de implementación: 1 → 2 → 3 → 6 → 7 → 4 → 5. Los primeros son reglas baratas de alta confianza; 4 y 5 dependen de acumular historial y de un detector de contexto que hoy no existe.

## Modos de falla / qué NO hacer

- **Nada de vergüenza ni culpa.** Un hábito roto es un dato del sistema, no un defecto de carácter. El copy jamás moraliza ("fallaste", "otra vez no"). SDT: la presión erosiona la motivación autónoma que queremos construir.
- **No confundir motivación con sistema.** "Motivarse más" no es un plan. Si un hábito falla, la respuesta por defecto es bajar fricción o achicar el paso (Ability), no exigir más ganas.
- **No exigir cuando la energía está baja.** Con `energy` baja se ofrece la versión mínima o se protege la racha; nunca se empuja el L. Exigir en fondo de pila quiebra la racha *y* la competencia percibida.
- **Honestidad con el n.** Con pocas repeticiones no hay patrón: detección de señal (módulo 4) y automaticidad se degradan a `insufficient_data` o a sugerencia editable, nunca a afirmación. SIR no inventa contexto que no observó.
- **No romper autonomía.** SIR propone, Aaron decide. Todo `plan_if`/hábito inferido llega como propuesta editable que suma sin pisar lo manual. Nada de metas impuestas ni recompensas externas artificiales.
- **No sobre-notificar.** El prompt (módulo 1/5) dispara en su franja o cuando el "if" ocurre, no en loop. Un prompt ignorado no se repite con más insistencia; se registra como señal de fricción (revisar tamaño o timing).
- **No medir intención.** Guardar un WOOP o marcar una meta no es evidencia de conducta. Alignment y learning se alimentan de ejecución observada (pasos completados, métricas, momentos), no de declaraciones.
