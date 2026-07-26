// SIR Reader — puente ISOLATED para el reader social (IG/LinkedIn).
//
// Los readers de IG/LinkedIn corren en el MAIN world (para interceptar fetch/XHR)
// y no tienen chrome.*. Nos mandan las capturas por window.postMessage; acá las
// reenviamos al background como 'sir-social-batch' → POST /api/social/ingest.
// Idempotente + dedup: el server evita duplicar la misma señal.

(() => {
  const seen = new Set(); // dedup en memoria por sesión de página
  const followingSeen = new Set();
  let pending = [];
  let pendingFollowing = [];
  let timer = null;

  function key(it) {
    const mutual = Array.isArray(it.followedBy) ? it.followedBy.map((f) => f && (f.handle || f.name)).filter(Boolean).join(',').slice(0, 160) : '';
    return `${it.platform}|${it.handle || it.linkedinUrl || ''}|${it.kind || ''}|${(it.text || it.headline || it.avatarUrl || mutual || '').slice(0, 160)}`;
  }

  function flush() {
    timer = null;
    if (!pending.length && !pendingFollowing.length) return;
    const items = pending.splice(0, 100);
    const following = pendingFollowing.splice(0, 500);
    try {
      chrome.runtime.sendMessage({ type: 'sir-social-batch', items, following })
        .then((res) => {
          try {
            console.debug('[SIR Reader] social→', items.length, 'señal(es),', following.length, 'seguido(s)', res && res.ok ? 'ok' : res);
          } catch (_) {}
        })
        .catch(() => {});
    } catch (_) { /* contexto de extensión no disponible */ }
    if (pending.length || pendingFollowing.length) timer = setTimeout(flush, 1200);
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.__sirSocial !== true) return;
    if (Array.isArray(d.items)) {
      for (const it of d.items) {
        if (!it || !it.platform) continue;
        const k = key(it);
        if (seen.has(k)) continue;
        seen.add(k);
        pending.push(it);
      }
    }
    if (Array.isArray(d.following)) {
      for (const it of d.following) {
        if (!it || !it.handle) continue;
        const handle = String(it.handle).trim().replace(/^@/, '').toLowerCase();
        if (!handle || followingSeen.has(handle)) continue;
        followingSeen.add(handle);
        const item = { handle };
        const name = typeof it.name === 'string' && it.name.trim() ? it.name.trim() : '';
        if (name) item.name = name;
        pendingFollowing.push(item);
      }
    }
    if ((pending.length || pendingFollowing.length) && !timer) timer = setTimeout(flush, 3000);
  });
})();
