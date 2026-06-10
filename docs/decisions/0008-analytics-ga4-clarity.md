# 0008 — Analytics: GA4 + Microsoft Clarity (con tensión de privacidad aceptada)

- **Estado:** Accepted
- **Fecha:** 2026-06-09
- **Decisor:** Aaron

## Contexto

Aaron pidió instrumentar SIR con Google Analytics 4 y Microsoft Clarity para ver cómo se navega la app (heatmaps, session replays, eventos).

Se le advirtió la tensión, que él aceptó explícitamente:
- **Privacidad radical (Principio #5):** SIR contiene datos sensibles del usuario y de TERCEROS que no consintieron (nombres, conversaciones de WhatsApp, salud, finanzas). Clarity graba session replays → puede capturar esos datos en pantalla.
- **ADR 0006 (bienestar > engagement):** GA4/Clarity son herramientas de medición de engagement, en tensión con la tesis del producto.
- **Valor marginal hoy:** un solo usuario; el feedback de UX se obtiene directo.

## Decisión

Instalar **GA4 + Clarity**, gated por env (`NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_CLARITY_ID`): si el ID no está, el script no se inyecta (no-op). Scripts en `src/app/layout.tsx` vía `next/script`. CSP (report-only) extendida con los dominios de GA/Clarity.

## Consecuencias / mitigaciones obligatorias

- **Clarity en modo de masking ESTRICTO** (Settings del proyecto Clarity → Masking → Strict): enmascara texto por defecto en los replays. Imprescindible dado el contenido sensible y de terceros.
- IDs son públicos por naturaleza (measurement id / project id) → van como `NEXT_PUBLIC_*`.
- `robots: noindex` ya activo (app privada).
- **Revisión:** si molesta la privacidad o no aporta (single-user), quitar los env vars → los scripts se apagan solos. Reevaluar cuando/si SIR pase a multi-usuario (instrumentar con consentimiento).

## Alternativas consideradas

- **No instalar (recomendado por el asesor):** menor riesgo, el feedback de UX se da directo. Descartado por decisión del dueño.
- **Solo Clarity con masking:** intermedio. No elegido; se optó por ambos.
