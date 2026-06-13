# Spike — SIR por WhatsApp (canal de captura): decisión go/no-go

> Exploración (no build) del fixture futuro del BACKLOG. Fecha: 2026-06-12.
> Datos de plataforma verificados por web (jun 2026); ver fuentes al pie.

## Pregunta
¿Conviene exponer SIR como canal de WhatsApp para capturar (notas, reenvíos,
voz) y, opcionalmente, mandar nudges? ¿Es viable, cuánto cuesta, y aguanta el
principio #5 (privacidad radical)?

## Hallazgos de plataforma (2026)
- **Solo Cloud API.** Meta deprecó el On-Premises API (self-host) — antes era la
  vía para que el contenido NO pasara por servidores de Meta. Ya no existe como
  opción viable. Quedan: Cloud API directo, o un BSP (Twilio, 360dialog, etc.)
  que es una capa encima del mismo Cloud API.
- **Facturación por mensaje (desde jul-2025), no por conversación.** Categorías:
  Marketing, Utility, Authentication y **Service**.
- **Los mensajes de SERVICIO son GRATIS** dentro de la ventana de 24h que abre
  el usuario cuando te escribe. O sea: si SIR solo *responde* a lo que vos le
  mandás, esas respuestas no cuestan nada y no requieren plantillas aprobadas.
- **Nudges proactivos (fuera de la ventana de 24h)** = plantillas Utility/
  Marketing → pagas + requieren aprobación de Meta. Ya no hay cuota gratis.

## Privacidad — el punto que decide
- Los mensajes viajan E2E (Signal) del teléfono al endpoint Cloud de Meta, **pero
  la promesa E2E SE CORTA en el endpoint**: ahí Meta descifra el contenido (actúa
  como "data processor" del negocio) y lo retiene hasta 30 días para entrega.
- Traducción para SIR: **los datos más íntimos de Aaron (relaciones, salud,
  identidad) pasarían descifrados por la infra de Meta** (transitorio, pero real).
  Y como On-Premises está muerto, **no hay forma de evitarlo**.

## Costo (estimado)
- **MVP captura iniciada por el usuario: ~$0.** Son mensajes de Servicio en la
  ventana de 24h. (Costo de infra propio del webhook/servidor, marginal.)
- **Nudges proactivos: pago** por plantilla, según país del destinatario.

## Viabilidad técnica
- Alta. Cloud API → webhook → endpoint SIR. Reusa lo que YA existe:
  - **Captura por nota/texto** → `nota-autodetect` (PR #171).
  - **Reenvío de chat** → pipeline de export de WhatsApp (ya construido).
  - **Nota de voz** → transcripción → mismo pipeline.
- El "cerebro" de SIR sigue server-side; WhatsApp es solo I/O.

## MVP propuesto (si va)
1. Número de SIR (Cloud API). Solo **captura iniciada por el usuario** (texto +
   voz + reenvío). Respuesta de confirmación ("anotado en X ✓"). **$0, sin
   plantillas.**
2. NADA de nudges proactivos en el MVP (eso es fase 2: pago + plantillas).
3. Adaptador, no columna vertebral: si Meta cambia las reglas, se pierde un
   canal, no el producto.

## Recomendación
- **GO condicional para uso PERSONAL de Aaron.** El valor (matar la fricción de
  captura, $0) es alto y el trade de privacidad lo decide él para su propia data.
- **NO-GO / diferido si SIR es PRODUCTO para terceros**, hasta resolver el modelo
  de privacidad: no se puede prometer "privacidad radical" si el caño de captura
  descifra en Meta. Para terceros habría que: (a) avisar explícito y pedir
  consentimiento, o (b) no ofrecer este canal.
- **Decisión pendiente de Aaron:** ¿este caño es solo para vos, o aspira a
  producto? Eso define go/no-go del MVP.

## Fuentes
- Pricing 2026: chatarmin.com/en/blog/whatsapp-business-api-costs ; blueticks.co/blog/whatsapp-business-api-pricing-2026
- Privacidad/encriptación Cloud API: chatarchitect.com (data privacy WhatsApp Business) ; faq.whatsapp.com/820124435853543
