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

/**
 * ¿Se EXIGE que la sesión autenticada funcione? PURA (lee env).
 *
 * En local, correr sin credenciales y probar solo lo público es legítimo. En CI no:
 * ahí el verde tiene que significar "se probó", no "no había nada que probar".
 */
export function exigeAuth(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.E2E_REQUIRE_AUTH === '1'
}

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
    } else if (exigeAuth()) {
      // ═══ EN CI, NO PODER AUTENTICAR ES UNA FALLA — NO UN SKIP ══════════════
      //
      // Cada spec de rutas privadas está guardado por `test.skip(!isAuthed())`. Sin
      // credenciales, **toda la suite de la zona autenticada se saltaba y el job
      // salía VERDE igual**: nav, overflow, tap-targets y el smoke de las privadas.
      // Un check en verde que no probó nada es peor que no tener el check, porque
      // se lee como cobertura.
      //
      // Es el mismo modo de falla que este repo persigue hace días —algo que no
      // corre y reporta éxito— aplicado justamente al harness que debería cazarlo.
      // Medido el 5-ago-2026 en el barrido de pendientes.
      //
      // Falla ACÁ y no en cada spec: un solo mensaje claro, antes de gastar 20
      // minutos de runner corriendo la mitad de la suite.
      throw new Error(
        '[e2e] E2E_REQUIRE_AUTH=1 y no se pudo autenticar contra ' + target + '. ' +
        'Las rutas privadas se habrían saltado en silencio y el job habría salido verde sin probarlas. ' +
        'Revisa SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL y que /api/dev-login esté habilitado.',
      )
    } else {
      console.warn(
        '[e2e] No se pudo autenticar (¿falta SUPABASE_SERVICE_ROLE_KEY o el server no corre en dev?). ' +
        'Se probarán SOLO las rutas públicas; las privadas se saltan. ' +
        'Esto es aceptable en local; en CI se exige con E2E_REQUIRE_AUTH=1.',
      )
    }
  } finally {
    await browser.close()
  }
}

export default globalSetup
