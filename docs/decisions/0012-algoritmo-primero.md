# 0012. Algoritmo-primero: la IA es una capa de mejora, no el cimiento

- **Status:** Accepted
- **Date:** 2026-07-13
- **Deciders:** Aaron

## Context

El costo de IA crece con el uso y ata a SIR a un proveedor (ver [[0011-llm-multiproveedor-y-datos]]). Pero la palanca más grande de costo **y** de independencia no es "API más barata" — es **no usar IA donde no hace falta**. Aaron lo planteó directo: *"hay cosas que primero deben pasar por versiones full probabilísticas/algorítmicas antes de meterle mucha IA que nos vuelve muy dependientes."*

SIR ya nace con esta filosofía en gran parte: los engines son puros y determinísticos (`engines/timing`, `engines/recommendation`, `engines/priority`, daily-actions scoring sin IA, forecast del ciclo N-de-1, regularidad, y la inferencia de ciclo desde chat es 100% regex). Pero no está escrito como **invariante**, y hay ~30 rutas que llaman IA sin auditar si el trabajo se podía hacer sin ella.

## Decision

**Toda feature nace en su versión determinística/probabilística. La IA se agrega solo como capa de mejora, cuando aporta valor que el algoritmo no puede dar.**

Regla operativa:
1. **Diseñar el algoritmo primero.** Reglas, embeddings, estadística N-de-1, heurísticas puras y testeables. Si resuelve el 80% bien, se envía así.
2. **La IA entra solo donde el algoritmo no llega:** lenguaje natural conversacional, síntesis narrativa, extracción de estructura desde texto libre/imagen ambigua, juicio matizado. NO para: clasificar en categorías cerradas, rankear con criterios definidos, formatear, contar, deduplicar, parsear formatos conocidos.
3. **Clasificar cada uso de IA** como *esencial-IA* o *reemplazable*. Los reemplazables se migran a algoritmo o al modelo más barato posible.
4. **Preferir puro + testeable.** Un engine puro se testea sin red, sin costo, sin flakiness — y no depende de ningún proveedor.

## Consequences

### Positive
- Menor costo (menos llamadas) y menor dependencia de proveedores — ataca la raíz, no el síntoma.
- Más determinismo → más testeable, más confiable, sin latencia/502 de IA en el camino crítico.
- Coherente con lo que SIR ya es (engines puros); esto lo vuelve regla, no accidente.

### Negative
- Más trabajo de diseño up-front por feature (pensar el algoritmo antes del atajo IA).
- Riesgo de sobre-ingeniería si se fuerza un algoritmo donde la IA era claramente lo correcto → el criterio (punto 2) lo acota.

## Alternatives considered
- **IA-primero (prototipar con IA, optimizar después):** más rápido al inicio, pero acumula costo + dependencia + deuda (lo que motivó este ADR). Descartado como default; válido solo para spikes descartables.

## Referencias
- [[0011-llm-multiproveedor-y-datos]], [[0006-wellbeing-not-engagement]], `engines/*` (los puros ya existentes).
