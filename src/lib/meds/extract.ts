// SIR V2 — Extracción del desglose de un medicamento (foto de la caja o
// nombre/link) vía Claude. El caller (endpoint /api/meds/extract) hace la
// llamada; acá viven el prompt, el tipo y la validación/sanitización PURA.
//
// Filosofía (anti-formulario-vacío): esto NO auto-guarda. Devuelve una PROPUESTA
// EDITABLE que prellenar el desglose; el usuario confirma antes de persistir.

export interface MedExtracted {
  /** Nombre comercial del medicamento (ej. "Ergonex Plus"). */
  name: string | null
  /** Composición: principios activos + mg (ej. "ergotamina 1mg + cafeína 100mg + paracetamol 300mg"). */
  component: string | null
  /** Clase farmacológica (ej. "antimigrañoso", "analgésico", "suplemento"). */
  drugClass: string | null
  /** Para qué sirve, breve (ej. "migraña, cefalea vasomotora"). */
  treats: string | null
  /** Confianza de la extracción. */
  confidence: 'high' | 'medium' | 'low'
}

export const MED_EXTRACT_SYSTEM_PROMPT = `Eres un asistente que lee información de MEDICAMENTOS y devuelve su desglose estructurado.

Entrada posible:
- Una FOTO de la caja/empaque o prospecto de un medicamento.
- Un NOMBRE de producto o un LINK de farmacia (ej. "Ergonex Plus 100mg/1mg/300mg").

Extraé y devolvé EXCLUSIVAMENTE un JSON con estas claves:
{
  "name": string | null,          // nombre comercial tal cual (ej. "Ergonex Plus")
  "component": string | null,     // principios activos con sus mg, separados por " + " (ej. "ergotamina 1mg + cafeína 100mg + paracetamol 300mg")
  "drug_class": string | null,    // clase farmacológica en español (ej. "antimigrañoso", "analgésico", "AINE", "suplemento")
  "treats": string | null,        // para qué sirve, breve (ej. "migraña, cefalea vasomotora")
  "confidence": "high" | "medium" | "low"
}

Reglas:
- Usa SOLO lo que ves en la imagen o lo que conocés con certeza del nombre. NO inventes dosis.
- Si un principio activo trata la migraña (ergotamina, triptanes), la clase es "antimigrañoso".
- Si no estás seguro de un campo, ponlo en null y baja "confidence".
- Responde SOLO el JSON, sin texto extra, sin markdown fences. Empieza con { y termina con }.`

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, max) : null
}

/** ¿El objeto tiene la forma mínima de MedExtracted? (para gatear el retry). */
export function isValidMedExtracted(x: unknown): x is Record<string, unknown> {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  // Al menos uno de los campos informativos tiene que venir con algo.
  const hasSomething = ['name', 'component', 'drug_class', 'treats'].some(
    (k) => typeof o[k] === 'string' && (o[k] as string).trim(),
  )
  return hasSomething
}

/** Normaliza la respuesta del modelo a MedExtracted (tolera claves snake/camel). */
export function sanitizeMedExtracted(x: unknown): MedExtracted {
  const o = (x ?? {}) as Record<string, unknown>
  const conf = o.confidence
  const confidence: MedExtracted['confidence'] =
    conf === 'high' || conf === 'medium' || conf === 'low' ? conf : 'low'
  return {
    name: str(o.name, 120),
    component: str(o.component, 240),
    drugClass: str(o.drug_class ?? o.drugClass, 80),
    treats: str(o.treats, 120),
    confidence,
  }
}
