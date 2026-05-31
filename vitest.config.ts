// SIR V2 — Vitest config.
//
// Tests unitarios deterministas de lógica pura (sin red, sin LLM, sin DOM):
// reconciliación de sync, helpers de fecha/timezone, validators de captura,
// adapters de timeline. Environment 'node' alcanza para todo eso.
//
// Alias '@' resuelto a mano (sin plugin extra) para espejar el `paths` del
// tsconfig: `@/lib/...` -> `src/lib/...`.

import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
