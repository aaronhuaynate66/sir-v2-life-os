# Calendario v2 — Fase 2 (OAuth + sync bidireccional)

> **Estado (2026-07-08):**
> - **Google — CÓDIGO COMPLETO (lectura + escritura).** El flujo OAuth (`start`/
>   `callback`/`status`), el refresco de tokens cifrados, el reader del feed y la
>   **creación de eventos** (`POST /api/calendar/events` + quick-add "Nuevo evento
>   en Google" en el hub de calendarios) ya están en el repo. **Solo falta que
>   Aaron provisione el OAuth app de Google Cloud y cargue 2 secrets** (§A + §D).
>   Hasta entonces queda inerte: `start` responde 501 "OAuth no configurado".
> - **Microsoft/Outlook — pendiente** (sin implementar; ver §B, requiere admin
>   consent del tenant `grupohng.com`).
>
> La tabla `calendar_connections` ya tiene `provider`, `access_token`,
> `refresh_token`, `account_email`, `token_expires_at` (todo cifrado en reposo).

---

## Qué cambia respecto de la Fase 1

| | Fase 1 (hoy, en prod) | Fase 2 (este doc) |
|---|---|---|
| Conexión | Pegar URL `.ics` pública | Login OAuth ("Conectar con Google/Microsoft") |
| Permiso | Solo-lectura del feed publicado | Lectura **y** escritura (crear/editar eventos) |
| Credencial | Token en la URL (`ics_url`) | `access_token` + `refresh_token` por cuenta |
| `provider` | `'ics'` | `'google'` / `'outlook'` |
| Refresco | Re-fetch del `.ics` | Refresh token + (idealmente) webhooks/push |

El reader (`lib/calendar/feed.ts`) y la UI ya soportan múltiples calendarios y
los etiquetan por `label`/`color`; Fase 2 agrega una **segunda forma de crear**
una conexión (OAuth en vez de pegar URL) y una capa de **escritura**.

---

## A) Google Calendar (cuenta personal Gmail)

### 1. Google Cloud Console
1. Crear (o reusar) un proyecto en <https://console.cloud.google.com>.
2. **APIs & Services → Library →** habilitar **Google Calendar API**.
3. **OAuth consent screen:**
   - User type: **External** (cuenta Gmail personal).
   - App name, support email, developer email.
   - Mientras esté en modo **Testing**, agregar el Gmail de Aaron como **Test
     user** (sin esto el login devuelve `access_denied`). Publicar a producción
     requiere verificación de Google **solo** si se piden scopes sensibles a
     terceros; para uso propio, Testing alcanza.
4. **Credentials → Create credentials → OAuth client ID:**
   - Application type: **Web application**.
   - **Authorized redirect URIs** (ver §C).
   - Copiar **Client ID** y **Client secret**.

### 2. Scopes
- **SIR pide hoy** `https://www.googleapis.com/auth/calendar.events` (lectura **y**
  escritura de eventos) + `.../auth/userinfo.email` — definido en
  `GOOGLE_SCOPES` (`src/lib/calendar/oauth/google.ts`). Con esto el reader lee el
  feed Y el quick-add crea eventos.
- Ya se piden `access_type=offline` + `prompt=consent` → se recibe **refresh_token**
  y, al reconectar una cuenta vieja de solo-lectura, Google re-pide consentimiento
  con el scope de escritura.

### 3. Qué ya hace el código (Google)
- `GET /api/calendar/oauth/google/start` → redirige a Google (501 si faltan secrets).
- `GET /api/calendar/oauth/google/callback` → exchange + guarda tokens cifrados +
  redirige a `/horario`. Idempotente por `account_email`.
- Reader (`feed.ts`) lee `primary/events` y refresca el token si expiró.
- **Escritura:** `POST /api/calendar/events` `{ title, start, end?, allDay?, description?, location? }`
  → crea el evento en `primary` (helper `createGoogleEvent`, token fresco vía
  `ensureFreshGoogleToken`). UI: botón "Nuevo evento en Google" en `CalendarConnections`
  (visible solo si hay un Google conectado).

---

## B) Microsoft / Outlook (cuenta de trabajo `grupohng.com`)

> ⚠️ **Importante:** el Outlook de Aaron es una **cuenta de trabajo del tenant
> `grupohng.com`**, no una cuenta personal. Eso significa que el login va contra
> Azure AD (Entra ID) del tenant y **muy probablemente requiera _admin consent_**:
> un administrador de `grupohng.com` tiene que aprobar la app (o sus permisos)
> antes de que el usuario pueda usarla. Conviene confirmar esto con TI de la
> empresa antes de invertir en la integración.

### 1. Azure Portal — App registration
1. <https://portal.azure.com> → **Microsoft Entra ID → App registrations → New
   registration**.
2. **Supported account types:**
   - Si es solo para el tenant `grupohng.com`: *Accounts in this organizational
     directory only (Single tenant)*.
   - Si en algún momento se quiere también cuentas personales: *Accounts in any
     org directory and personal Microsoft accounts (Multitenant)*.
3. **Redirect URI:** Web → (ver §C).
4. **Certificates & secrets → New client secret** → copiar el **value** (se ve
   una sola vez).
5. **API permissions → Microsoft Graph → Delegated permissions:**
   - `Calendars.Read` (lectura) y/o `Calendars.ReadWrite` (bidireccional).
   - `offline_access` (para refresh token).
   - `User.Read` (perfil básico / `account_email`).
   - Pulsar **"Grant admin consent for grupohng.com"** — esto normalmente lo
     hace un **admin del tenant**. Sin admin consent, el login del usuario común
     falla con `AADSTS65001`/consent required.

### 2. Endpoints (Microsoft Graph)
- Authorize: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize`
- Token: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
- API de calendario: `https://graph.microsoft.com/v1.0/me/events` (+ `/calendars`).
- `{tenant}` = el GUID del tenant `grupohng.com` (o `common` si multitenant).

---

## C) Redirect URIs (ambos proveedores)

Registrar en cada proveedor un callback por entorno. Sugerencia de ruta:
`/api/calendar/oauth/<provider>/callback`.

- **Producción:** `https://<dominio-prod>/api/calendar/oauth/google/callback`
  y `.../outlook/callback`.
- **Previews de Vercel:** las URLs de preview cambian por deploy. Opciones:
  registrar un dominio estable de preview, o probar OAuth solo en prod/local.
- **Local:** `http://localhost:3000/api/calendar/oauth/<provider>/callback`.

Google y Azure exigen que el redirect URI **coincida exactamente** (esquema,
host, puerto, path) con el registrado.

---

## D) Variables de entorno a setear en Vercel (Fase 2)

> Ninguna de estas existe hoy. Son secrets de servidor (NO `NEXT_PUBLIC_*`).

| Variable | Qué es |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID del OAuth client de Google |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Client secret de Google |
| `MS_OAUTH_CLIENT_ID` | Application (client) ID de la app de Azure |
| `MS_OAUTH_CLIENT_SECRET` | Client secret de Azure (el *value*) |
| `MS_OAUTH_TENANT_ID` | GUID del tenant `grupohng.com` (o `common`) |
| `CALENDAR_OAUTH_REDIRECT_BASE` | Base URL para construir los redirect URIs (ej. `https://<dominio-prod>`) |
| `CALENDAR_TOKEN_ENCRYPTION_KEY` | Clave para **cifrar** los tokens antes de guardarlos en DB (ver §E) |

La env `OUTLOOK_ICS_URL` de la Fase 1 **se mantiene** como fallback — no se borra.

---

## E) Notas de seguridad (para cuando se implemente)

- **Cifrar los tokens en reposo.** Las columnas `access_token`/`refresh_token`
  de `calendar_connections` deben guardar el token **cifrado** (AES-GCM con
  `CALENDAR_TOKEN_ENCRYPTION_KEY`), no en texto plano. La RLS ya los aísla por
  usuario; el cifrado protege ante una fuga del dump de DB. **No** agregar estas
  columnas a la publicación realtime (igual que `ics_url` hoy).
- **Nunca loguear** tokens ni el `code`/`state` del callback (regla ya vigente
  para `ics_url`).
- **`state` param** anti-CSRF en el flujo OAuth, validado en el callback.
- **Refresh proactivo** usando `token_expires_at`; manejar `invalid_grant`
  (refresh revocado) marcando la conexión como caída en la UI, no rompiendo el
  reader (que debe seguir mostrando los demás calendarios).
- **Escritura bidireccional**: empezar read-only (`provider` OAuth pero solo
  lectura) y habilitar escritura como paso aparte, con confirmación del usuario.

---

## F) Resumen de acciones de Aaron (cuando arranque Fase 2)

1. **Google Cloud:** crear proyecto → habilitar Calendar API → consent screen
   (External, agregarse como test user) → OAuth client ID (Web) con redirect
   URIs → copiar client id/secret.
2. **Azure/Entra (`grupohng.com`):** app registration → client secret → API
   permissions (`Calendars.Read`/`ReadWrite`, `offline_access`, `User.Read`) →
   **conseguir admin consent del tenant** → copiar client id/secret + tenant id.
3. **Vercel:** cargar las env vars de §D (+ generar `CALENDAR_TOKEN_ENCRYPTION_KEY`).
4. Avisar para implementar el flujo OAuth + capa de escritura.
