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

/** Resultado del último comando ejecutado, para acusarlo en el próximo latido. */
let comandoPendienteDeAcuse = null;

/**
 * Latido, ahora de IDA Y VUELTA.
 *
 * ANTES: mandaba `{channel, status, detail}` donde detail era literalmente
 * "1 pestaña(s)", y hacía `await fetch(...)` DESCARTANDO la respuesta. Por eso el
 * lector de WhatsApp pudo estar caído del 26 al 30 de julio con el latido diciendo
 * 'ok': contaba PESTAÑAS, no si el lector producía, y las dos cosas se veían
 * idénticas desde el servidor.
 *
 * AHORA manda además la versión de la extensión, su último error, cuánto lleva
 * enviado y el DIAGNÓSTICO del lector (`probe`), y LEE la respuesta: ahí vienen los
 * comandos. La vía de vuelta ya existía — solo se tiraba.
 */
async function postHeartbeat(channel, status, detail, probe) {
  const { sirUrl, token } = await getConfig();
  if (!token) return [];
  let extVersion = null;
  try { extVersion = chrome.runtime.getManifest().version; } catch (_) { /* */ }
  let lastError = null;
  let sentCount = null;
  try {
    const { status: st } = await chrome.storage.local.get('status');
    if (st) { lastError = st.lastError || null; sentCount = typeof st.sent === 'number' ? st.sent : null; }
  } catch (_) { /* */ }

  const body = { channel, status, detail, extVersion, lastError, sentCount };
  if (probe) body.probe = probe;
  // Acuse del comando anterior: cierra el ciclo entregado → ok/error. Sin esto no se
  // puede distinguir "nunca llegó" de "llegó y falló".
  if (comandoPendienteDeAcuse) body.result = comandoPendienteDeAcuse;

  try {
    const r = await fetch(`${sirUrl}/api/reader/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-reader-token': token },
      body: JSON.stringify(body),
    });
    comandoPendienteDeAcuse = null; // se entregó el acuse (o no había)
    const j = await r.json().catch(() => null);
    return (j && Array.isArray(j.comandos)) ? j.comandos : [];
  } catch (_) {
    return []; // si no hay red, el próximo latido lo cubre
  }
}

/**
 * Le pregunta al lector del canal cómo está de VERDAD. Devuelve null si el canal no
 * expone diagnóstico — y null significa "no sé", no "está bien".
 */
async function probeCanal(channel, tabId) {
  if (channel !== 'whatsapp' || tabId == null) return null;
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'sir-wa-probe' });
  } catch (_) {
    return null; // el content script no respondió
  }
}

/**
 * Ejecuta un comando llegado por el latido. Los tipos son un set CERRADO en el
 * servidor (`resync` | `probe`): un comando de texto libre corriendo en el navegador
 * de Aaron es una superficie que no se abre por comodidad.
 */
async function ejecutarComando(cmd, channel, tabId) {
  if (!cmd || !cmd.id) return;
  let ok = false;
  let detalle = '';
  try {
    if (channel !== 'whatsapp' || tabId == null) {
      detalle = `canal ${channel} sin ejecutor de comandos`;
    } else if (cmd.kind === 'probe') {
      const p = await chrome.tabs.sendMessage(tabId, { type: 'sir-wa-probe' });
      ok = !!p;
      detalle = JSON.stringify(p || {}).slice(0, 400);
    } else if (cmd.kind === 'resync') {
      const r = await chrome.tabs.sendMessage(tabId, {
        type: 'sir-wa-resync',
        dias: cmd.params && cmd.params.dias,
        chat: cmd.params && cmd.params.chat,
      });
      ok = !!(r && r.ok);
      detalle = JSON.stringify(r || {}).slice(0, 400);
    } else {
      detalle = `kind desconocido: ${cmd.kind}`;
    }
  } catch (e) {
    detalle = (e && e.message ? e.message : String(e)).slice(0, 400);
  }
  comandoPendienteDeAcuse = { id: cmd.id, ok, detalle };
  setStatus({ lastError: ok ? null : `comando ${cmd.kind}: ${detalle.slice(0, 120)}` });
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

/**
 * Recarga las pestañas de los canales para que Chrome reinyecte los content scripts
 * de la versión nueva. Se llama al instalar/actualizar/recargar la extensión.
 *
 * Es seguro: recargar WhatsApp Web o Instagram no pierde sesión ni datos, y el
 * ingest es idempotente por hash — si el backfill vuelve a mandar lo mismo, el
 * servidor lo deduplica. El costo de recargar de más es cero; el de no recargar
 * fueron cuatro días de silencio.
 */
async function reinyectarCanales() {
  for (const c of CANALES) {
    try {
      const tabs = await chrome.tabs.query({ url: c.match });
      for (const t of tabs) {
        if (t.id == null) continue;
        try { await chrome.tabs.reload(t.id, { bypassCache: false }); } catch (_) { /* */ }
      }
    } catch (_) { /* */ }
  }
}

async function beatAll() {
  for (const c of CANALES) {
    let tabs = [];
    try { tabs = await chrome.tabs.query({ url: c.match }); } catch (_) { tabs = []; }
    if (tabs.length === 0) continue; // sin pestaña no se late: el canal no corre
    const tabId = tabs[0] && tabs[0].id != null ? tabs[0].id : null;
    let status = 'ok';
    if (c.channel === 'whatsapp' && tabId != null) {
      status = await whatsappStatus(tabId);
    }
    // El diagnóstico del lector va EN el latido: es lo que distingue "la pestaña
    // está abierta" de "el lector está leyendo".
    const probe = await probeCanal(c.channel, tabId);
    const comandos = await postHeartbeat(c.channel, status, `${tabs.length} pestaña(s)`, probe);
    // Uno por latido (el servidor ya lo limita); con 10 min entre latidos, la cola
    // se drena sola sin necesidad de concurrencia.
    for (const cmd of comandos) await ejecutarComando(cmd, c.channel, tabId);
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
  chrome.runtime.onInstalled.addListener(() => {
    scheduleIgRefresh(); scheduleHeartbeat();
    // RE-INYECTAR LOS CONTENT SCRIPTS. Esta es la causa del silencio del reader de
    // WhatsApp del 26 al 30 de julio, y no se me habría ocurrido sin el diagnóstico
    // de la otra PC: `window.WPP` cargado, `ready: true`, `mainReady: true`,
    // wa-js 4.4.1... y CERO logs del lector.
    //
    // Chrome **no reinyecta los content scripts en las pestañas ya abiertas** cuando
    // se recarga o actualiza una extensión: los viejos quedan huérfanos (su
    // `chrome.runtime.sendMessage` empieza a tirar "Extension context invalidated")
    // y los nuevos no entran hasta que la pestaña se recargue. El service worker sí
    // es el nuevo, así que **el latido sigue diciendo 'ok'** mientras el lector está
    // muerto — las dos cosas se veían idénticas desde afuera.
    //
    // Recargar las pestañas de los canales es lo único que lo arregla, y depender de
    // que alguien se acuerde de apretar F5 en la otra PC no es una arquitectura.
    reinyectarCanales().finally(beatAll);
  });
  chrome.runtime.onStartup.addListener(() => { scheduleIgRefresh(); scheduleHeartbeat(); keepWhatsappAlive().then(beatAll); });
  scheduleIgRefresh();
  scheduleHeartbeat();
  beatAll();
} catch (_) { /* entorno sin alarms */ }
