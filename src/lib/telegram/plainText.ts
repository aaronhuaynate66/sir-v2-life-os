// SIR V2 — Limpieza de markdown para Telegram (texto plano). PURO.
//
// Telegram no renderiza markdown salvo que mandes parse_mode (y su dialecto es
// finicky). Los prompts piden "sin markdown", pero el modelo igual mete **negrita**,
// `código`, ## títulos, [links](url) → salen los símbolos crudos y se ve roto
// (reporte de Aaron, 18/07). Esto los quita conservando el texto. Testeable.

export function stripMarkdown(input: string): string {
  if (!input) return ''
  return input
    // **negrita** / __negrita__ → negrita
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    // *itálica* / _itálica_ (solo cuando bordea palabra, no en medio de un token)
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)(?<!\s)\*(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/(^|[\s(])_(?!\s)([^_\n]+?)(?<!\s)_(?=[\s).,;:!?]|$)/g, '$1$2')
    // `código` / ```bloques``` → texto
    .replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, '$1')
    .replace(/`([^`]+?)`/g, '$1')
    // # títulos → sin las almohadillas
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    // [texto](url) → texto (url)
    .replace(/\[([^\]]+?)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)')
    // viñetas markdown al inicio de línea (* / -) → •
    .replace(/^\s{0,3}[*\-]\s+/gm, '• ')
    // barre cualquier ** o __ suelto que haya quedado
    .replace(/\*\*|__/g, '')
    .trim()
}
