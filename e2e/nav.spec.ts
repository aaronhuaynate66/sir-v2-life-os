// SIR V2 — QA móvil: el drawer de navegación abre/cierra en móvil (issue #819).
// Solo aplica en viewports < lg (1024px) y con sesión (el nav vive en AppShell).

import { test, expect } from '@playwright/test'
import { gotoRoute, isAuthed } from './helpers'

test.describe('Navegación móvil (drawer)', () => {
  test.skip(!isAuthed(), 'sin sesión — el nav vive en la zona autenticada')

  test('el hamburger abre el drawer y deja navegar', async ({ page }) => {
    const vp = page.viewportSize()
    test.skip(!vp || vp.width >= 1024, 'en desktop el sidebar es fijo (no hay drawer)')

    const ok = await gotoRoute(page, '/panel')
    test.skip(!ok, 'rebotó al login')

    const hamburger = page.getByLabel('Abrir menu')
    await expect(hamburger, 'no se ve el botón de menú en móvil').toBeVisible()

    await hamburger.click()
    // Al abrir, aparece al menos un link conocido del nav.
    const relaciones = page.getByRole('link', { name: 'Relaciones' }).first()
    await expect(relaciones, 'el drawer no mostró los links tras abrir').toBeVisible({ timeout: 5_000 })

    // Navegar por el drawer cierra el drawer y cambia de ruta.
    await relaciones.click()
    await expect(page).toHaveURL(/\/relaciones/, { timeout: 15_000 })
  })
})
