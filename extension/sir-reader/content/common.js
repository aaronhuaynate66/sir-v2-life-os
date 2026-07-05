// SIR Reader — núcleo compartido del content script (pasivo).
//
// Cada adaptador (teams.js / whatsapp.js) define window.__SIR_ADAPTER con:
//   { platform, getThread(): {threadId, threadName} | null,
//     getContainer(): Element | null, extractMessages(container): [{author,text,ts}] }
// Este núcleo corre un MutationObserver sobre el contenedor de mensajes: cuando
// aparece algo nuevo (porque VOS estás mirando/scrolleando normal), extrae los
// mensajes, deduplica en memoria y los manda en lote al background — que a su vez
// los postea a tu SIR. NADA de auto-scroll ni requests: solo leemos lo ya cargado.

(() => {
  const CORE = {
    started: false,
    seen: new Set(),          // hashes ya vistos (por sesión de página)
    pending: new Map(),       // threadId -> {threadName, messages:[]}
    flushTimer: null,
    observer: null,
    scanTimer: null,
  };

  const FLUSH_MS = 4000;      // agrupa y manda cada 4s
  const MAX_BATCH = 80;

  function log(...a) { try { console.debug('[SIR Reader]', ...a); } catch (_) {} }

  async function isEnabled(platform) {
    try {
      const { enabled } = await chrome.storage.local.get('enabled');
      return !enabled || enabled[platform] !== false; // default ON salvo apagado explícito
    } catch (_) { return true; }
  }

  function hash(threadId, m) {
    const s = `${threadId}|${m.author}|${m.ts || ''}|${m.text}`;
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
    return `${s.length}:${h}`;
  }

  function queue(thread, messages) {
    const bucket = CORE.pending.get(thread.threadId) || { threadName: thread.threadName, messages: [] };
    bucket.threadName = thread.threadName || bucket.threadName;
    for (const m of messages) {
      if (!m.text || !m.text.trim()) continue;
      const key = hash(thread.threadId, m);
      if (CORE.seen.has(key)) continue;
      CORE.seen.add(key);
      bucket.messages.push(m);
      if (bucket.messages.length > MAX_BATCH) bucket.messages.shift();
    }
    if (bucket.messages.length) CORE.pending.set(thread.threadId, bucket);
  }

  function scheduleFlush() {
    if (CORE.flushTimer) return;
    CORE.flushTimer = setTimeout(flush, FLUSH_MS);
  }

  async function flush() {
    CORE.flushTimer = null;
    const adapter = window.__SIR_ADAPTER;
    if (!adapter) return;
    for (const [threadId, bucket] of CORE.pending) {
      if (!bucket.messages.length) continue;
      const batch = { platform: adapter.platform, threadId, threadName: bucket.threadName, messages: bucket.messages.slice() };
      bucket.messages.length = 0;
      try {
        const res = await chrome.runtime.sendMessage({ type: 'sir-batch', batch });
        log('enviado', batch.threadName, batch.messages.length, res && res.ok ? 'ok' : res);
      } catch (e) { log('error enviando', e); }
    }
    CORE.pending.clear();
  }

  function scan() {
    const adapter = window.__SIR_ADAPTER;
    if (!adapter) return;
    const thread = adapter.getThread();
    const container = adapter.getContainer();
    if (!thread || !thread.threadId || !container) return;
    let msgs;
    try { msgs = adapter.extractMessages(container) || []; } catch (e) { log('extract error', e); return; }
    if (!msgs.length) return;
    queue(thread, msgs);
    scheduleFlush();
  }

  function attachObserver() {
    const adapter = window.__SIR_ADAPTER;
    if (!adapter) return;
    const container = adapter.getContainer();
    if (!container) return;
    if (CORE.observer) CORE.observer.disconnect();
    CORE.observer = new MutationObserver(() => {
      // Debounce: agrupa ráfagas de renders en un solo scan.
      if (CORE.scanTimer) clearTimeout(CORE.scanTimer);
      CORE.scanTimer = setTimeout(scan, 500);
    });
    CORE.observer.observe(container, { childList: true, subtree: true });
    scan(); // primera pasada de lo ya visible
    log('observando', adapter.platform, container);
  }

  async function boot() {
    const adapter = window.__SIR_ADAPTER;
    if (!adapter) return;
    if (!(await isEnabled(adapter.platform))) { log(adapter.platform, 'apagado'); return; }
    if (CORE.started) return;
    // El contenedor de mensajes puede tardar en aparecer (SPA). Reintentamos.
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (adapter.getContainer()) {
        clearInterval(iv);
        CORE.started = true;
        attachObserver();
      } else if (tries > 60) {
        clearInterval(iv);
        log('no encontré el contenedor de mensajes (', adapter.platform, ') — puede que los selectores necesiten ajuste');
      }
    }, 1500);
  }

  // ─── Diagnóstico: qué ve la extensión AHORA (para depurar selectores) ───────
  // El popup dispara 'sir-diagnose' → devolvemos un reporte legible: si encontró
  // el hilo, el contenedor, cuántos mensajes extrajo, una muestra, y una pista del
  // DOM cuando falla. Un agente puede pegar esto para que ajustemos los selectores.
  function shortHtml(el, max) {
    if (!el) return '(no encontrado)';
    const h = (el.outerHTML || '').replace(/\s+/g, ' ').trim();
    return h.length > max ? h.slice(0, max) + '…' : h;
  }
  function diagnose() {
    const adapter = window.__SIR_ADAPTER;
    if (!adapter) return { ok: false, error: 'adapter no cargado' };
    let thread = null, container = null, sample = [], err = null;
    try { thread = adapter.getThread(); } catch (e) { err = 'getThread: ' + e; }
    try { container = adapter.getContainer(); } catch (e) { err = (err || '') + ' getContainer: ' + e; }
    if (container) {
      try { sample = (adapter.extractMessages(container) || []).slice(-3); } catch (e) { err = (err || '') + ' extract: ' + e; }
    }
    // Pista del DOM cuando no hay contenedor: los data-tid / clases más frecuentes.
    let hint = '';
    if (!container) {
      const tids = {};
      document.querySelectorAll('[data-tid]').forEach((n) => { const t = n.getAttribute('data-tid'); tids[t] = (tids[t] || 0) + 1; });
      const top = Object.entries(tids).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}(${v})`);
      hint = 'data-tid presentes: ' + (top.join(', ') || 'ninguno');
    }
    return {
      ok: !!(thread && container && sample.length),
      platform: adapter.platform,
      threadName: thread ? thread.threadName : null,
      containerFound: !!container,
      containerHtml: shortHtml(container, 220),
      sampleCount: sample.length,
      sample: sample.map((m) => ({ author: m.author, ts: m.ts, text: (m.text || '').slice(0, 80) })),
      error: err,
      hint,
    };
  }

  try {
    chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
      if (msg && msg.type === 'sir-diagnose') { sendResponse(diagnose()); return true; }
    });
  } catch (_) { /* */ }

  window.__SIR_CORE_BOOT = boot;
  // El adaptador llama a __SIR_CORE_BOOT() cuando ya seteó window.__SIR_ADAPTER.
})();
