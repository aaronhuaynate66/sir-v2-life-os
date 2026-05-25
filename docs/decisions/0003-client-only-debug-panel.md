# 0003. RichContextDebugPanel renderizado client-only para evitar hydration mismatch

- **Status:** Accepted
- **Date:** 2026-05-23
- **Deciders:** Aaron Huaynate
- **Tags:** frontend, ssr, hydration, debugging
- **Related:** [[0002-rich-context-snapshot]]

## Context

El `RichContextDebugPanel` se montó originalmente como componente normal en `/dashboard` (PR #3, R5.1D). Renderizaba el `RichContextSnapshot` con timestamp, balance formateado, alertas y memoria. En el primer mount real, React arrojó *hydration mismatch warnings*: el servidor renderizaba un snapshot con `localStorage` vacío (porque en SSR no hay `localStorage`) mientras el cliente renderizaba con los datos persistidos.

El mismo problema apareció con el reloj del dashboard (`new Date().toLocaleTimeString()`): el servidor pinta una hora, el cliente otra unos ms después → warning.

Causas raíz:

1. **Zustand persist middleware** rehidrata desde `localStorage` en client mount. En SSR el store está en estado inicial; en client tras hidratar tiene datos. El HTML del servidor y el primer render del cliente difieren.
2. **`new Date()` en render** es no determinístico entre runs servidor/cliente.

## Decision

**El `RichContextDebugPanel` se monta client-only** vía un `useEffect` que setea `mounted = true` después del primer render del cliente. Mientras `mounted === false`, el panel devuelve `null` (no se pinta nada). Esto significa:

- El servidor no renderiza el panel en absoluto.
- El cliente lo renderiza después del montaje, con `localStorage` ya hidratado.
- No hay diff servidor/cliente porque el servidor nunca pinta esto.

El mismo patrón se aplicó al reloj del dashboard y a cualquier número formateado con `toLocaleString()` que dependa de hora local del usuario.

Patrón implementado:

```tsx
"use client";
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
if (!mounted) return null;
return <Panel snapshot={snapshot} />;
```

## Consequences

### Positive

- **Cero warnings de hydration.** El SSR sigue siendo válido para el resto del dashboard; solo el panel queda fuera del primer render.
- **No contamina el hook `useRichContext`.** El hook sigue siendo isomórfico; la decisión de cuándo renderizar vive en el consumidor.
- **Patrón reusable.** Cualquier widget que dependa de estado persistido o de `Date.now()` puede aplicar lo mismo.

### Negative

- **El panel parpadea brevemente al cargar.** Hay un frame donde el panel no existe y luego aparece. Para un debug panel es irrelevante; para una UI de producción habría que considerar un skeleton.
- **El panel no está disponible si JS está deshabilitado.** Aceptado: el debug panel no tiene sentido sin JS.
- **Si llegamos a tener decenas de componentes con este patrón, el flicker se nota.** Mitigación: en Fase 4 (UI producción) considerar SSR con datos pre-hidratados desde el server (Server Actions o un endpoint que lea desde Supabase cuando exista backend).

## Alternatives considered

### Alternativa A: Hacer el snapshot SSR-aware (devolver default vacío en servidor)

**Por qué no:** el componente sigue divergiendo entre server (vacío) y client (con datos). El warning aparece igual cuando el cliente re-renderiza con los datos.

### Alternativa B: Desactivar SSR para la ruta entera con `dynamic: "force-dynamic"`

**Por qué no:** mata SSR para todo `/dashboard`, incluyendo partes que sí son determinísticas. Solución desproporcionada al problema.

### Alternativa C: Custom Next.js dynamic import con `ssr: false`

**Por qué no:** funciona, pero introduce un wrapper más. El patrón `useEffect + mounted` es self-contained en el componente.

### Alternativa D: `suppressHydrationWarning`

**Por qué no:** silencia el síntoma sin arreglar la causa. Si en el futuro divergen más cosas no nos vamos a enterar.

## References

- `src/components/RichContextDebugPanel.tsx` — implementación
- PR #3 (introducción del panel), PR #4 (fix balance locale), PR #5 (fix panel client-only), PR #6 (reloj client-only)
- [Next.js docs — Hydration mismatch](https://nextjs.org/docs/messages/react-hydration-error)
- [[0002-rich-context-snapshot]] — el componente que se ve afectado
