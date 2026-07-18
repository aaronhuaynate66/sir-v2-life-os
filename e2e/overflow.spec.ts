// SIR V2 — QA móvil: NINGUNA ruta debe forzar scroll horizontal (issue #819).
//
// El bug móvil #1. Corre por CADA viewport (proyectos del config) × cada ruta.
// Las rutas privadas se saltan si no hubo login.

import { test } from '@playwright/test'
import { PUBLIC_ROUTES, APP_ROUTES } from './routes'
import { gotoRoute, expectNoHorizontalOverflow, findOverflowingElements, isAuthed } from './helpers'

test.describe('Sin overflow horizontal — rutas públicas', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route}`, async ({ page }) => {
      await gotoRoute(page, route)
      const culprits = await findOverflowingElements(page)
      await expectNoHorizontalOverflow(page, `${route}${culprits.length ? ` · culpables: ${culprits.join(', ')}` : ''}`)
    })
  }
})

test.describe('Sin overflow horizontal — rutas de la app', () => {
  test.skip(!isAuthed(), 'sin sesión (falta service-role/creds) — se saltan las rutas privadas')
  for (const route of APP_ROUTES) {
    test(`${route}`, async ({ page }) => {
      const ok = await gotoRoute(page, route)
      test.skip(!ok, `rebotó al login: ${route}`)
      const culprits = await findOverflowingElements(page)
      await expectNoHorizontalOverflow(page, `${route}${culprits.length ? ` · culpables: ${culprits.join(', ')}` : ''}`)
    })
  }
})
