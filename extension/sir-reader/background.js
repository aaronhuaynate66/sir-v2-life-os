// SIR Reader — service worker (MV3).
//
// Recibe lotes de los content scripts y los postea a TU SIR
// (POST <sirUrl>/api/reader/ingest, header x-reader-token). El token y la URL
// viven en chrome.storage.local (los seteás en el popup). El token NUNCA está en
// la página: solo acá. Mantiene un estado simple (último envío, contador, error)
// para mostrar en el popup.

const DEFAULT_SIR_URL = 'https://sir-v2-life-os.vercel.app';

async function getConfig() {
  const { sirUrl, token } = await chrome.storage.local.get(['sirUrl', 'token']);
  return { sirUrl: (sirUrl || DEFAULT_SIR_URL).replace(/\/+$/, ''), token: token || '' };
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'sir-batch' && msg.batch) {
    ingest(msg.batch).then(sendResponse);
    return true; // respuesta async
  }
  if (msg && msg.type === 'sir-ping') { sendResponse({ ok: true }); return true; }
});
