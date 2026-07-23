// SIR Reader — puente ISOLATED para el reader social (IG/LinkedIn).
//
// Los readers de IG/LinkedIn corren en el MAIN world (para interceptar fetch/XHR)
// y no tienen chrome.*. Nos mandan las capturas por window.postMessage; acá las
// reenviamos al background como 'sir-social-batch' → POST /api/social/ingest.
// Idempotente + dedup: el server evita duplicar la misma señal.

(() => {
  const seen = new Set(); // dedup en memoria por sesión de página
  let pending = [];
  let timer = null;

  function key(it) {
    return `${it.platform}|${it.handle || it.linkedinUrl || ''}|${it.kind || ''}|${(it.text || it.headline || it.avatarUrl || '').slice(0, 120)}`;
  }

  function flush() {
    timer = null;
    if (!pending.length) return;
    const items = pending.splice(0, 100);
    try {
      chrome.runtime.sendMessage({ type: 'sir-social-batch', items })
        .then((res) => { try { console.debug('[SIR Reader] social→', items.length, res && res.ok ? 'ok' : res); } catch (_) {} })
        .catch(() => {});
    } catch (_) { /* contexto de extensión no disponible */ }
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.__sirSocial !== true || !Array.isArray(d.items)) return;
    for (const it of d.items) {
      if (!it || !it.platform) continue;
      const k = key(it);
      if (seen.has(k)) continue;
      seen.add(k);
      pending.push(it);
    }
    if (pending.length && !timer) timer = setTimeout(flush, 3000);
  });
})();
