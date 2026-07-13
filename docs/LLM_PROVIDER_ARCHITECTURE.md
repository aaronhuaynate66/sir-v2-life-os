# Arquitectura de proveedores LLM — spec (para revisar antes de construir)

> Estado: **PROPUESTA**. Fecha: 2026-07-13. Decisiones que la fundan: [[decisions/0011-llm-multiproveedor-y-datos]] (multi-proveedor + política de datos) y [[decisions/0012-algoritmo-primero]] (IA como capa de mejora). **Nada de esto está construido aún** — es el plan a aprobar.

## 1. Problema

Hoy ~30 rutas (`src/app/api/**`) instancian `new Anthropic()` y llaman `messages.create` directo. Consecuencias: (a) dependencia total de un proveedor, (b) costo alto sin poder rutear a alternativas baratas, (c) sin fallback ante rate-limit/caída, (d) cambiar de modelo = editar 30 archivos. La única semilla multi-proveedor (`lib/sir/model.ts`) vive solo en el chat.

## 2. Diseño: `lib/llm/`

Una capa fina que TODAS las rutas usan en vez del SDK directo.

```
lib/llm/
  types.ts        # LlmMessage, LlmRequest, LlmResponse, Task, Sensitivity
  providers/
    anthropic.ts  # adaptador nativo (@anthropic-ai/sdk)
    openaiCompat.ts# adaptador OpenAI-compatible (cubre DeepSeek, Qwen/DashScope,
                   #   GLM/Zhipu, Kimi/Moonshot, OpenRouter, Together…): un
                   #   fetch a /chat/completions con baseURL+key por proveedor.
  registry.ts     # catálogo: proveedor → {baseURL, envKey, modelos, costo, trains?}
  router.ts       # elige proveedor+modelo por (task, cost, sensitivity)
  complete.ts     # API pública: complete(req) con fallback chain + retries
  usage.ts        # telemetría de tokens/costo por (task, provider) → medir gasto
```

### Interfaz pública (única que ven las rutas)

```ts
// Reemplaza al new Anthropic()/messages.create de cada ruta.
const res = await complete({
  task: 'briefing_daily',        // etiqueta de tarea (para routing + métricas)
  sensitivity: 'third_party',    // 'none' | 'self' | 'third_party'
  system, messages,              // prompt
  maxTokens, temperature,
  // opcional: forzar tier/proveedor; por default lo decide el router.
})
// res: { text, provider, model, usage, cost, fellBackTo? }
```

### Adaptador OpenAI-compatible = un código, muchos proveedores

La mayoría de proveedores chinos exponen `/v1/chat/completions` estilo OpenAI. Un solo adaptador (baseURL + key + modelId por entrada del registry) cubre DeepSeek, Qwen (DashScope), GLM (Zhipu), Kimi (Moonshot), Together, Groq y OpenRouter. Anthropic tiene su propio adaptador nativo (mejor soporte de features/streaming).

### Registry (catálogo de proveedores)

Tabla declarativa, "bring your own key" (env vars en Vercel, nada en la base):

| provider | envKey | ejemplos de modelo | costo rel. | trains-on-input |
|---|---|---|---|---|
| anthropic | `ANTHROPIC_API_KEY` | haiku, sonnet, opus | alto | no |
| deepseek | `DEEPSEEK_API_KEY` | deepseek-chat, deepseek-reasoner | muy bajo | sí (revisar tier) |
| qwen | `DASHSCOPE_API_KEY` | qwen-max, qwen-plus | bajo | sí (revisar) |
| zhipu | `ZHIPU_API_KEY` | glm-4.6 | bajo | sí (revisar) |
| moonshot | `MOONSHOT_API_KEY` | kimi-k2 | bajo | sí (revisar) |
| openrouter | `OPENROUTER_API_KEY` | (gateway a todo) | variable | según modelo |

> Nota honesta (ADR 0011): con la política elegida, `sensitivity` NO excluye proveedores — pero se registra y ordena la fallback chain. La columna `trains-on-input` queda documentada para que la decisión sea informada y reversible.

### Router

`router(task, cost, sensitivity) → [proveedor+modelo ordenados]` (primario + fallbacks). Reglas iniciales (ajustables sin tocar rutas):
- Tarea barata/mecánica (clasificar, formatear, extraer estructura) → modelo barato primero.
- Tarea de razonamiento/síntesis → modelo capaz primero.
- Conversación → el tier elegido por el usuario (ya existe en el chat).
- La chain siempre termina en un proveedor con key presente (si falta la env, se saltea con log claro).

### Fallback + retries

`complete()` intenta el primario; ante 429/5xx/timeout, cae al siguiente de la chain. Backoff corto. Devuelve `fellBackTo` para telemetría. Un fallo total → error claro (mismo patrón que hoy).

## 3. Medir antes/mientras (usage.ts)

Instrumentar tokens+costo por (task, provider) desde el día 1. Sin esto no sabemos qué rutas queman más ni si el ahorro es real. Alimenta la auditoría de [[decisions/0012-algoritmo-primero]] (qué reemplazar por algoritmo).

## 4. Migración de las ~30 rutas

1. Construir `lib/llm/` + tests del router/fallback (puros).
2. Migrar el chat (`/api/sir/ask`) — ya tiene el concepto, es el mejor primer caso.
3. Migrar las rutas caras primero (las que la telemetría marque). Cada una: reemplazar `new Anthropic()/messages.create` por `complete({task, sensitivity, …})`.
4. Dejar Anthropic como adaptador más (no como default hardcodeado).
5. Embeddings/transcripción (OpenAI) quedan fuera del alcance v1 (distinto tipo de tarea) — se pueden sumar después.

## 5. Orden de trabajo propuesto (cuando se apruebe)

1. `lib/llm/` (types + registry + openaiCompat + anthropic + complete + router + usage) con tests puros.
2. Cablear 1-2 proveedores baratos reales (ej. DeepSeek) + sus env en Vercel.
3. Migrar el chat + 2-3 rutas caras; comparar costo/calidad con la telemetría.
4. Iterar el router con datos reales; migrar el resto por costo descendente.
5. En paralelo, la auditoría algoritmo-primero (0012): matar/abaratar los usos reemplazables.

## 6. Riesgos
- **Calidad variable** entre proveedores → evals por tarea antes de rutear producción sensible a un modelo nuevo.
- **Privacidad de terceros** → aceptada en ADR 0011 (documentada, no oculta).
- **Drift de APIs** de proveedores chinos (cambios de formato/límites) → el adaptador OpenAI-compat aísla el golpe a un archivo.
