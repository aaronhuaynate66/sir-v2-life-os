// SIR V2 — Estrategia de compresion adaptativa por capture_type.
//
// Bug que motivo este modulo (Sesion 2.5):
//   Test 3 LinkedIn — un screenshot de 3.9 MB se comprimia a 42 KB con la
//   strategy unica 1024px/q=0.85. A esa compresion el texto fino del perfil
//   queda ilegible y Sonnet alucina (devolvio "Gabriela Edith Diaz Sanchez,
//   Copywriting, San Juan Argentina" en lugar de Diana Carolina Diaz
//   Sanchez, Administradora, Lima).
//
// Solucion: tabla de estrategias por capture_type:
//   - whatsapp_chat / whatsapp_info: bubbles+headers grandes -> mas agresivo OK.
//   - instagram                    : posts grid + bio mediana -> medio.
//   - linkedin                     : layout vertical denso + texto fino -> conservador.
//   - manual_note / unknown        : default conservador.
//
// El target NO es solo "lado mayor en px"; es "bytes minimos en el output".
// El loop adaptativo en compress.ts bumpea quality hasta tocar minOutputKB
// (con techo q=0.98 para evitar infinito).

import type { CaptureType } from '../observations/types'

export interface CompressionStrategy {
  /** Lado mayor (px) tras downscale. */
  maxWidth: number
  /** Quality WebP inicial. El loop adaptativo puede subir hasta 0.98. */
  quality: number
  /** Piso de bytes (KB) del output. Si el blob queda por debajo, el loop
   *  bumpea quality + reintenta. */
  minOutputKB: number
}

/**
 * Tabla central de estrategias. Las claves cubren los 7 capture_types del
 * detector + dos "perfiles" sin tipo (detection, default).
 *
 * Voice_note y unknown caen a default conservador hasta tener layout real
 * que validar.
 */
export const COMPRESSION_STRATEGIES = {
  whatsapp_chat: { maxWidth: 1080, quality: 0.75, minOutputKB: 50 },
  // Web = screenshot de escritorio APAISADO, denso en texto (3 columnas).
  // Necesita más ancho + calidad que el chat móvil para que el centro y el
  // teléfono del panel derecho queden legibles para Vision.
  whatsapp_web: { maxWidth: 1920, quality: 0.9, minOutputKB: 200 },
  whatsapp_info: { maxWidth: 1080, quality: 0.75, minOutputKB: 50 },
  // DM (IG/Telegram/Messenger): chat móvil denso en texto, igual que whatsapp_chat.
  dm_conversation: { maxWidth: 1080, quality: 0.75, minOutputKB: 50 },
  instagram: { maxWidth: 1080, quality: 0.85, minOutputKB: 100 },
  linkedin: { maxWidth: 1600, quality: 0.95, minOutputKB: 300 },
  // Báscula: grilla densa de números pequeños -> hace falta resolución y
  // calidad para que Vision lea decimales (81.85, 23.4%, etc.) sin alucinar.
  scale: { maxWidth: 1280, quality: 0.9, minOutputKB: 150 },
  // Panel de sueño: duración + minutos por fase + score en texto pequeño ->
  // mismo perfil que báscula para leer "5 h 55 min", "1 h 21 min", "75".
  sleep_panel: { maxWidth: 1280, quality: 0.9, minOutputKB: 150 },
  // Panel de FC: valor de reposo + rango + p.p.m. en texto pequeño junto a un
  // gráfico intradía -> mismo perfil que báscula/sueño para leer "45", "44-138".
  heart_rate_panel: { maxWidth: 1280, quality: 0.9, minOutputKB: 150 },
  // Panel de VFC: rango en ms en texto pequeño junto a un gráfico -> igual perfil.
  hrv_panel: { maxWidth: 1280, quality: 0.9, minOutputKB: 150 },
  manual_note: { maxWidth: 1600, quality: 0.85, minOutputKB: 100 },
  voice_note: { maxWidth: 1600, quality: 0.85, minOutputKB: 100 },
  unknown: { maxWidth: 1600, quality: 0.85, minOutputKB: 100 },
} as const satisfies Record<CaptureType, CompressionStrategy>

/**
 * Perfil agresivo para la PRIMERA llamada (detector universal).
 * Como el detector solo decide tipo + suggestedPersonName, no necesita
 * pixel-perfect. Mantenerlo chico ayuda con la latencia.
 */
export const DETECTION_STRATEGY: CompressionStrategy = {
  maxWidth: 1080,
  quality: 0.7,
  minOutputKB: 30,
}

/** Lookup directo. Si llega un capture_type fuera de la enum (defensivo),
 *  caemos a `unknown`. */
export function getStrategy(captureType: CaptureType): CompressionStrategy {
  return COMPRESSION_STRATEGIES[captureType] ?? COMPRESSION_STRATEGIES.unknown
}
