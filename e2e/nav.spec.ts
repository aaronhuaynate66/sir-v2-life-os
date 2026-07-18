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
    // El drawer es un Sheet de Radix → role="dialog". Acotamos AHÍ (evita matchear
    // el sidebar desktop oculto o links de contenido de /panel).
    const drawer = page.getByRole('dialog')
    await expect(drawer, 'el drawer no abrió').toBeVisible({ timeout: 5_000 })
    const relaciones = drawer.getByRole('link', { name: 'Relaciones' })
    await expect(relaciones, 'el drawer no mostró los links').toBeVisible()

    // Navegar por el drawer cambia de ruta (y lo cierra).
    await relaciones.click()
    await expect(page).toHaveURL(/\/relaciones/, { timeout: 15_000 })
  })

  test('el drawer abre y lista los enlaces principales', async ({ page }) => {
    const vp = page.viewportSize()
    test.skip(!vp || vp.width >= 1024, 'en desktop el sidebar es fijo (no hay drawer)')
    const ok = await gotoRoute(page, '/panel')
    test.skip(!ok, 'rebotó al login')
    await page.getByLabel('Abrir menu').click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible({ timeout: 5_000 })
    // Un puñado de secciones deben estar en el drawer.
    for (const label of ['Relaciones', 'Salud', 'Objetivos']) {
      await expect(drawer.getByRole('link', { name: label })).toBeVisible()
    }
  })
})
