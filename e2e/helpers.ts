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
    const vw = document.documentElement.clientWidth
    const hits: { sel: string; ow: number; right: number; sw: number; ox: string }[] = []
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const rect = el.getBoundingClientRect()
      // Solo lo que REALMENTE sale del viewport por la derecha causa scroll de
      // página. Un elemento con scrollWidth enorme pero clippeado (overflow-x
      // hidden/auto) y dentro del viewport NO desborda → se ignora (era ruido).
      if (rect.right <= vw + 1) continue
      const style = getComputedStyle(el)
      const id = el.id ? `#${el.id}` : ''
      const cls = typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
        : ''
      hits.push({
        sel: `${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 90),
        ow: Math.round(rect.width),
        right: Math.round(rect.right),
        sw: el.scrollWidth,
        ox: style.overflowX,
      })
    }
    // El que más sobresale a la derecha primero: ese arrastra el scroll del doc.
    hits.sort((a, b) => b.right - a.right)
    return hits.slice(0, 8).map((h) => `${h.sel} [w=${h.ow} right=${h.right} sw=${h.sw} ox=${h.ox}]`)
  })
}
