# 0007 — Scope de Finanzas y Salud en SIR V2

- **Estado:** Accepted
- **Fecha:** 2026-06-08
- **Decisor:** Aaron

## Contexto

El arco de SIR es relaciones → memoria → comportamiento → identidad → dirección → OS. El Principio #4 (claridad conceptual / evitar scope infinito) marcó como tensión que `/finanzas` y `/yo` (salud: báscula, sueño, FC, Apple Health) empujan hacia un "life OS" antes de tiempo y no pertenecen, a primera vista, a ese arco.

Al evaluarlo contra el código se descubrió que la premisa "son módulos satélite que se podrían quitar" es **falsa a nivel arquitectónico**: finanzas y salud son **2 de los 5 componentes del Peace Score** (`biological`, `relational`, `financial`, `goalProgress`, `emotional`), la métrica central de bienestar que alimenta el `RichContextSnapshot`, Mission Control y el briefing diario. Quitarlas no es desconectar un módulo: es vaciar el 40% del motor de bienestar.

Además se detectó un bug latente: el componente financiero **no era neutral sin datos** — `analyzeFinancialStability([])` devolvía stability 2.5 → `riskLevel: 'critical'` y disparaba una falsa "Alerta financiera critica" / "Liquidez critica". El sistema penalizaba el bienestar por *no* cargar finanzas.

## Decisión

1. **Salud SE QUEDA.** No es scope creep: es literalmente la **Etapa 3 (Behavioral Intelligence)** del roadmap (hábitos, energía, sueño). Sacarla contradiría el roadmap.
2. **Finanzas SE MANTIENE como input de bienestar personal, NO como pilar de producto (Opción A).** Se **congela** el agregado de features de finanzas (no más sub-módulos: presupuestos, categorías, etc.). No se saca porque está cableada al Peace Score y el costo de removerla supera el beneficio en una beta personal.
3. **Quick-win asociado (incluido en este cambio):** el Peace Score y las alertas tratan la **ausencia de datos financieros como NEUTRAL**, no como crítico. `liquidityMonths === 0` se interpreta como "desconocido", no "cero meses de runway".

Se descartó la Opción B (modularizar con toggle + re-ponderar el Peace Score) por ser over-engineering para beta personal, y la Opción C (sacar finanzas) por destructiva y por mutilar el Peace Score.

## Consecuencias

- **Positivas:** el Peace Score sigue completo y ahora no penaliza por ausencia de datos; el arco relacional→identidad recupera el foco al frenar el crecimiento de finanzas; cero retrabajo destructivo.
- **Negativas / aceptadas:** las rutas `/finanzas` y `/yo` siguen visibles (la disciplina de "no construir más en finanzas" depende de criterio, no de un gate técnico). Si en el futuro SIR deja de ser solo de Aaron y otros usuarios no quieren la capa financiera, habría que revisar hacia la Opción B (toggle + re-ponderación).
- **Revisión:** reabrir esta decisión solo si (a) SIR pasa a multi-usuario, o (b) finanzas vuelve a crecer en superficie sin justificación de bienestar.

## Alternativas consideradas

- **B — Modularizar con toggle:** finanzas/salud opcionales; Peace Score re-pondera excluyendo componentes ausentes. Más honesto a futuro, pero requiere refactor del Peace Score. Pospuesto.
- **C — Sacar finanzas:** archivar rutas + bajar Peace Score a 3 componentes. Alto costo, destructivo, contradice la tesis "persona completa". Descartado.
