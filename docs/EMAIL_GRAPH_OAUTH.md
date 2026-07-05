# Correo por Microsoft Graph — setup (Fase 2 del roadmap de ingesta)

> **Estado:** el conector está **construido** (mig 0129 + `/api/email/*` + panel en
> `/yo`). Para que funcione, Aaron tiene que **registrar una app en Azure** y setear
> 3 env vars. Esto es lo único que no puedo hacer yo (es config de tu tenant).

Con esto, SIR lee tu correo M365 de forma **oficial (API, sin scrapeo)**, incremental
(solo lo nuevo), y cada correo cae por el mismo pipeline del SIR Reader: se atribuye a
la persona por el remitente, deduplica y crea una observación → alimenta *Lo personal*,
recencia, tono y memorias.

## 1. Registrar la app en Azure (≈10 min)

1. Entrá a **portal.azure.com** → **Microsoft Entra ID** (antes Azure AD) → **App registrations** → **New registration**.
2. **Name:** `SIR Reader`. **Supported account types:** "Accounts in any organizational directory and personal Microsoft accounts" (o solo tu org si preferís). **Redirect URI:** tipo **Web** →
   ```
   https://sir-v2-life-os.vercel.app/api/email/callback
   ```
   (usá tu dominio real; tiene que coincidir EXACTO).
3. **Register.** Copiá el **Application (client) ID**.
4. **Certificates & secrets** → **New client secret** → copiá el **Value** (no el Id) apenas se genera.
5. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated** → agregá **`Mail.Read`**, **`User.Read`**, **`offline_access`** → **Add**. (No necesitás admin consent para delegated Mail.Read en tu propia cuenta; si tu org lo exige, pedilo.)

## 2. Setear las env vars (Vercel → Project → Settings → Environment Variables)

| Var | Valor |
|---|---|
| `MS_CLIENT_ID` | el Application (client) ID |
| `MS_CLIENT_SECRET` | el secret Value |
| `MS_TENANT` | `common` (multi-cuenta) o tu tenant id (solo tu org) |

*(Opcional: `NEXT_PUBLIC_SITE_URL` si tu dominio no es el que Vercel infiere — se usa para armar el redirect.)*

Redeploy. Listo.

## 3. Usar

- En **`/yo`** → panel **"Correo de trabajo (Microsoft)"** → **Conectar con Microsoft** → consentís en la pantalla de Microsoft → volvés a SIR.
- **Sincronizar ahora** trae los correos nuevos (delta incremental). Se puede correr cuantas veces quieras: es idempotente (dedup por hash).

## Cómo funciona por dentro

- `email_connections` (mig 0129) guarda los tokens + el `delta_link` (puntero incremental de Graph). RLS por usuario.
- `/api/email/connect` → consentimiento · `/api/email/callback` → canjea code por tokens · `/api/email/sync` → refresh si expiró + `GET /me/mailFolders/inbox/messages/delta` + agrupa por remitente + `ingestReaderBatch` (reusa el pipeline del reader) · `/api/email/status` → estado + desconectar.
- **Privacidad:** los tokens viven en tu tabla (RLS), no en la UI. El sync corre server-side. Solo lectura (`Mail.Read`).

## Notas / límites

- MVP: lee el **Inbox** (correos recibidos → se atribuyen al remitente). Los enviados por vos quedan afuera por ahora.
- El sync es **manual** (botón). Un cron para auto-sync es una extensión chica a futuro.
- Google/Gmail sería el mismo patrón con otra app (Google Cloud Console) — `provider='google'` ya está previsto en la tabla.
