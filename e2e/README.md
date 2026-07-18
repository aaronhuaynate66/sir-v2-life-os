# Harness de QA móvil (Playwright) · issue #819

Automatiza el pase de QA que faltaba: cazar **overflow horizontal**, humo (rutas que
no cargan / errores de consola), el **drawer móvil** y **tap targets**, en los
viewports que Aaron usa. Corre por 5 proyectos: `mobile-se` (375), `mobile-390`
(390), `mobile-xl` (414), `tablet` (768) y `desktop` (1280).

## Aislado del CI principal
No toca `validate` (type-check/lint/vitest/build): vitest solo mira `src/**`, el
tsconfig raíz excluye `e2e/` y `playwright.config.ts`, y `next` no compila `e2e/`.
Corre en su **propio** workflow: `.github/workflows/e2e.yml` (manual + nightly).

## Correr local
```bash
npm run e2e:install        # una vez: baja el navegador (chromium)
npm run test:e2e           # levanta `next dev` solo y corre todo
npm run test:e2e -- --project=mobile-se overflow    # un proyecto/spec
npm run test:e2e:ui        # modo UI interactivo
npm run test:e2e:report    # ver el último reporte HTML
```

Contra un server ya levantado (no arranca uno):
```bash
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

## Auth
El server arranca en **modo dev** (`next dev`) a propósito: así `/api/dev-login`
(guardado a `NODE_ENV=development`) puede mintear la sesión del mono-usuario, y
`global-setup` guarda el `storageState`. Requiere en el entorno:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (lo usa `/api/dev-login`)

**Sin service-role o si el login falla:** se prueban SOLO las rutas públicas
(`/auth/login`); las privadas se **saltan** (no fallan). Así el harness es útil
aún sin secrets, y completo cuando están.

## CI
`.github/workflows/e2e.yml`: `workflow_dispatch` + nightly. Instala el navegador,
inyecta los secrets de Supabase, corre y sube el reporte HTML como artifact.
No corre en cada PR (necesita server + secrets y es más lento que `validate`).
