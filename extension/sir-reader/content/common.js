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

  // F4: en WhatsApp, si el lector wa-js (MAIN world) está activo marca
  // <html data-sir-wajs="active"> → el scraper DOM se pone en standby para NO
  // duplicar (wa-js ya captura todo). Si wa-js no cargó, el DOM corre como antes.
  function wajsActive(platform) {
    return platform === 'whatsapp' && document.documentElement.dataset.sirWajs === 'active';
  }

  async function boot() {
    const adapter = window.__SIR_ADAPTER;
    if (!adapter) return;
    if (!(await isEnabled(adapter.platform))) { log(adapter.platform, 'apagado'); return; }
    if (CORE.started) return;
    if (wajsActive(adapter.platform)) { log('wa-js activo → scraper DOM en standby'); return; }
    // El contenedor de mensajes puede tardar en aparecer (SPA). Reintentamos.
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (wajsActive(adapter.platform)) {
        clearInterval(iv);
        log('wa-js activo → scraper DOM en standby');
      } else if (adapter.getContainer()) {
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
    // Pista del DOM: los data-tid / clases más frecuentes (para reconstruir selectores).
    let hint = '';
    const scope = container || document.body;
    const tids = {};
    scope.querySelectorAll('[data-tid]').forEach((n) => { const t = n.getAttribute('data-tid'); tids[t] = (tids[t] || 0) + 1; });
    const top = Object.entries(tids).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k}(${v})`);
    hint = 'data-tid: ' + (top.join(', ') || 'ninguno');

    // Si hay contenedor pero extraemos poco/nada, dumpear el HTML CRUDO de las
    // primeras "filas" candidatas — con eso se escribe el selector exacto de una.
    let rowsHtml = null;
    if (container && sample.length === 0) {
      const guessRows = container.querySelectorAll(
        '[data-tid*="message"], .fui-ChatMessage, [role="listitem"], [data-tid="chat-pane-message"]'
      );
      const pick = guessRows.length ? guessRows : container.children;
      rowsHtml = Array.from(pick).slice(0, 2).map((el) => shortHtml(el, 600));
    }
    return {
      ok: !!(thread && container && sample.length),
      platform: adapter.platform,
      threadName: thread ? thread.threadName : null,
      containerFound: !!container,
      containerHtml: shortHtml(container, 220),
      sampleCount: sample.length,
      sample: sample.map((m) => ({ author: m.author, ts: m.ts, text: (m.text || '').slice(0, 80) })),
      rowsHtml,
      error: err,
      hint,
    };
  }

  try {
    chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
      if (msg && msg.type === 'sir-diagnose') {
        // Outlook (outlook.js) no usa el CORE de chat: corre su propio scanner y
        // expone su diagnóstico en window.__SIR_EMAIL. Si no hay adapter de chat
        // pero sí el módulo de correo, delegamos ahí.
        if (!window.__SIR_ADAPTER && window.__SIR_EMAIL && typeof window.__SIR_EMAIL.diagnose === 'function') {
          sendResponse(window.__SIR_EMAIL.diagnose());
          return true;
        }
        sendResponse(diagnose());
        return true;
      }
    });
  } catch (_) { /* */ }

  // Puente MAIN→ISOLATED: el lector wa-js (waStoreReader.js) corre en MAIN world
  // (sin chrome.*) y nos manda los batches por window.postMessage. Los reenviamos
  // por el MISMO transporte que el scraper DOM (sir-batch → background →
  // /api/reader/ingest). El server deduplica por hash, así que es idempotente.
  try {
    window.addEventListener('message', (e) => {
      if (e.source !== window) return;
      const d = e.data;
      if (!d || d.__sirReader !== true || !d.batch || !Array.isArray(d.batch.messages)) return;
      chrome.runtime.sendMessage({ type: 'sir-batch', batch: d.batch })
        .then((res) => log('puente→', d.batch.threadName, d.batch.messages.length, res && res.ok ? 'ok' : res))
        .catch((err) => log('puente error', err));
    });
  } catch (_) { /* */ }

  // ── PUENTE ISOLATED → MAIN → ISOLATED (comandos con respuesta) ────────────
  //
  // El puente de arriba va en un solo sentido: MAIN empuja batches. Los comandos que
  // llegan por el latido necesitan RESPUESTA, y el background no le puede hablar al
  // mundo MAIN (ahí no existe `chrome.*`). Así que este lado traduce:
  //   background --chrome.tabs.sendMessage--> ISOLATED --postMessage--> MAIN
  //                                        <--postMessage-- MAIN
  //
  // Cada pedido lleva un id propio para casar la respuesta: si dos comandos se
  // solaparan, sin id la primera respuesta resolvería al segundo pedido.
  const cmdPendientes = new Map();
  let cmdSeq = 0;
  try {
    window.addEventListener('message', (e) => {
      if (e.source !== window) return;
      const d = e.data;
      if (!d || d.__sirCmdRes !== true || !d.id) return;
      const resolver = cmdPendientes.get(d.id);
      if (resolver) { cmdPendientes.delete(d.id); resolver(d.res); }
    });
  } catch (_) { /* */ }

  /** Manda un comando al lector del mundo MAIN y espera su respuesta. */
  function pedirAlLectorMain(kind, extra, timeoutMs) {
    return new Promise((resolve) => {
      const id = `c${Date.now()}_${++cmdSeq}`;
      cmdPendientes.set(id, resolve);
      // Timeout explícito: sin esto, un lector que no cargó dejaría al background
      // esperando para siempre y el latido siguiente se apilaría encima.
      setTimeout(() => {
        if (cmdPendientes.has(id)) {
          cmdPendientes.delete(id);
          resolve({ ok: false, error: 'el lector del Store no respondió (¿wa-js no cargó?)' });
        }
      }, timeoutMs);
      try { window.postMessage(Object.assign({ __sirCmd: true, id, kind }, extra || {}), '*'); }
      catch (err) { cmdPendientes.delete(id); resolve({ ok: false, error: String(err) }); }
    });
  }

  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg) return undefined;
      if (msg.type === 'sir-wa-probe') {
        // 8 s: el probe solo lee el Store local, no la red.
        pedirAlLectorMain('probe', null, 8000).then((r) => sendResponse((r && r.probe) || null));
        return true;
      }
      if (msg.type === 'sir-wa-resync') {
        // 4 min: el resync barre hasta 300 chats con 400 ms entre cada uno.
        pedirAlLectorMain('resync', { dias: msg.dias, chat: msg.chat }, 240000).then((r) => sendResponse(r));
        return true;
      }
      return undefined;
    });
  } catch (_) { /* */ }

  window.__SIR_CORE_BOOT = boot;
  // El adaptador llama a __SIR_CORE_BOOT() cuando ya seteó window.__SIR_ADAPTER.
})();
