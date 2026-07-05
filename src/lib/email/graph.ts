// SIR V2 — Microsoft Graph (correo, Fase 2). Helpers puros + wrappers de fetch.
//
// El flujo: OAuth (connect → callback guarda tokens) → sync (refresh si expiró,
// delta query de /me/messages, cada correo → batch del SIR Reader). Reusa
// ingestReaderBatch para persistir (persona por remitente, dedup, observación).
//
// Config por env (Aaron los setea tras registrar la app en Azure):
//   MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT (default 'common'),
//   y el redirect se arma con la URL del sitio.

const AUTH_BASE = 'https://login.microsoftonline.com';
export const GRAPH = 'https://graph.microsoft.com/v1.0';
export const GRAPH_SCOPES = 'offline_access User.Read Mail.Read';

export interface GraphConfig {
  clientId: string;
  clientSecret: string;
  tenant: string;
  redirectUri: string;
}

/** URL a la que se manda al usuario para consentir. `state` = anti-CSRF. */
export function buildAuthUrl(cfg: GraphConfig, state: string): string {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    redirect_uri: cfg.redirectUri,
    response_mode: 'query',
    scope: GRAPH_SCOPES,
    state,
  });
  return `${AUTH_BASE}/${cfg.tenant}/oauth2/v2.0/authorize?${p.toString()}`;
}

/** Body x-www-form-urlencoded para intercambiar el `code` por tokens. */
export function tokenBodyForCode(cfg: GraphConfig, code: string): string {
  return new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.redirectUri,
    scope: GRAPH_SCOPES,
  }).toString();
}

/** Body para renovar con el refresh_token. */
export function tokenBodyForRefresh(cfg: GraphConfig, refreshToken: string): string {
  return new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: GRAPH_SCOPES,
  }).toString();
}

export function tokenEndpoint(cfg: GraphConfig): string {
  return `${AUTH_BASE}/${cfg.tenant}/oauth2/v2.0/token`;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // segundos
}

/** ¿Expira dentro de `skewSec`? (para decidir refrescar antes de usar). */
export function isExpired(expiresAtIso: string | null | undefined, nowMs: number, skewSec = 120): boolean {
  if (!expiresAtIso) return true;
  const t = Date.parse(expiresAtIso);
  if (!Number.isFinite(t)) return true;
  return t - nowMs <= skewSec * 1000;
}

/** ISO de expiración a partir de expires_in (segundos). */
export function expiresAtFrom(expiresInSec: number, nowMs: number): string {
  return new Date(nowMs + Math.max(0, expiresInSec) * 1000).toISOString();
}

export interface GraphMessage {
  from: string;        // nombre para mostrar del remitente
  fromEmail: string;   // email del remitente (thread id)
  subject: string;
  body: string;        // texto plano (bodyPreview o body convertido)
  receivedAt: string | null;
}

function stripHtml(s: string): string {
  return s.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Parsea un mensaje crudo de Graph (/me/messages) a GraphMessage. null si no sirve. */
export function parseGraphMessage(raw: unknown): GraphMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const fromObj = (o.from && typeof o.from === 'object' ? (o.from as Record<string, unknown>).emailAddress : null) as Record<string, unknown> | null;
  const fromEmail = typeof fromObj?.address === 'string' ? fromObj.address.trim().toLowerCase() : '';
  const fromName = typeof fromObj?.name === 'string' && fromObj.name.trim() ? fromObj.name.trim() : fromEmail;
  const subject = typeof o.subject === 'string' ? o.subject.trim() : '';
  const bodyObj = (o.body && typeof o.body === 'object' ? o.body : null) as Record<string, unknown> | null;
  const bodyContent = typeof bodyObj?.content === 'string' ? bodyObj.content : '';
  const isHtml = bodyObj?.contentType === 'html';
  const preview = typeof o.bodyPreview === 'string' ? o.bodyPreview.trim() : '';
  const body = (bodyContent ? (isHtml ? stripHtml(bodyContent) : bodyContent.trim()) : preview).slice(0, 4000);
  const receivedAt = typeof o.receivedDateTime === 'string' ? o.receivedDateTime : null;
  if (!fromEmail && !subject && !body) return null;
  return { from: fromName, fromEmail, subject, body, receivedAt };
}

/** Un correo → texto de un "mensaje" del reader (subject + cuerpo). */
export function messageText(m: GraphMessage): string {
  const s = m.subject ? `Asunto: ${m.subject}` : '';
  return [s, m.body].filter(Boolean).join('\n').trim();
}
