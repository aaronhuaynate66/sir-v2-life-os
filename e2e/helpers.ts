// SIR V2 — Helpers del harness de QA móvil (issue #819).

import { existsSync } from 'node:fs'

import { expect, type Page } from '@playwright/test'

import { AUTHED_MARKER } from './global-setup'

/** ¿La sesión quedó autenticada? global-setup deja un marcador en disco si
 *  /api/dev-login funcionó (los workers son procesos aparte → flag por archivo,
 *  no por env). Los specs de rutas privadas se saltan si es false. */
export function isAuthed(): boolean {
  return existsSync(AUTHED_MARKER)
}

/**
 * Navega a una ruta y espera que asiente. Devuelve false si la app nos rebotó al
 * login (sesión no válida) para una ruta que NO es pública → el caller la salta.
 */
export async function gotoRoute(page: Page, route: string): Promise<boolean> {
  await page.goto(route, { waitUntil: 'domcontentloaded' })
  // La red de fondo puede seguir; damos un beat para que pinte el layout.
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  const url = new URL(page.url())
  const bouncedToLogin = url.pathname.startsWith('/auth/login')
  const wantedLogin = route.startsWith('/auth/login')
  return wantedLogin ? true : !bouncedToLogin
}

/**
 * El chequeo estrella: NADA debe forzar scroll horizontal. Comparamos el ancho
 * de scroll del documento contra el ancho visible del viewport (con 1px de
 * tolerancia por redondeos sub-pixel). Si algo desborda, reporta CUÁNTO.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      innerWidth: window.innerWidth,
    }
  })
  const overflowBy = metrics.scrollWidth - metrics.clientWidth
  expect(
    overflowBy,
    `${label}: overflow horizontal de ${overflowBy}px (scrollWidth ${metrics.scrollWidth} > clientWidth ${metrics.clientWidth})`,
  ).toBeLessThanOrEqual(1)
}

/**
 * Encuentra elementos con scroll horizontal propio que NO lo declaran
 * (overflow-x visible) — soplo de una tabla/pre/grid ancho sin wrapper. Se usa
 * como diagnóstico adicional; devuelve una lista de selectores culpables.
 */
export async function findOverflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    const vw = document.documentElement.clientWidth
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      if (el.scrollWidth > vw + 1) {
        const style = getComputedStyle(el)
        if (style.overflowX === 'visible') {
          const id = el.id ? `#${el.id}` : ''
          const cls = typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''
          out.push(`${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 80))
        }
      }
    }
    return Array.from(new Set(out)).slice(0, 10)
  })
}
