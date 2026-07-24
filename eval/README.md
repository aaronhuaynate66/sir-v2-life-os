# Harness de eval del cerebro de SIR (Ola 2)

Mide si un cambio **mejora o empeora** las respuestas de SIR, en vez de optimizar
a ciegas. Corre cada caso contra el `/api/sir/ask` real (cerebro + data real) y
puntúa la respuesta con un LLM-juez según la rúbrica (`src/lib/eval/judge.ts`).

## Correr

```bash
npm run dev                 # en otra terminal (dev-login solo existe en dev)
node scripts/eval-sir.ts    # corre el golden-set
```

Opciones:
- `--from-feedback 20` — suma los 20 👍/👎 más recientes que dejaste en el chat
  (tabla `chat_feedback`): los 👎 se evalúan contra tu corrección, los 👍 como
  positivos. Así el harness aprende de tu uso real, sin que escribas casos.
- `--only <tag>` — corre solo casos con ese tag (`grounding`, `honesty`,
  `language`, `action`, `seed`…).
- `--base <url>` — default `http://localhost:3000`.

El juez usa Anthropic (`claude-sonnet-4-5`); overridea con `EVAL_JUDGE_MODEL`.
Lee las llaves de `.env.local`.

## Agregar casos (Aaron)

Edita `eval/golden.jsonl` — **un JSON por línea** con estos campos:

```json
{"id":"nombre-corto","question":"lo que le preguntas a SIR","expect":"qué debería lograr una buena respuesta","mustNotDo":"qué NO debe hacer","tags":["grounding"]}
```

- `question` (obligatorio): la pregunta.
- `expect` (recomendado): en qué consiste una buena respuesta — el juez lo usa.
- `mustNotDo` (opcional): la trampa a evitar (inventar, vosear, prometer sin hacer…).
- `context` (opcional): contexto extra que se pasa como `userContext`.
- `tags` (opcional): para filtrar con `--only`.

La forma más fácil de sumar casos: **usa SIR normal, da 👍 a lo bueno y 👎 +
corrección a lo malo**. Se guardan solos en `chat_feedback` y entran con
`--from-feedback`.

## Rúbrica (5 dimensiones)

`grounding` (usa data real, no inventa) · `honesty` (admite cuando no sabe, sin
floro, no promete sin hacer) · `language` (peruano, tuteo, sin voseo) ·
`usefulness` (responde lo que se preguntó) · `tone` (cálido, de cuidado, no
clínico). Ver `src/lib/eval/judge.ts` para el detalle. Umbral de aprobado: 70.
