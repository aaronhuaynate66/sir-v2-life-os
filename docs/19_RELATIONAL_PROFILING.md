# 19 — PERFILADO RELACIONAL (leer a la persona)

Para relacionarte mejor —y para anticiparte a problemas serios— ayuda entender
con QUÉ tipo de persona estás tratando: estilo de apego, personalidad tendencial,
valores, forma de comunicar, manejo de conflicto, predisposiciones, riesgos y
patrones compatibles con trastornos/enfermedades. Este dominio arma ese perfil
desde patrones observados + marcos científicos, y ofrece un modo de **explorar
hipótesis** cuando algo preocupa.

---

## La postura (la línea — va primero, gobierna todo)

**Hipótesis para vincularte, protegerte e influir mejor. Nunca diagnóstico
confirmado como hecho.**

- **SIR sí estima predisposiciones/riesgos.** No afirma "X tiene Y" como
  diagnóstico confirmado; sí detecta indicios, patrones compatibles,
  vulnerabilidades, señales de riesgo y necesidades de abordaje.
- **El test validado es autoreporte, no tu inferencia.** Big Five, apego, etc. los
  responde la persona sobre sí misma. Inferir su "tipo" desde lo que vos observás
  es una hipótesis útil — no el instrumento. La versión más válida: si alguien
  QUIERE, hace el test real y lo comparte (consentido).
- **Para abordar mejor y protegerte.** La hipótesis sirve para elegir tono, timing,
  límites, distancia, documentación, ruta de conversación o recurso profesional.
  También sirve cuando la persona puede tener malas intenciones: conocer el riesgo
  mejora defensa y estrategia.
- **Contra tu propio sesgo.** Una etiqueta que te creés se vuelve profecía
  autocumplida y daña la relación aunque nunca la digas. Por eso el modo hipótesis
  ofrece explicaciones que COMPITEN y se mantiene tentativo (engancha con 14·M1).
- **Peligro real → profesional.** Ante señales de abuso, riesgo o crisis, SIR no
  juega al terapeuta: deriva a un recurso real.
- **Privado.** Estas hipótesis sobre otros son sensibles: informan cómo VOS te
  parás frente a la persona; no se comparten ni se le tiran encima. Mismo criterio
  de aislamiento que `self_diagnosis`.

**Formato obligatorio:** hechos observados → hipótesis/predisposición → confianza
→ alternativas que la contradicen → riesgo si SIR se equivoca → abordaje sugerido.

---

## La ciencia (núcleo)

Lo que SÍ tiene respaldo y se puede inferir con honestidad (como *tendencia*, no
ley):

- **Personalidad — Big Five / OCEAN** (Costa & McCrae): apertura, responsabilidad,
  extraversión, amabilidad, neuroticismo. Rasgos continuos, no cajas. Hay
  correlación entre marcadores lingüísticos y rasgos (Pennebaker) — señal débil,
  útil como hipótesis.
- **Estilo de apego** (Bowlby/Ainsworth — ya en `docs/15`): seguro / ansioso /
  evitativo. Modula cómo la persona busca y tolera cercanía → qué cadencia de
  contacto la cuida.
- **Estilo de comunicación y de conflicto** (ej. los "cuatro jinetes" de Gottman:
  crítica, desprecio, actitud defensiva, evasión) — patrones *observables* que
  predicen salud del vínculo.
- **Valores y motivaciones** (qué mueve a la persona — engancha con `15·8` y `16`).

**El modo "Explorar hipótesis" (anticipar problemas serios).** Cuando algo
preocupa, SIR ofrece *candidatos* de qué podría estar pasando —incluidos framings
clínico-adyacentes nombrados con honestidad— SIEMPRE como hipótesis de baja
confianza que apuntan a acción protectora o de cuidado. Dos usos legítimos y de
alto valor:
- **Red flags de auto-protección:** patrones en cómo alguien te trata (control,
  aislamiento, love-bombing→devaluación, gaslighting) → *protegerte*. No necesitás
  "diagnosticar narcisismo" para reconocer un patrón de control y cuidarte.
- **Señales de que alguien que querés está sufriendo:** retraimiento, cambios de
  sueño, lenguaje sin esperanza → *estar presente y sugerir ayuda*. No "está
  deprimida, ignorala", sino "hay señales de que la está pasando mal, acompañá".

---

## Cómo mapea a SIR (lo que ya tiene)

| Concepto | Dónde vive |
|---|---|
| Estilo de apego, capas de vínculo | `docs/15` + `person.category` + `person_links` |
| Qué valora / temas recurrentes | `15·8` (`lib/people/whatMatters`) + `memories` |
| Tono e interacciones | `person_logs`, correlación longitudinal |
| Lentes Psicólogo/Antropólogo | `10_COGNITIVE_PERSONAS` + reasoner |
| Chequeo de tus sesgos | `14·M1` (`engines/bias`) |
| Aislamiento de lo sensible | patrón `self_diagnosis` |

Diagnóstico: SIR ya tiene las piezas para un perfil relacional; falta
**consolidarlas en un perfil por persona** y el **modo hipótesis** con guardrails.

---

## Qué construir (por partes)

**M1 — Perfil relacional por persona (confianza media).** Consolidar en la ficha:
estilo de apego probable, tendencias de personalidad, qué valora, cómo comunica/
maneja conflicto, qué lo drena/energiza — inferido de patrones + marcos, rotulado
**hipótesis para vincularte** con su confianza (más datos = más firme). Alimenta la
Sala de ensayo (16·M4). Toca: reasoner + `memories` + `person_logs` + `15·8`.

**M2 — Modo "Explorar hipótesis" (confianza baja, guardrails duros).** Dado una
persona + lo que te preocupa, SIR ofrece 2-4 **hipótesis que compiten** (relacional
/ contextual / clínico-adyacente honesta) — cada una con qué la apoyaría/
contradiría, confianza baja, y la **acción de cuidado/protección** que sugiere.
Frame fijo: *esto no es diagnóstico confirmado; es una hipótesis de riesgo para
abordar mejor*. Peligro real → recurso profesional. Toca: reasoner + guardrail
(como `16·M5`).

**M3 — Red flags de auto-protección (confianza media). ✅ HECHO.** `engines/relational-flags` puro (control/aislamiento/gaslighting/devaluación/blame-shift/intermitente, ES+EN, exige recurrencia ≥2) + RelationalFlagsCard en la ficha (solo aparece con recurrencia; encuadre de cuidado, no rotula; concern → sugiere hablar con alguien/profesional). Detectar patrones de cómo
alguien te trata que ameritan cuidado (control, manipulación, devaluación) → cómo
protegerte. Enfocado en TU seguridad, no en rotular al otro. Toca: `person_logs` +
`engines/manipulation` (16·M3, ya existe).

**M4 — Test consentido (confianza alta).** Si alguien de tu círculo quiere, un Big
Five corto que responde ESA persona → perfil validado, con su permiso. Es la
versión más sólida (instrumento real). Toca: un mini form + `person_profile_axes`.

**M5 — Autoperfil de Aaron (confianza alta).** El mismo marco aplicado a VOS
(consentido por definición): tu Big Five, tu apego, tus patrones — para conocerte
mejor y calibrar cómo te relacionás. Toca: `identity_profile` + self.

Orden: **M1 → M3 → M2 → M5 → M4** (perfil y auto-protección primero; el modo
hipótesis con sus guardrails; luego los tests consentidos).

---

## Modos de falla / qué NO hacer

- **No diagnósticos confirmados.** Nunca "X tiene [trastorno]" como hecho cerrado.
  Sí: "hay indicios compatibles con...", "riesgo de...", "predisposición posible".
- **Uso estratégico legítimo.** La hipótesis apunta a cuidar, protegerte, influir
  mejor, poner límites o sugerir ayuda; no a invalidar a la persona.
- **No profecía.** Ofrecer explicaciones que compiten; re-chequear contra evidencia
  nueva; no cerrarte en una (tu sesgo es el riesgo).
- **No jugar al terapeuta.** Riesgo real (abuso, crisis, autolesión) → derivar a un
  profesional/recurso, no que SIR "trate".
- **Autoreporte ≠ inferencia.** Marcar siempre qué es hipótesis tuya-vía-SIR y qué
  es un test que la persona respondió.
- **Privacidad.** Perfiles e hipótesis sobre otros no se exponen ni se comparten;
  informan cómo VOS te parás, nada más.
- **No reducir a la persona.** El perfil es una lente entre muchas, no la verdad de
  quién es alguien.
