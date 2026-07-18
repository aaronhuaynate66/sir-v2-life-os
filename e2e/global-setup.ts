// SIR V2 — global-setup del harness de QA móvil (issue #819).
//
// Autentica una vez y guarda el storageState que reusan todos los proyectos.
// Método: navegar a /api/dev-login (mintea la sesión del mono-usuario con el
// service-role; guardado a NODE_ENV=development → por eso el server corre en dev).
// Si no hay service-role o el login falla, escribe un state VACÍO y NO deja el
// marcador `authed` → los specs de rutas privadas se saltan solos.

import { chromium, type FullConfig } from '@playwright/test'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

export const AUTH_DIR = 'e2e/.auth'
export const STATE_FILE = `${AUTH_DIR}/state.json`
export const AUTHED_MARKER = `${AUTH_DIR}/authed`

const EMPTY_STATE = JSON.stringify({ cookies: [], origins: [] })

async function globalSetup(config: FullConfig): Promise<void> {
  mkdirSync(AUTH_DIR, { recursive: true })
  // Base URL del primer proyecto (todos comparten el server).
  const baseURL = config.projects[0]?.use?.baseURL ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000'

  // Estado por defecto: vacío + sin marcador (asumimos no-autenticado).
  writeFileSync(STATE_FILE, EMPTY_STATE)
  if (existsSync(AUTHED_MARKER)) rmSync(AUTHED_MARKER)

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const target = `${baseURL.replace(/\/$/, '')}/api/dev-login?next=/panel`
    try {
      await page.goto(target, { waitUntil: 'networkidle', timeout: 60_000 })
    } catch (e) {
      console.warn(`[e2e] dev-login no respondió (${target}): ${e instanceof Error ? e.message : e}`)
    }
    const authed = new URL(page.url()).pathname.startsWith('/panel')
    if (authed) {
      await page.context().storageState({ path: STATE_FILE })
      mkdirSync(dirname(AUTHED_MARKER), { recursive: true })
      writeFileSync(AUTHED_MARKER, new Date(0).toISOString()) // marcador de sesión válida
      console.log('[e2e] Sesión autenticada vía /api/dev-login — rutas privadas ACTIVAS.')
    } else {
      console.warn(
        '[e2e] No se pudo autenticar (¿falta SUPABASE_SERVICE_ROLE_KEY o el server no corre en dev?). ' +
        'Se probarán SOLO las rutas públicas; las privadas se saltan.',
      )
    }
  } finally {
    await browser.close()
  }
}

export default globalSetup
