// SIR V2 — QA móvil: los controles primarios tienen un tap target usable en
// móvil (issue #819). Chequeo LENIENTE y focalizado (un barrido total sería
// flaky); apunta a los controles que más se tocan.

import { test, expect } from '@playwright/test'
import { gotoRoute, isAuthed } from './helpers'

// SIR usa controles compactos; 36px es un piso razonable (HIG sugiere 44, pero
// no queremos falsos negativos por el design system denso). < 32 sí es problema.
const MIN_TAP = 32

test.describe('Tap targets móviles', () => {
  test('el botón de menú (hamburger) es tocable', async ({ page }) => {
    const vp = page.viewportSize()
    test.skip(!vp || vp.width >= 1024, 'el hamburger solo existe en móvil')
    test.skip(!isAuthed(), 'el hamburger vive en la zona autenticada')
    const ok = await gotoRoute(page, '/panel')
    test.skip(!ok, 'rebotó al login')

    const box = await page.getByLabel('Abrir menu').boundingBox()
    expect(box, 'no se encontró el hamburger').not.toBeNull()
    expect(box!.height, `hamburger alto ${box!.height}px < ${MIN_TAP}`).toBeGreaterThanOrEqual(MIN_TAP)
    expect(box!.width, `hamburger ancho ${box!.width}px < ${MIN_TAP}`).toBeGreaterThanOrEqual(MIN_TAP)
  })

  test('el CTA primario del login es tocable', async ({ page }) => {
    await gotoRoute(page, '/auth/login')
    const submit = page.getByRole('button', { name: /enviar|entrar|continuar|magic|enlace|acceder/i }).first()
    if (await submit.count() === 0) test.skip(true, 'no se ubicó el CTA de login por nombre')
    const box = await submit.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height, `CTA login alto ${box!.height}px < ${MIN_TAP}`).toBeGreaterThanOrEqual(MIN_TAP)
  })
})
