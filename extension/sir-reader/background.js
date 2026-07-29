// SIR Reader — service worker (MV3).
//
// Recibe lotes de los content scripts y los postea a TU SIR
// (POST <sirUrl>/api/reader/ingest, header x-reader-token). El token y la URL
// viven en chrome.storage.local (los configuras en el popup). El token NUNCA está en
// la página: solo acá. Mantiene un estado simple (último envío, contador, error)
// para mostrar en el popup.

const DEFAULT_SIR_URL = 'https://sir-v2-life-os.vercel.app';

// Config por archivo (config.js) para instalación sin UI (ej. un agente edita el
// archivo). El popup (chrome.storage) tiene prioridad si está seteado.
try { importScripts('config.js'); } catch (_) { /* sin config.js: se usa el popup */ }
function fileConfig() { return (self.__SIR_CONFIG || {}); }

async function getConfig() {
  const { sirUrl, token } = await chrome.storage.local.get(['sirUrl', 'token']);
  const fc = fileConfig();
  return {
    sirUrl: (sirUrl || fc.sirUrl || DEFAULT_SIR_URL).replace(/\/+$/, ''),
    token: token || fc.token || '',
  };
}

async function setStatus(patch) {
  const { status } = await chrome.storage.local.get('status');
  const next = Object.assign({}, status || {}, patch, { at: new Date().toISOString() });
  await chrome.storage.local.set({ status: next });
}

async function bump(field, by) {
  const { status } = await chrome.storage.local.get('status');
  const s = status || {};
  s[field] = (s[field] || 0) + (by || 1);
  s.at = new Date().toISOString();
  await chrome.storage.local.set({ status: s });
}

async function ingest(batch) {
  const { sirUrl, token } = await getConfig();
  if (!token) { await setStatus({ lastError: 'Falta el token — configuralo en el popup' }); return { ok: false, error: 'no-token' }; }
  try {
    const res = await fetch(`${sirUrl}/api/reader/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-reader-token': token },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      await setStatus({ lastError: `HTTP ${res.status} ${detail.slice(0, 140)}` });
      return { ok: false, status: res.status };
    }
    await bump('sent', batch.messages.length);
    await setStatus({ lastError: null, lastThread: batch.threadName, lastPlatform: batch.platform });
    return { ok: true };
  } catch (e) {
    await setStatus({ lastError: String(e).slice(0, 140) });
    return { ok: false, error: String(e) };
  }
}

// Correo scrapeado de Outlook Web → POST <sirUrl>/api/email/ingest con
// { messages: [...] }. Mismo token/host que el reader (la extensión usa un solo
// token). El server normaliza y reusa todo el backend de correo.
async function ingestEmail(messages) {
  const { sirUrl, token } = await getConfig();
  if (!token) { await setStatus({ lastError: 'Falta el token — configuralo en el popup' }); return { ok: false, error: 'no-token' }; }
  try {
    const res = await fetch(`${sirUrl}/api/email/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-reader-token': token },
      body: JSON.stringify({ messages }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      await setStatus({ lastError: `HTTP ${res.status} ${detail.slice(0, 140)}` });
      return { ok: false, status: res.status };
    }
    await bump('sent', messages.length);
    await setStatus({ lastError: null, lastThread: `${messages.length} correo(s)`, lastPlatform: 'outlook' });
    return { ok: true };
  } catch (e) {
    await setStatus({ lastError: String(e).slice(0, 140) });
    return { ok: false, error: String(e) };
  }
}

// Señales sociales (IG/LinkedIn) leídas pasivamente → POST /api/social/ingest.
// El server resuelve handle→persona y deriva la señal de timing (Parte A/B).
async function ingestSocial(items, following) {
  const { sirUrl, token } = await getConfig();
  if (!token) { await setStatus({ lastError: 'Falta el token — configuralo en el popup' }); return { ok: false, error: 'no-token' }; }
  try {
    const res = await fetch(`${sirUrl}/api/social/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-reader-token': token },
      body: JSON.stringify({ items, following }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      await setStatus({ lastError: `HTTP ${res.status} ${detail.slice(0, 140)}` });
      return { ok: false, status: res.status };
    }
    const j = await res.json().catch(() => ({}));
    if (j && typeof j.inserted === 'number') await bump('sent', j.inserted);
    const followingSaved = j && typeof j.followingSaved === 'number' ? j.followingSaved : 0;
    const namesFilled = j && typeof j.namesFilled === 'number' ? j.namesFilled : 0;
    const suffix = following && following.length ? `, following: ${followingSaved}/${namesFilled}` : '';
    await setStatus({ lastError: null, lastThread: `social: ${items.length} señal(es)${suffix}`, lastPlatform: (items[0] && items[0].platform) || (following && following.length ? 'instagram' : 'social') });
    return { ok: true, ...j };
  } catch (e) {
    await setStatus({ lastError: String(e).slice(0, 140) });
    return { ok: false, error: String(e) };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'sir-batch' && msg.batch) {
    ingest(msg.batch).then(sendResponse);
    return true; // respuesta async
  }
  if (msg && msg.type === 'sir-social-batch' && (Array.isArray(msg.items) || Array.isArray(msg.following))) {
    ingestSocial(Array.isArray(msg.items) ? msg.items : [], Array.isArray(msg.following) ? msg.following : []).then(sendResponse);
    return true; // respuesta async
  }
  if (msg && msg.type === 'sir-email-batch' && Array.isArray(msg.messages)) {
    ingestEmail(msg.messages).then(sendResponse);
    return true; // respuesta async
  }
  if (msg && msg.type === 'sir-ping') { sendResponse({ ok: true }); return true; }
});

// ── Refresco periódico del tray de Instagram (PROACTIVO, bajo riesgo) ─────────
// Aaron deja su IG abierto en la PC; cada ~2.5h (con jitter) refrescamos una
// pestaña de instagram.com que NO esté enfocada, para que el interceptor capture
// el TRAY (quién tiene story activa + cuándo posteó) de TODOS sus follows de una.
// NO abrimos stories individuales (dejaría "visto" + es el patrón que banea):
// solo recargamos la home, que es lo que el propio IG hace al navegar.
// Se puede apagar con enabled.igRefresh=false (chrome.storage).
const IG_ALARM = 'sir-ig-tray-refresh';
const IG_BASE_MIN = 150; // ~2.5h

async function igRefreshEnabled() {
  try {
    const { enabled } = await chrome.storage.local.get('enabled');
    return !enabled || enabled.igRefresh !== false; // default ON
  } catch (_) { return true; }
}

async function scheduleIgRefresh() {
  // Jitter ±40 min para no golpear a intervalos exactos (más humano).
  const jitter = (Math.floor((Date.now() / 60000) % 80)) - 40;
  const when = Date.now() + (IG_BASE_MIN + jitter) * 60000;
  try { await chrome.alarms.create(IG_ALARM, { when }); } catch (_) {}
}

async function refreshIgTray() {
  if (!(await igRefreshEnabled())) return;
  try {
    const tabs = await chrome.tabs.query({ url: 'https://www.instagram.com/*' });
    // Solo una pestaña que NO esté activa (para no interrumpirte si la usas).
    const target = tabs.find((t) => !t.active);
    if (target && target.id != null) {
      // Recargar la home refresca el tray; el interceptor MAIN-world lo capta.
      await chrome.tabs.update(target.id, { url: 'https://www.instagram.com/' });
    }
  } catch (_) { /* sin pestaña / sin permiso → nada */ }
}

// ── LATIDO POR CANAL + WhatsApp Web viva ─────────────────────────────────────
//
// POR QUÉ (fallo real, 22→29 jul 2026): el reader de WhatsApp Web venía trayendo
// los mensajes de Aaron con latencia de SEGUNDOS. Se cortó el 22-jul y nadie se
// enteró hasta que él preguntó el 29 por qué no estaban sus conversaciones con
// Diana. SIETE DÍAS ciego — y lo que lo volvió invisible es que Instagram siguió
// andando, así que el reader parecía sano desde afuera.
//
// Dos arreglos:
//   1. LATIDO: cada canal con pestaña abierta reporta "estoy vivo" cada ~10 min.
//      Sin esto, "no llegaron datos" es ambiguo entre "no pasó nada" y "está
//      muerto", y esas dos cosas se veían idénticas desde el server.
//   2. WhatsApp Web VIVA: si no hay pestaña, se abre en segundo plano; si está
//      deslogueada (pide QR), se reporta en vez de fingir que anda.
const HB_ALARM = 'sir-heartbeat';
const HB_MIN = 10;

/** Canales que miramos, con el patrón de URL de su pestaña. */
const CANALES = [
  { channel: 'whatsapp', match: 'https://web.whatsapp.com/*' },
  { channel: 'instagram', match: 'https://www.instagram.com/*' },
  { channel: 'linkedin', match: 'https://www.linkedin.com/*' },
  { channel: 'teams', match: 'https://teams.microsoft.com/*' },
  { channel: 'outlook', match: 'https://outlook.office.com/*' },
];

async function postHeartbeat(channel, status, detail) {
  const { sirUrl, token } = await getConfig();
  if (!token) return;
  try {
    await fetch(`${sirUrl}/api/reader/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-reader-token': token },
      body: JSON.stringify({ channel, status, detail }),
    });
  } catch (_) { /* si no hay red, el próximo latido lo cubre */ }
}

/** ¿La pestaña de WhatsApp está pidiendo el QR? Se mira el TÍTULO, que no exige
 *  inyectar nada: WA Web lo pone en "WhatsApp" pelado y sin contador al estar
 *  deslogueado, pero lo confiable es preguntarle al content script. */
async function whatsappStatus(tabId) {
  try {
    const r = await chrome.tabs.sendMessage(tabId, { type: 'sir-wa-status' });
    return r && r.loggedIn === false ? 'logged_out' : 'ok';
  } catch (_) {
    // Sin respuesta del content script: la pestaña existe pero no está lista.
    return 'ok';
  }
}

async function beatAll() {
  for (const c of CANALES) {
    let tabs = [];
    try { tabs = await chrome.tabs.query({ url: c.match }); } catch (_) { tabs = []; }
    if (tabs.length === 0) continue; // sin pestaña no se late: el canal no corre
    let status = 'ok';
    if (c.channel === 'whatsapp' && tabs[0] && tabs[0].id != null) {
      status = await whatsappStatus(tabs[0].id);
    }
    await postHeartbeat(c.channel, status, `${tabs.length} pestaña(s)`);
  }
}

/** Si no hay pestaña de WhatsApp Web, la abre en segundo plano (sin robar foco).
 *  Se puede apagar con enabled.waKeepAlive=false. */
async function keepWhatsappAlive() {
  try {
    const { enabled } = await chrome.storage.local.get('enabled');
    if (enabled && enabled.waKeepAlive === false) return;
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
    if (tabs.length === 0) {
      await chrome.tabs.create({ url: 'https://web.whatsapp.com/', active: false, pinned: true });
      await setStatus({ lastThread: 'abrí WhatsApp Web (no había pestaña)' });
      return;
    }
    // Pestaña existe pero quedó en error/descargada → recargar.
    const t = tabs[0];
    if (t && t.id != null && (t.discarded || t.status === 'unloaded')) {
      await chrome.tabs.reload(t.id);
    }
  } catch (_) { /* sin permiso de tabs → nada */ }
}

async function scheduleHeartbeat() {
  try { await chrome.alarms.create(HB_ALARM, { when: Date.now() + HB_MIN * 60000 }); } catch (_) {}
}

try {
  chrome.alarms.onAlarm.addListener((a) => {
    if (!a) return;
    if (a.name === IG_ALARM) { refreshIgTray().finally(scheduleIgRefresh); }
    if (a.name === HB_ALARM) {
      keepWhatsappAlive().then(beatAll).finally(scheduleHeartbeat);
    }
  });
  chrome.runtime.onInstalled.addListener(() => { scheduleIgRefresh(); scheduleHeartbeat(); beatAll(); });
  chrome.runtime.onStartup.addListener(() => { scheduleIgRefresh(); scheduleHeartbeat(); keepWhatsappAlive().then(beatAll); });
  scheduleIgRefresh();
  scheduleHeartbeat();
  beatAll();
} catch (_) { /* entorno sin alarms */ }
