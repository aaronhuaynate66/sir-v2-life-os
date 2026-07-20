// SIR Reader — Instagram (MAIN world, PASIVO por interceptación de red).
//
// Enfoque recomendado por el research: NO hace requests propios ni "ve" stories
// por su cuenta (eso IG lo detecta y banea). Solo lee el JSON que IG YA le manda
// a tu navegador mientras VOS navegás normal (tray de stories, story abierta),
// extrae señales de timing (handle + ¿tiene story activa? + texto visible) y las
// manda al bridge (socialBridge.js) por window.postMessage → /api/social/ingest.
//
// OJO: los shapes internos de IG cambian; la extracción es best-effort con un
// deep-scan tolerante. Si deja de capturar, hay que ajustar acá (ver README).

(() => {
  if (window.__SIR_IG_PATCHED) return;
  window.__SIR_IG_PATCHED = true;

  const TEXT_KEYS = new Set(['accessibility_caption', 'text']);
  const MAX_DEPTH = 8;

  function emit(items) {
    if (!items || !items.length) return;
    try { window.postMessage({ __sirSocial: true, items }, '*'); } catch (_) {}
  }

  // Junta texto legible (captions, overlays) de un nodo de story, poco profundo.
  function collectText(node, out, depth) {
    if (!node || depth > 4 || out.length > 6) return;
    if (typeof node === 'object') {
      for (const k in node) {
        const v = node[k];
        if (typeof v === 'string' && TEXT_KEYS.has(k) && v.trim()) out.push(v.trim());
        else if (k === 'caption' && v && typeof v.text === 'string') out.push(v.text.trim());
        else if (v && typeof v === 'object') collectText(v, out, depth + 1);
      }
    }
  }

  // Deep-scan tolerante: busca nodos "de usuario" con story y arma la señal.
  function scan(node, depth, acc) {
    if (!node || depth > MAX_DEPTH || acc.length > 60) return;
    if (Array.isArray(node)) { for (const x of node) scan(x, depth + 1, acc); return; }
    if (typeof node !== 'object') return;

    // Nodo de tray/reel: { user:{username}, items:[...] } o { username, latest_reel_media }.
    const user = node.user && typeof node.user === 'object' ? node.user : node;
    const username = typeof user.username === 'string' ? user.username : null;
    // full_name → el server matchea por NOMBRE y auto-rellena instagram_handle la
    // 1ª vez ("quién es quién" sin carga manual). Igual que el bootstrap de LinkedIn.
    const fullName = typeof user.full_name === 'string' && user.full_name.trim() ? user.full_name.trim() : undefined;
    if (username) {
      const hasStory =
        (Array.isArray(node.items) && node.items.length > 0) ||
        node.latest_reel_media > 0 ||
        !!node.has_besties_media ||
        (Array.isArray(node.reel) && node.reel.length > 0);
      if (hasStory || Array.isArray(node.items)) {
        const textOut = [];
        collectText(node.items || node.reel || node, textOut, 0);
        // Timestamp REAL de la última story (cuándo POSTEÓ, no cuándo capturamos)
        // → alimenta el ritmo. latest_reel_media suele ser unix segundos.
        let activityAt;
        const lrm = node.latest_reel_media;
        if (typeof lrm === 'number' && lrm > 1e9 && lrm < 1e11) activityAt = new Date(lrm * 1000).toISOString();
        acc.push({ platform: 'instagram', handle: username, name: fullName, hasActiveStory: !!hasStory, text: textOut.join(' · ').slice(0, 300) || undefined, activityAt });
      }
    }
    for (const k in node) { const v = node[k]; if (v && typeof v === 'object') scan(v, depth + 1, acc); }
  }

  function handle(url, json) {
    if (!json || typeof json !== 'object') return;
    // Solo endpoints con stories/reels (evita procesar JSON irrelevante).
    if (!/reels_tray|reels_media|feed\/reels|\/stories\/|clips|story/i.test(url) && !json.tray && !json.reels && !json.reels_media) return;
    const acc = [];
    try { scan(json.tray || json.reels_media || json.reels || json, 0, acc); } catch (_) {}
    // Dedup por handle dentro del batch (quedate con el que trae texto).
    const byHandle = new Map();
    for (const it of acc) {
      const prev = byHandle.get(it.handle);
      if (!prev || (!prev.text && it.text)) byHandle.set(it.handle, it);
    }
    emit(Array.from(byHandle.values()));
  }

  // ── Patch fetch ──────────────────────────────────────────────────────────
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const p = origFetch.apply(this, args);
    try {
      const url = (args[0] && args[0].url) || String(args[0] || '');
      p.then((res) => {
        try {
          const ct = res.headers.get('content-type') || '';
          if (!/json/i.test(ct)) return;
          res.clone().json().then((j) => { try { handle(url, j); } catch (_) {} }).catch(() => {});
        } catch (_) {}
      }).catch(() => {});
    } catch (_) {}
    return p;
  };

  // ── Patch XHR ────────────────────────────────────────────────────────────
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) { this.__sirUrl = url; return origOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', function () {
      try {
        const ct = this.getResponseHeader && this.getResponseHeader('content-type');
        if (ct && !/json/i.test(ct)) return;
        const txt = this.responseText;
        if (!txt || txt[0] !== '{') return;
        handle(this.__sirUrl || '', JSON.parse(txt));
      } catch (_) {}
    });
    return origSend.apply(this, arguments);
  };

  try { console.debug('[SIR Reader] instagram reader activo (pasivo)'); } catch (_) {}
})();
