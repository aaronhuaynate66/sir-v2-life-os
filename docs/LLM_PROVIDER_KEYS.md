# Bajar costos de IA — cómo activar un proveedor barato

> **TL;DR:** el código ya está listo. Todas las rutas de texto pasan por `complete()`
> (capa `src/lib/llm/`), que rutea al proveedor **más barato disponible** y cae a
> Anthropic si falla. **Para activar el ahorro solo falta cargar UNA API key barata
> como variable de entorno en Vercel.** Cero código.

## Cómo funciona el ruteo

`complete()` mira qué proveedores tienen su env key seteada (`availableProviders()`)
y arma la cadena de intentos por costo. Con solo `ANTHROPIC_API_KEY` todo va a
Anthropic (como hoy). Apenas agregás una key barata, las tareas `cheap`/`balanced`
la prefieren y Anthropic queda de fallback. Las `capable` (juicio: decisiones,
profiling, influence) siguen priorizando Anthropic por calidad.

Catálogo declarativo en [`src/lib/llm/registry.ts`](../src/lib/llm/registry.ts).

## Proveedores soportados (env var + dónde sacar la key)

Precio por 1M tokens vs **Anthropic Sonnet ($3 in / $15 out)**:

| Proveedor | Env var | Sacar la key en | Costo aprox (in/out) | ¿Entrena con tu input? |
|---|---|---|---|---|
| **DeepSeek** ⭐ más barato | `DEEPSEEK_API_KEY` | https://platform.deepseek.com | $0.28 / $0.42 | Sí |
| **OpenRouter** ⭐ más rápido | `OPENROUTER_API_KEY` | https://openrouter.ai | ~$0.5 / $1.5 | **No** |
| Qwen (Alibaba) | `DASHSCOPE_API_KEY` | https://dashscope.console.aliyun.com | ~$0.4 / $1.2 | Sí |
| Zhipu (GLM) | `ZHIPU_API_KEY` | https://open.bigmodel.cn | ~$0.6 / $2 | Sí |
| Kimi (Moonshot) | `MOONSHOT_API_KEY` | https://platform.moonshot.cn | ~$0.6 / $2.5 | Sí |

> **Contexto (ADR 0011):** Aaron aceptó que lo sensible de terceros PUEDE ir a
> proveedores baratos/extranjeros, incluso los que entrenan con input. Si preferís
> uno que NO entrene con tu data, **OpenRouter** es la opción.

## Recomendación

- **Arrancar ya:** OpenRouter — un login con Google, una key, decenas de modelos
  (incluye DeepSeek), no entrena con tu input. ~2 min.
- **Exprimir el costo:** sumar `DEEPSEEK_API_KEY` (el más barato). El router prefiere
  el más barato disponible solo.

Podés cargar varias: el router usa la más barata y cae a las otras / Anthropic.

## Pasos para activar (Vercel)

La key es **secreta** — va en Vercel, **nunca** en el repo.

**Opción CLI** (si tenés `vercel` linkeado al proyecto):
```bash
vercel env add OPENROUTER_API_KEY production   # pegás la key cuando la pida
vercel --prod                                   # redeploy para que la tome
```

**Opción dashboard:**
1. Vercel → tu proyecto → **Settings → Environment Variables → Add**.
2. Name = `OPENROUTER_API_KEY` (o el de la tabla), Value = la key, Environment = **Production**.
3. **Redeploy** (Deployments → ⋯ → Redeploy) para que las funciones tomen el env.

## Verificar que quedó activa

Después del redeploy, al usar cualquier ruta migrada la tabla **`ai_usage`** empieza
a registrar `provider` = `openrouter:...` / `deepseek:...` (hoy dice `anthropic:...`).
Ahí ves el switch y el costo real por ruta/tarea.

## Estado de la migración

Rutas de texto migradas a `complete()` → ver [`AI_USAGE_AUDIT.md`](./AI_USAGE_AUDIT.md).
Bucket (a) completo (2026-07-14). Pendiente: rutas de visión (track F) y el chat con tools.
