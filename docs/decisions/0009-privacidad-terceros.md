# 0009 — Privacidad de terceros: SIR usa la data sensible para asistir, con límites de exposición

- **Estado:** Accepted
- **Fecha:** 2026-06-16
- **Decisor:** Aaron

## Contexto

SIR guarda datos de personas que NO son el usuario (notas, chats importados, fechas), incluyendo categorías sensibles (salud de un familiar, finanzas de un tercero, etc.). El Principio #5 ("privacidad radical") estaba en deuda: no había política explícita sobre qué se guarda de terceros y a dónde viaja.

Se evaluó gatear lo sensible para que NO llegara a la IA. **Aaron lo rechazó, con razón:** el valor central de SIR es que la IA lo *ayude* con su gente (ej. "¿cómo apoyo a mi mamá en su tratamiento?"). Bloquearle a la IA esos datos mata justo el caso de uso. Para una app de **un solo usuario** con RLS, el riesgo no es "la IA lo ve" (es procesamiento bajo contrato), sino que esos datos salgan por canales fuera de su control.

## Decisión

**SIR USA los datos sensibles de terceros para asistir a Aaron** — es el punto del producto. La privacidad se protege limitando la *exposición*, no la utilidad:

1. **A la IA, sí.** Embeddings (OpenAI) y chat conversacional (Anthropic) reciben el contenido, bajo términos de API (no se usa para entrenar, retención corta). Decisión consciente.
2. **A canales no-IA, nunca.** Prohibido mandar PII/contenido de terceros a: analytics (GA4), session replays (Clarity → masking ESTRICTO, ADR 0008), logs server-side, y query strings / URLs con datos personales.
3. **Proveedor según sensibilidad (recomendación, no forzado aún):** lo más delicado (salud/finanzas de terceros) conviene que vaya a **Anthropic directo**, no ruteado por OSS/OpenRouter (que suma procesadores). Pendiente: pinneo automático de proveedor para contenido sensible.
4. **RLS** sobre todas las tablas (auth.uid() = user_id) — la base ya no es accesible cross-user.

## Auditoría de fugas (2026-06-16)

Resultado: **limpio, con una nota menor.**
- **Analytics (track/EVENTS):** solo manda enums y conteos (`method`, `surface`, `capture_type`, `length`), NUNCA nombres ni contenido. ✓
- **Logs:** sin `console.log/error` de contenido en `api/capture` ni extractores. ✓
- **Query strings:** sin email/teléfono/contenido. ✓
- **NOTA:** el `slug` (derivado del nombre) aparece en la ruta `/relaciones/{slug}` y en el `?next=` del redirect de login. Es nombre en una URL, pero solo en el navegador/servidor del propio usuario, no se envía a terceros. Riesgo bajo; aceptado.

## Consecuencias / pendientes

- Mantener la disciplina: cualquier evento de analytics nuevo NO debe llevar PII (la taxonomía tipada ya lo encauza).
- **Opcional / futuro:** (a) pinneo de proveedor Anthropic para contenido sensible; (b) cifrado en reposo de campos sensibles; (c) si SIR pasa a multi-usuario, todo esto se reevalúa con consentimiento de terceros.

## Alternativas consideradas

- **Gatear lo sensible fuera de la IA:** descartado — mutila el caso de uso central (asesor rechazó su propia propuesta tras el push de Aaron).
- **Sistema de clasificación PII / DLP completo:** sobre-ingeniería para un solo usuario.
