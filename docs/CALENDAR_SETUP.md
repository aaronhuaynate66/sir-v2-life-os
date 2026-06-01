# Calendario Outlook (.ics) — Setup

SIR puede mostrar tus eventos próximos de Outlook en `/agenda`. La integración
es **read-only** (lee un feed publicado), corre en el servidor y degrada limpio:
si no la configurás, `/agenda` simplemente muestra una tarjeta explicando cómo
activarla — nada se rompe.

## Cómo activarla

### 1. Publicá tu calendario en Outlook
- Outlook web → **Configuración → Calendario → Calendarios compartidos**.
- En **Publicar calendario**, elegí el calendario y permisos (basta
  "Puede ver todos los detalles").
- Copiá el link que termina en **`.ics`** (NO el `.html`).

> ⚠️ Ese link contiene un **token privado** de tu calendario. Cualquiera con la
> URL ve tus eventos. Tratalo como una contraseña.

### 2. Agregá la variable de entorno en Vercel
- Vercel → tu proyecto → **Settings → Environment Variables**.
- Nueva variable:
  - **Name:** `OUTLOOK_ICS_URL`
  - **Value:** la URL `.ics` que copiaste
  - **Environments:** Production (y Preview si querés)
- **Importante:** NO la nombres `NEXT_PUBLIC_OUTLOOK_ICS_URL`. El prefijo
  `NEXT_PUBLIC_` expondría el token al navegador. El nombre correcto la mantiene
  solo en el servidor.

### 3. Volvé a deployar
Las env vars se aplican en el próximo deploy. Redeploy desde Vercel (o pusheá
cualquier commit). Listo: `/agenda` mostrará tus eventos próximos.

## Cómo funciona (técnico)

- `OUTLOOK_ICS_URL` se lee **solo en el servidor** (`src/lib/calendar/feed.ts`).
  El cliente nunca ve la URL ni el token: consume el JSON ya parseado vía
  `GET /api/calendar` (auth-gated).
- Parser propio (`src/lib/calendar/ics.ts`), sin dependencias: maneja eventos
  simples, all-day y **recurrentes** (RRULE: DAILY/WEEKLY/MONTHLY/YEARLY con
  INTERVAL, COUNT, UNTIL y BYDAY).
- **Timezone Lima (UTC-5 fijo):** los tiempos locales/TZID del feed se
  interpretan como America/Lima. (Perú no tiene horario de verano.)
- **Cache** en memoria de 10 min por feed: no golpea Outlook en cada visita.
- Ventana por defecto: próximos **60 días**, hasta 50 eventos.

## Privacidad
- Es read-only: SIR nunca escribe en tu calendario.
- Los eventos NO se persisten en la base ni se mandan a IA/embeddings: se leen
  en vivo y se muestran. Si quitás la env var, desaparecen.
