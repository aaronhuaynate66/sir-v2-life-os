// SIR V2 — Config de Playwright (harness de QA móvil, issue #819).
//
// AISLADO del pipeline `validate` (type-check/lint/vitest/build):
//  - vitest solo mira `src/**/*.test.ts` (este dir es `e2e/`) → no lo toca.
//  - tsconfig raíz excluye `e2e` y este archivo → `tsc --noEmit` no lo revisa.
//  - `next lint`/`next build` no miran `e2e/`.
// Corre en su PROPIO workflow (.github/workflows/e2e.yml), nunca en `validate`.
//
// Auth: el server arranca en modo dev (`next dev`) para que `/api/dev-login`
// (guardado a NODE_ENV=development) pueda mintear la sesión del mono-usuario;
// global-setup navega ahí y guarda el storageState. Sin service-role / si el
// login falla, los tests de rutas privadas se SALTAN solos (ver helpers).

import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 3000)
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // El primer hit a cada ruta en `next dev` compila on-demand → damos aire.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // `next dev` no aguanta bien mucha concurrencia (compila on-demand).
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    storageState: 'e2e/.auth/state.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  // Viewports de QA móvil pedidos (375/390/414/768) + un baseline desktop.
  projects: [
    { name: 'mobile-se', use: { ...devices['iPhone SE'] } },              // 375×667
    { name: 'mobile-390', use: { ...devices['iPhone 12'] } },             // 390×844
    { name: 'mobile-xl', use: { ...devices['iPhone 11 Pro Max'] } },      // 414×896
    { name: 'tablet', use: { ...devices['iPad Mini'] } },                 // 768×1024
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  // Sin E2E_BASE_URL, levantamos el server nosotros (modo dev para dev-login).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
})
