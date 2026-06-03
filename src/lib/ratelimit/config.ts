// SIR V2 — Configuración de rate limiting por bucket (Auditoría: riesgo #1).
//
// Límites pensados para un single-user real: generosos para NO molestar el uso
// normal, pero suficientes para atajar un loop/abuso. Cada bucket tiene tiers
// (ventanas) que se evalúan todos; basta que UNO deniegue para cortar.
//
// PURO: solo datos + construcción de key. Sin I/O. Testeable.

export interface RateTier {
  /** Máximo de requests permitidos dentro de la ventana. */
  limit: number
  /** Tamaño de la ventana en milisegundos. */
  windowMs: number
}

const MINUTE = 60_000
const HOUR = 3_600_000

/**
 * Buckets → tiers. Asignación por endpoint:
 * - vision:          captura/detector/proceso/báscula (Vision = el driver de costo).
 * - generation:      briefings, síntesis, narrativas, derive (texto LLM).
 * - embeddings:      search + memories/embed (OpenAI embeddings, baratos).
 * - whatsapp_export: interpretación POR BLOQUE del export de WhatsApp. Una
 *   conversación larga se parte en N bloques y cada bloque es UNA llamada LLM
 *   orquestada desde el cliente (con progreso). El límite acá es deliberadamente
 *   alto: es UNA acción intencional del usuario (subir un export), no un loop;
 *   un export grande puede gatillar decenas de llamadas legítimas en pocos
 *   minutos. El chunker acota el total de bloques (MAX_CHUNKS), así el techo es
 *   finito por más larga que sea la conversación.
 */
export const RATE_LIMIT_TIERS = {
  vision: [
    { limit: 10, windowMs: MINUTE },
    { limit: 100, windowMs: HOUR },
  ],
  generation: [
    { limit: 20, windowMs: MINUTE },
    { limit: 200, windowMs: HOUR },
  ],
  embeddings: [
    { limit: 30, windowMs: MINUTE },
    { limit: 300, windowMs: HOUR },
  ],
  whatsapp_export: [
    { limit: 90, windowMs: MINUTE },
    { limit: 600, windowMs: HOUR },
  ],
} as const satisfies Record<string, readonly RateTier[]>

export type RateLimitBucket = keyof typeof RATE_LIMIT_TIERS

/**
 * Key del contador. Incluye userId (scope por usuario), bucket y ventana (un
 * contador por tier). El userId lo pone SIEMPRE el server desde getUser(); el
 * cliente nunca lo provee.
 */
export function buildKey(userId: string, bucket: RateLimitBucket, windowMs: number): string {
  return `rl:${userId}:${bucket}:${windowMs}`
}
