import { describe, it, expect } from 'vitest'
import { deVoseo, detectVoseo } from './deVoseo'

describe('deVoseo', () => {
  it('reemplaza conjugaciones voseo comunes', () => {
    expect(deVoseo('si querés te lo agendo')).toBe('si quieres te lo agendo')
    expect(deVoseo('tenés que descansar')).toBe('tienes que descansar')
    expect(deVoseo('podés hacerlo')).toBe('puedes hacerlo')
    expect(deVoseo('¿sabés qué?')).toBe('¿sabes qué?')
  })

  it('reemplaza sos y vos', () => {
    expect(deVoseo('vos sos el que decide')).toBe('tú eres el que decide')
  })

  it('reemplaza más presentes -és/-ás (debés y cía.)', () => {
    expect(deVoseo('debés descansar')).toBe('debes descansar')
    expect(deVoseo('necesitás enfocarte y elegís uno')).toBe('necesitas enfocarte y eliges uno')
    expect(deVoseo('¿qué pensás?')).toBe('¿qué piensas?')
    expect(deVoseo('¿a qué te referís?')).toBe('¿a qué te refieres?')
    expect(deVoseo('si me sugerís algo y lo repetís')).toBe('si me sugieres algo y lo repites')
    // NO toca el nombre propio "Tomás" (no está en la lista a propósito)
    expect(deVoseo('habla con Tomás mañana')).toBe('habla con Tomás mañana')
  })

  it('reemplaza imperativos rioplatenses', () => {
    expect(deVoseo('decime cuándo')).toBe('dime cuándo')
    expect(deVoseo('mirá esto y ponete las pilas')).toBe('mira esto y ponte las pilas')
    expect(deVoseo('escribile hoy')).toBe('escríbele hoy')
  })

  it('preserva mayúscula de inicio de frase', () => {
    expect(deVoseo('Querés que te ayude?')).toBe('Quieres que te ayude?')
    expect(deVoseo('Sos capaz.')).toBe('Eres capaz.')
  })

  it('NO toca palabras válidas en Perú (dale, acá, allá) ni parciales', () => {
    expect(deVoseo('dale, nos vemos allá acá cerca')).toBe('dale, nos vemos allá acá cerca')
    // "sos" solo como palabra completa, no dentro de otra
    expect(deVoseo('los sospechosos')).toBe('los sospechosos')
    // "vos" no debe romper "vosotros" ni "nosotros"
    expect(deVoseo('nosotros')).toBe('nosotros')
  })

  it('barrido generativo: caza la cola larga de imperativos/presentes regulares', () => {
    // Deslices REALES de SIR (25-jul) que la lista blanca no cubría.
    expect(deVoseo('revisá tus apuntes de préstamos')).toBe('revisa tus apuntes de préstamos')
    expect(deVoseo('¿recordás cuándo fue?')).toBe('¿recuerdas cuándo fue?')
    expect(deVoseo('agendá el examen y avisá a tu mamá')).toBe('agenda el examen y avisa a tu mamá')
    expect(deVoseo('si lo revisás hoy, lo cierras')).toBe('si lo revisas hoy, lo cierras')
    expect(deVoseo('Cuidá esa relación')).toBe('Cuida esa relación')
  })

  it('imperativo + enclítico lleva su tilde peruana', () => {
    expect(deVoseo('si quieres mandame la captura')).toBe('si quieres mándame la captura')
    expect(deVoseo('dejame ver y avisame')).toBe('déjame ver y avísame')
    expect(deVoseo('cuidate mucho')).toBe('cuídate mucho')
    expect(deVoseo('asegurate y avisanos')).toBe('asegúrate y avísanos')
    expect(deVoseo('mandanos el diff y contanos')).toBe('mándanos el diff y cuéntanos')
    // Palabras legítimas con la misma forma: intactas.
    expect(deVoseo('dame el tomate y que llame luego')).toBe('dame el tomate y que llame luego')
  })

  it('imperativos con raíz en -r, que el barrido generativo no puede tocar', () => {
    // Se colaron al push de la noche del 26-jul: el generativo los excluye
    // porque ahí viven los futuros ("pagará", "tendrás").
    expect(deVoseo('Cerrá el día marcando lo que hiciste')).toBe('Cierra el día marcando lo que hiciste')
    expect(deVoseo('Si lo hiciste, registralo antes de dormir')).toBe('Si lo hiciste, regístralo antes de dormir')
    expect(deVoseo('esperá y comprá mañana')).toBe('espera y compra mañana')
    // Los futuros de verdad, intactos.
    expect(deVoseo('ella te pagará y él tendrá que esperar')).toBe('ella te pagará y él tendrá que esperar')
  })

  it('imperativo + objeto directo (lo cazó el eval)', () => {
    expect(deVoseo('bajalo de tu lista y cerralo hoy')).toBe('bájalo de tu lista y ciérralo hoy')
    expect(deVoseo('revisalo y anotalo')).toBe('revísalo y anótalo')
    expect(deVoseo('hacelo simple, decilo claro')).toBe('hazlo simple, dilo claro')
    // Palabras legítimas con la misma terminación: intactas.
    expect(deVoseo('el regalo malo del palo')).toBe('el regalo malo del palo')
  })

  it('barrido generativo: irregulares que diptongan NO quedan a medias', () => {
    expect(deVoseo('contás con eso')).toBe('cuentas con eso')
    expect(deVoseo('si te acordás, me dices')).toBe('si te acuerdas, me dices')
    expect(deVoseo('encontrás el mensaje ahí')).toBe('encuentras el mensaje ahí')
  })

  it('barrido generativo: NO toca futuros, deícticos ni nombres propios', () => {
    const safe = [
      'ella te pagará mañana y verás que sí',
      'el examen será el 7 y tendrás tiempo',
      'está acá, allá con mamá y papá',
      'estás en el sofá, quizás demás, jamás atrás',
      'ojalá que sí, además el compás',
      'habla con Nicolás en Bogotá y Panamá',
      'lo dejará listo y te lo mandará',
    ]
    for (const s of safe) expect(deVoseo(s)).toBe(s)
  })

  it('IMPERATIVOS que diptongan: el barrido los dejaba en español ROTO', () => {
    // Antes del 30-jul el barrido solo quitaba la tilde y salía "proba"/"empeza"
    // /"pensa"/"conta" — peor que el voseo, porque esas palabras no existen.
    expect(deVoseo('probá con 3 series')).toBe('prueba con 3 series')
    expect(deVoseo('empezá por lo corto')).toBe('empieza por lo corto')
    expect(deVoseo('pensá qué quieres')).toBe('piensa qué quieres')
    expect(deVoseo('contá conmigo')).toBe('cuenta conmigo')
    expect(deVoseo('colgá la llamada')).toBe('cuelga la llamada')
    expect(deVoseo('jugá tranquilo y soñá en grande')).toBe('juega tranquilo y sueña en grande')
    expect(deVoseo('despertá temprano')).toBe('despierta temprano')
    // Raíz en R: el barrido las excluye, así que además FUGABAN enteras.
    expect(deVoseo('encontrá el mensaje')).toBe('encuentra el mensaje')
    expect(deVoseo('acordá una fecha')).toBe('acuerda una fecha')
    expect(deVoseo('demostrá que puedes')).toBe('demuestra que puedes')
  })

  it('presentes -ás con raíz en R: solo estaba su imperativo', () => {
    expect(deVoseo('si entrás hoy, mejorás el score')).toBe('si entras hoy, mejoras el score')
    expect(deVoseo('¿esperás o comprás?')).toBe('¿esperas o compras?')
  })

  it('presentes -és de verbos -ER: el barrido solo cubre -á/-ás', () => {
    // "comés" pasaba intacto incluso con "comé" ya en la lista: el barrido
    // generativo no toca -és, así que el presente necesita su propia entrada.
    expect(deVoseo('si comés bien, corrés mejor')).toBe('si comes bien, corres mejor')
    expect(deVoseo('aprendés rápido y no rompés nada')).toBe('aprendes rápido y no rompes nada')
    // El plural -és NO debe quedar mutilado por la entrada del imperativo: la
    // lista fija corre en orden y "hacés" se resuelve antes que "hacé" ("hazs"
    // llegó a quedar escrito en un runbook por este tipo de recorte).
    expect(deVoseo('el que vos hacés aparecer')).toBe('el que tú haces aparecer')
    expect(deVoseo('ponés y tenés lo mismo')).toBe('pones y tienes lo mismo')
  })

  it('imperativos de verbos -ER (terminan en -é)', () => {
    expect(deVoseo('volvé a intentarlo')).toBe('vuelve a intentarlo')
    expect(deVoseo('poné el peso y hacé la serie')).toBe('pon el peso y haz la serie')
    expect(deVoseo('tené paciencia y respondé mañana')).toBe('ten paciencia y responde mañana')
    expect(deVoseo('comé algo y corré después')).toBe('come algo y corre después')
    expect(deVoseo('decí lo que sientes')).toBe('di lo que sientes')
  })

  it('NO toca el pretérito de 1ª persona, que en peruano es correcto', () => {
    // "-é" es también el pretérito de los verbos -AR, y "-í" el de los -IR. Sin
    // léxico de verbos no hay regla mecánica: por eso van por lista fija y estas
    // formas quedan afuera A PROPÓSITO. Corregirlas rompería frases de Aaron.
    const safe = [
      'ayer tomé agua y pensé en eso',
      'ya le llamé y le mandé la propuesta',
      'cerré el trato y facturé el primer mes',
      'anoche dormí mal y me sentí cansado',
      'le pedí la cotización y seguí insistiendo',
      'ya le escribí y salí temprano',
      'el bebé lloró y yo creé la cuenta',
    ]
    for (const s of safe) expect(deVoseo(s)).toBe(s)
  })

  it('piso de largo más bajo: caza el voseo corto sin tocar lo legítimo', () => {
    expect(deVoseo('bajá el ritmo y pasá por la clínica')).toBe('baja el ritmo y pasa por la clínica')
    expect(deVoseo('tocá el tema con calma')).toBe('toca el tema con calma')
    expect(deVoseo('si pagás hoy, sacás el descuento')).toBe('si pagas hoy, sacas el descuento')
    // Lo legítimo de 3-5 letras sigue intacto (ACCENT_EXCEPTIONS + piso de 4).
    const safe = [
      'está acá, allá con mamá y papá en el sofá',
      'estás demás, jamás atrás, quizás',
      'habla con Tomás mañana',
    ]
    for (const s of safe) expect(deVoseo(s)).toBe(s)
  })

  it('es idempotente', () => {
    const once = deVoseo('tenés que venir, sos clave')
    expect(deVoseo(once)).toBe(once)
    expect(once).toBe('tienes que venir, eres clave')
  })

  it('texto sin voseo pasa igual', () => {
    const clean = 'Tú puedes hacerlo hoy. Dime si necesitas algo.'
    expect(deVoseo(clean)).toBe(clean)
  })

  it('vacío / no-string seguro', () => {
    expect(deVoseo('')).toBe('')
  })
})

describe('detectVoseo — medir en vez de opinar', () => {
  it('texto limpio: cero fugas', () => {
    expect(detectVoseo('Tú puedes hacerlo hoy. Dime si necesitas algo, y revísalo mañana.')).toEqual([])
    expect(detectVoseo('')).toEqual([])
  })

  it('caza lo mismo que el scrub corrige', () => {
    expect(detectVoseo('podés hacerlo')).toContain('podés')
    expect(detectVoseo('vos sos el que decide')).toEqual(expect.arrayContaining(['vos', 'sos']))
    expect(detectVoseo('mandame la captura')).toContain('mandame')
    expect(detectVoseo('revisá tus apuntes')).toContain('revisá')
  })

  it('lo que el scrub deja pasar, tampoco se reporta (mismo criterio)', () => {
    for (const limpio of ['ella te pagará mañana', 'está acá con mamá', 'habla con Nicolás en Bogotá']) {
      expect(detectVoseo(limpio)).toEqual([])
    }
  })

  it('una respuesta ya scrubbeada NUNCA reporta fugas (invariante del harness)', () => {
    const sucio = 'Podés mandame eso y revisá si querés; después contame y bajalo.'
    expect(detectVoseo(deVoseo(sucio))).toEqual([])
  })
})
