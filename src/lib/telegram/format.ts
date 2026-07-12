// SIR V2 — Telegram: markdown → texto plano de chat.
//
// Telegram no renderiza el markdown de askSir sin parse_mode (los ** se ven
// crudos), y activar parse_mode es frágil (un markdown mal formado → 400). Más
// robusto: limpiar el markdown antes de enviar. El prompt chatStyle ya pide
// texto plano, pero esto GARANTIZA el resultado aunque el modelo desobedezca.
// PURO.

/** Convierte markdown a texto plano legible en un chat. No lanza. */
export function toPlainText(md: string): string {
  let t = md ?? ''
  // Negrita/itálica con marcadores dobles: **x** __x__ → x ([\s\S] evita el flag
  // dotAll 's', no disponible en el target de tsc del proyecto).
  t = t.replace(/\*\*([\s\S]+?)\*\*/g, '$1').replace(/__([\s\S]+?)__/g, '$1')
  // Encabezados markdown (## Título) → solo el texto
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, '')
  // Reglas horizontales (--- ___ ***) en su propia línea → fuera
  t = t.replace(/^\s*([-_*]\s?){3,}\s*$/gm, '')
  // Citas > texto → texto
  t = t.replace(/^\s*>\s?/gm, '')
  // Viñetas - x / * x → • x
  t = t.replace(/^(\s*)[-*]\s+/gm, '$1• ')
  // Código inline `x` → x y bloques ``` → fuera de los cercos
  t = t.replace(/```[a-z]*\n?/gi, '').replace(/`([^`]+)`/g, '$1')
  // Enlaces [texto](url) → texto (url)
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
  // Colapsar 3+ saltos de línea a 2
  t = t.replace(/\n{3,}/g, '\n\n')
  return t.trim()
}
