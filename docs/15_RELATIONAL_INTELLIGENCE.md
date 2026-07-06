# 15 — INTELIGENCIA RELACIONAL

Base científica para que SIR entienda y cuide los vínculos de Aaron: qué dice la evidencia sobre relaciones humanas, qué de eso ya vive en SIR, y qué construir por partes. Es el norte del sistema: casi todo lo que le importa a Aaron pasa por su gente.

## La ciencia (núcleo)

Las relaciones no son un misterio inaccesible: hay décadas de evidencia sobre cómo se forman, se mantienen y se rompen. De cada cuerpo teórico sale algo medible con la data que SIR ya captura. Regla transversal (igual que en cambio de comportamiento): **medí interacción y patrón, no sentimiento supuesto.** Lo afectivo real no se reduce a estas métricas; las métricas son andamiaje para ayudar, no para juzgar el vínculo.

**Teoría del apego (Bowlby; Ainsworth).**
El patrón de vínculo temprano modela cómo cada persona busca y tolera cercanía de adulto. Estilos: *seguro* (busca contacto, se calma con él), *ansioso* (busca mucho, se activa ante silencios/ambigüedad), *evitativo* (regula alejándose, incómodo con demasiada cercanía). No diagnosticamos a nadie, pero el estilo *modula qué cadencia de contacto es sana*: para un vínculo ansioso, un silencio largo pesa más; para uno evitativo, presionar contacto es contraproducente.
- Medible (indirecto): reacción al silencio (tono baja tras días sin contacto), quién inicia, tolerancia a la distancia. Señal débil, nunca etiqueta clínica.

**Número de Dunbar y capas de la red (Hill & Dunbar).**
La capacidad cognitiva para relaciones es finita y se organiza en capas concéntricas de tamaño e intensidad decrecientes: ~5 (soporte íntimo), ~15 (simpatía/confidentes), ~50 (amigos), ~150 (red estable con quien mantenés relación real). Cada capa pide una frecuencia de contacto distinta para sostenerse. La atención es un recurso escaso: sobre-invertir en una capa desatiende otra.
- Medible: `category` mapea casi 1:1 → inner_circle≈5, close≈15, network≈50, peripheral≈150. Se puede medir tamaño real por capa vs. el rango sano, y contacto observado vs. el esperado por capa.

**Fuerza de vínculo y el valor de los lazos débiles (Granovetter).**
La fuerza combina tiempo, intensidad emocional, intimidad y reciprocidad. Contraintuitivo: los *lazos débiles* (network/peripheral) son los que más aportan información y oportunidades nuevas, porque conectan con círculos que uno no frecuenta. Los fuertes dan soporte; los débiles dan alcance. Para un objetivo instrumental (ej. aumento en HNG), los débiles bien activados valen tanto como los fuertes.
- Medible: proxy de fuerza por recencia+frecuencia+tono+parentesco; `kinship` ya pondera parentesco. Los débiles se identifican por category + baja frecuencia.

**Reciprocidad y capital social (Gouldner; Putnam; Coleman).**
La *norma de reciprocidad* (Gouldner) sostiene los vínculos: el intercambio equilibrado en el tiempo es lo que los mantiene vivos —pero contarlo transacción por transacción los mata. Putnam distingue capital *bonding* (vínculos fuertes hacia adentro, dan apoyo e identidad) de *bridging* (vínculos que cruzan grupos, dan acceso y movilidad). Ambos son valiosos y distintos.
- Medible: `QUALITY_DELTA` ya aproxima balance dar/recibir por tono. `person_links` describe la topología de bonding (familia densa) vs. bridging (contactos que conectan mundos separados).

**Penetración social / autorrevelación (Altman & Taylor).**
La intimidad crece por autorrevelación gradual y recíproca: se va de temas superficiales a profundos por capas, y avanza sano cuando es mutuo. Revelación unilateral (uno se abre, el otro no) o demasiado rápida desbalancea el vínculo.
- Medible (parcial): profundidad de temas en `person_logs`/`memories`, mutualidad de la apertura. Hoy es cualitativo; señal frágil.

**Mantenimiento relacional (Gottman).**
Los vínculos se sostienen en lo cotidiano, no en los grandes gestos. Dos hallazgos operativos: (1) la ratio de interacciones *positivas* a negativas debería rondar ~5:1 para que una relación cercana prospere; (2) las relaciones se hacen o deshacen en los *"bids"* de conexión —micro-intentos de atención ("mirá esto", un mensaje suelto)— y en si el otro *responde, ignora o rechaza*. Responder a los bids es el hábito de mantenimiento más barato y predictivo.
- Medible: signo/tono de interacciones (ratio positivo/negativo), y —a futuro— si Aaron responde a los bids de su gente y si su gente responde a los suyos.

**Homofilia (McPherson).**
Tendemos a vincularnos con similares (valores, contexto, etapa). Explica por qué ciertos vínculos fluyen sin esfuerzo y por qué la red se segrega en grupos (`org_group`). Útil para *entender* la red, riesgoso si se vuelve sesgo (encerrarse en el eco).

**El costo de los vínculos que drenan.**
No toda relación suma. Hay vínculos que consumen energía de forma sostenida (crítica, demanda unilateral, conflicto crónico). La evidencia de estrés social es clara: la carga relacional negativa afecta salud y ánimo. Reconocerlo no es frío; es cuidado propio.
- Medible: `energy_impact` (energizing/draining/neutral) + tendencia de tono + correlación con `self_metrics` (estrés/ánimo tras interacciones con esa persona).

**Afectivo vs. instrumental: dos lógicas.**
Un vínculo afectivo (novia, familia, amigos) se cuida como fin en sí mismo; su "métrica" es presencia, cariño, no-instrumentalización. Un vínculo instrumental/profesional (la red de HNG para el aumento) se cultiva con reciprocidad y valor mutuo, y *sí* admite estrategia sin culpa. Confundirlos es el error clásico: tratar a la novia como un contacto a "gestionar", o a un aliado laboral con la vara emocional de un íntimo. SIR debe aplicar reglas distintas según `relationship`.

## Cómo mapea a SIR (lo que ya tiene)

| Concepto científico | Dónde vive hoy en SIR | Cobertura |
|---|---|---|
| Capas de Dunbar | `people.category` (inner_circle/close/network/peripheral) | Buena (falta leer *tamaño por capa* y alertar) |
| Fuerza de vínculo | `kinship` (parentesco) + recencia/frecuencia + tono | Parcial (parentesco sí; fuerza compuesta no formalizada) |
| Reciprocidad (Gouldner) | `QUALITY_DELTA` por tono; `engines/relationship` | Parcial (balance por tono, no dar/recibir explícito) |
| Vínculos que drenan | `people.energy_impact` | Dato existe; **no se usa** para decidir nada aún |
| Capital bonding/bridging | `person_links` (aristas reales, inferencia transitiva) | Buena topología; sin lectura de "puentes/caminos" |
| Mantenimiento (last_contact) | `last_contact` + alerts no_contact + urgencia immediate/soon | Buena para *disparar*, ciega al *tono/ratio* |
| Bids / rituales | Daily Actions ("Hoy con tu gente") + rituales | Parcial (urgencia+ritual; sin concepto de bid/respuesta) |
| Estilo de apego | — (implícito en tono/recencia) | Ausente (y probablemente deba quedar liviano) |
| Memoria de lo que le importa | `memories` (embeddadas por persona), `person_synthesis`, `person_profile_axes` | Existe; **poco explotada** para hacer el contacto real |
| Estado propio ↔ relación | `self_metrics` + `person_logs` | Datos existen; correlación no cableada |
| Grafo tipado / difusión | cerebro F1–F4 (proyector, difusión, Hebbian, BrainGlow) | Infra fuerte; falta *semántica relacional* encima |

Honestidad: SIR es fuerte en *disparar contacto* (no_contact, urgencia, fechas, kinship) y en *topología* (person_links, cerebro). Es débil en **leer la salud del vínculo** (tono/ratio/reciprocidad real), en **usar `energy_impact`** para algo, y en **hacer el contacto específico** (usar lo que le importa a la persona en vez de un genérico). Ahí está el salto.

## Qué construir (por partes) — hoja de ruta de inteligencia relacional

De alto valor/simple a complejo. Cada módulo declara la tabla/motor que toca y su confianza (qué tan fiable es el resultado con los datos de hoy). Marcado si ya existe parcialmente [P] o es nuevo [N].

**1. Mapa de capas de Dunbar + alertas de sobre/sub-inversión.** [P] — Confianza: alta.
Contar personas por `category` y contrastar con el rango sano (5/15/50/150). Detectar dos patrones: (a) *sobre-inversión* —mucho contacto en peripheral mientras inner_circle queda desatendido; (b) *sub-inversión* —una capa cercana con contacto por debajo de lo esperado. Es aritmética + reglas, sin IA. Toca: `people` (category, last_contact). Señal: alta (dato duro). Entrega: panel "Tu red por capas" en /relaciones.

**2. Balance de reciprocidad por persona. ✅ YA EXISTÍA** (`computeReciprocityWeighted`); "quién inició" real necesita campo initiated_by. [P] — Confianza: media.
Sobre `QUALITY_DELTA`, mostrar *tendencia* de quién sostiene el vínculo (Aaron inicia siempre / recíproco / el otro carga). NUNCA un marcador tipo "le debés 3 mensajes". El objetivo es notar desequilibrios crónicos ("hace meses siempre arrancás vos con X"), no llevar la cuenta. Toca: `person_logs`, `engines/relationship`. Señal: media (tono autoreportado sesga; ver Modos de falla). Regla + umbral, no IA.

**3. Salud del vínculo: tendencia de tono + cadencia vs. esperada. ✅ HECHO** (`lib/relational/health`). [N] — Confianza: media.
Por persona, combinar: (a) tendencia de tono (1–5) en el tiempo —¿mejora, se enfría?; (b) cadencia real vs. la esperada por su capa y parentesco (`kinship`). Un íntimo con tono bajando y contacto ralentizando = señal a atender; un peripheral con contacto raro es *normal*, no alerta. La clave es que el umbral dependa de la capa, no un absoluto. Toca: `person_logs` (tono), `people` (category), `kinship`. Señal: media. Aproxima la ratio de Gottman sin pretender medirla fina.

**4. Vínculos que drenan vs. energizan → qué hacer. ✅ HECHO** (`lib/relational/energy`). [N] — Confianza: media-baja.
Usar `energy_impact` (hoy inerte) cruzado con `self_metrics`: ¿el estrés/ánimo de Aaron se mueve alrededor de interacciones con cierta persona? No es para "cortar gente"; es para *nombrar* el patrón y sugerir manejo: espaciar, poner límite, o cuidar más el propio estado antes de ver a alguien draining pero importante (familia difícil no se descarta). Para energizing: recordar apoyarse en ellos cuando Aaron está bajo. Toca: `people.energy_impact`, `self_metrics`, `person_logs`. Señal: baja al principio (n chico); crece con datos. Honesto: correlación ≠ causa.

**5. "Bids" y rituales de mantenimiento en el momento correcto. ✅ HECHO** (`lib/relational/bid`). [P] — Confianza: alta (para disparar), media (para el timing fino).
Extender Daily Actions: además de urgencia por silencio, sugerir *micro-bids* de bajo costo atados a señal real —un cumpleaños próximo (`special_dates`), una fecha que le importa a la persona (de `memories`), o simplemente "hace X que no hablan y suele responderte". La acción sugerida debe ser específica y opcional, nunca una cuota. Toca: Daily Actions, `special_dates`, `memories`. Señal: alta para el gatillo; el *cuándo exacto* es más incierto.

**6. Lógica distinta afectivo vs. profesional. ✅ HECHO** (`relationshipMode`). [N] — Confianza: alta (es diseño, no predicción).
Ramificar todo lo anterior por `relationship`. Afectivo (romantic/family/friend): el foco es presencia y calidad, cero lenguaje de "gestión", jamás sugerir contacto "estratégico". Profesional/instrumental (professional/mentor): admite estrategia explícita —para el objetivo de aumento en HNG, tratar la red laboral como capital instrumental (a quién conviene mantener tibio, quién puede abrir una puerta), con `org_group` de HNG como subred. Dos vocabularios, dos motores de sugerencia. Toca: `people.relationship`, `org_group`, goals. Señal: alta (regla).

**7. Inteligencia de red: caminos, presentaciones, lazos débiles útiles. ✅ HECHO / DESBLOQUEADO** (mig 0128 abrió `person_links.category` = familia|profesional|social; motor `lib/relational/network` + `lib/people/professionalNetwork`; UI `NetworkPathsCard`/`NetworkIntrosPanel`/`WeakTiesPanel`). El esquema+motor+UI existen; el valor real depende de que se ingresen vínculos no-familiares (hoy el grafo person↔person aún es mayormente familia). [N] — Confianza: media.
Explotar `person_links` (ya es un grafo real) para: (a) hallar *caminos* ("querés llegar a X; conocés a Y que lo conoce"); (b) sugerir *presentaciones* de valor entre gente de Aaron; (c) resaltar *lazos débiles* (Granovetter) relevantes a un objetivo abierto —contactos de network/peripheral en el rubro correcto. Reusa la infra del cerebro (difusión F2 sobre aristas person↔person). Toca: `person_links`, cerebro F1/F2, goals. Señal: media (depende de qué tan poblado esté el grafo).

**8. Memoria de lo que le importa a cada persona → contacto real, no genérico.** [P] — Confianza: alta (el dato existe), media (la síntesis).
Antes de sugerir cualquier contacto, traer de `memories`/`person_synthesis` lo que esa persona valora o tiene pendiente ("le importaba el examen de su hija", "estaba con la mudanza"), para que la acción propuesta sea concreta y humana, no "escribile a X". Esto convierte el sistema de un recordatorio en un *asistente que sabe*. Cierra el círculo con [5] y [3]. Toca: `memories` (embeddings por persona), `person_synthesis`. Señal: alta si hay memorias; degrada con gracia si no (no inventar).

Orden sugerido de construcción: 1 → 6 → 5 → 8 → 3 → 2 → 4 → 7. (1 y 6 son baratos y de alto valor; 6 debe ir temprano porque *condiciona* a todos los demás; 4 y 7 dependen de acumular datos/grafo.)

## Modos de falla / qué NO hacer

- **No instrumentalizar el afecto.** Novia, familia y amigos no se "optimizan". Prohibido para vínculos afectivos: lenguaje de gestión, sugerencias de contacto "estratégico", scores visibles de reciprocidad. El sistema ahí ayuda a *estar presente y acordarse*, nada más.
- **No convertir las relaciones en un CRM de KPIs.** Nada de "salud del vínculo: 72/100" a la vista, ni rankings de personas, ni cuotas de mensajes. Las métricas son andamiaje interno para *sugerir bien*; casi nunca se muestran como número.
- **No empujar contacto por métrica cuando no hay ganas.** Una alerta de "hace X que no hablás" es una *oferta*, descartable sin costo. Si Aaron está drenado, la sugerencia correcta puede ser *no* contactar. El estado propio (`self_metrics`) modula la exigencia relacional, igual que en hábitos.
- **Respetar lo íntimo.** Lo más cercano se rige por presencia, no por optimización. Ante la duda, menos sistema, no más.
- **Nunca confundir personas por nombre.** Hay dos Dianas: **Diana Díaz** (novia — afectivo) y **Diana Cencaro** (compañera de HNG — laboral). Jamás resolver por primer nombre suelto; siempre desambiguar por apellido + `relationship`. Aplicar la lógica correcta (afectiva vs. instrumental) a cada una. Este error rompería la confianza en todo el módulo.
- **Honestidad con el n y con el sesgo.** El tono es autoreportado por Aaron y sesga (día malo → tono bajo que no es de la persona). Con pocas interacciones, no afirmar tendencias; declarar `insufficient_data` como en alignment. Correlación estado↔persona no es causa. Un estilo de apego inferido es una hipótesis débil, jamás una etiqueta.
- **No encerrar la red por homofilia.** Sugerir a veces el lazo débil/distinto, no solo lo cómodo y parecido.
- **Degradar con gracia.** Sin memorias de una persona, el contacto sugerido es genérico y honesto ("hace tiempo que no hablás"), nunca inventa un detalle. Falso recuerdo = peor que ninguno.
