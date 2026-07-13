# 0010. Inferir el ciclo desde el chat, en paralelo al dato exacto, para toda mujer

- **Status:** Accepted
- **Date:** 2026-07-13
- **Deciders:** Aaron

## Context

SIR ya modela el ciclo de terceras de dos formas:

- **Exacto** — `person_cycles` (mig 0110, `source ∈ {aaron, self_report}`): día-a-día que Aaron observa/registra o que la persona confirma. Ancla el forecast conductual (`/api/forecast`) y la regularidad (`lib/ciclo/regularity.ts`).
- **Probabilístico** — el ensemble de `/api/forecast` proyecta la ventana del período desde señales léxicas del chat + esas anclas.

Faltaba cerrar el caso real que motivó todo (C4): **capturar pasivamente lo que la persona ya dijo en el chat**. Ejemplo de Aaron: Dayana llegó rara a una reunión el 8 de mayo y recién ahí dijo "estoy con la regla" — si SIR lo hubiera sabido, habría movido la reunión.

Existía un guardrail previo — **fix #629**: SIR *no pregunta* la fecha del período a mujeres que no son pareja (invasivo e irreal). La duda era si inferir del chat lo violaba, y si debía limitarse a la pareja.

## Decision

**SIR corre los DOS modelos en paralelo para mujeres, y el inferido aplica a TODA mujer, no solo a la pareja.**

1. **Tercer `source`: `chat_inferred`** (mig 0146). El import de WhatsApp detecta menciones en **primera persona de la contacta** ("me vino la regla", "ando con SPM") y registra un evento de ciclo con `confidence='low'`, etiquetado *"inferido del chat"* en la UI.
2. **Sin restricción de vínculo**, con el registro adaptado por `careBond` (ya existente): romance/intimidad **solo con pareja** (`showCuidado`); para otras mujeres es inteligencia de **timing/energía neutra** (`showCycleForecast`, decisión del 08-jul). Una colega no dispara flores ni planner.
3. **El dato exacto manda.** `chat_inferred` entra con `ignoreDuplicates`: nunca pisa una entrada existente (exacta o previa) ni se re-escribe al re-subir el chat. Cuando llega el dato real (`aaron`/`self_report`), ese sí mergea y **calibra** las anclas del forecast.
4. **Guardrail de género server-side:** `/api/person-cycles` rechaza `chat_inferred` si la persona no es `gender='female'`.

**Por qué no viola #629:** #629 prohibía que SIR *pregunte* la fecha a no-parejas — molesto porque obliga a Aaron a interrogar. Esto **no pregunta nada**: usa lo que la persona ya dijo voluntariamente. El uso es cuidado relacional (no agendar algo pesado en un mal día), coherente con [[0006-wellbeing-not-engagement]] y bajo la política de [[0009-privacidad-terceros]] (SIR usa data sensible de terceros para asistir, limitando la *exposición*, no la utilidad).

## Consequences

### Positive
- Se cierra C4 sin construir nada nuevo downstream: regularidad, anclas del forecast, horizonte y `/api/care/upcoming` ya consumen `person_cycles` → se encienden solos con las entradas inferidas.
- El caso Dayana queda cubierto: una mención suelta en el chat ahora alimenta la predicción para cualquier mujer.
- Precisión > recall: extractor de alta precisión (1ª persona, frases ancladas a menstruación, descarta negaciones) + `confidence='low'` honesto + dato exacto que pisa.

### Negative
- **Overrides el criterio de #629** de "ciclo de no-parejas fuera de alcance". Aceptado con criterio por Aaron: sistema mono-usuario, privado, con uso de cuidado.
- Falsos positivos posibles (parsing/ironía). Mitigado: nunca pisa dato exacto, entra como incierto, y el forecast solo proyecta con delta real (no dramatiza coincidencias).
- Data sensible inferida se almacena para mujeres no-pareja. Se justifica por el uso (timing) y sigue bajo RLS + los límites de exposición de 0009 (nunca a analytics/logs/URLs).

## Alternatives considered

### Solo pareja (recomendación inicial del asesor)
Mantener #629: inferir solo para la pareja. Descartado por Aaron con caso de uso concreto (Dayana): la inteligencia de timing sirve para **todas** las relaciones, no solo la romántica. El registro adaptado por `careBond` ya evita el riesgo real (cuidado romántico filtrándose a no-parejas).

### Requiere confirmación antes de usar
Que lo inferido no alimente sugerencias hasta que Aaron confirme. Descartado: más fricción; el `confidence='low'` + "el exacto pisa" + el piso de delta del forecast ya acotan el daño de un falso positivo.

### No hacerlo (solo manual)
Deja el caso Dayana sin resolver. Descartado.

## References
- Fix #629 (guardrail que este ADR override), `docs/BACKLOG.md`.
- [[0009-privacidad-terceros]], [[0006-wellbeing-not-engagement]], `docs/17_MENSTRUAL_CYCLE.md`.
- Migración `0146_person_cycles_chat_inferred.sql`; extractor `src/lib/capture/whatsapp/export/cycleSignals.ts`.
