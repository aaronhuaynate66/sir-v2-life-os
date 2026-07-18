// SIR Reader — LinkedIn (MAIN world, PASIVO por interceptación de red).
//
// Lee el JSON (voyager) que LinkedIn YA carga cuando VOS ves el perfil de un
// contacto — sin requests propios. Extrae { publicIdentifier → linkedinUrl,
// headline } y lo manda al bridge. El server compara el headline con el guardado
// y, si cambió, genera una señal 'job_change'. Best-effort: si LinkedIn cambia
// el shape de voyager, ajustar el deep-scan (ver README).

(() => {
  if (window.__SIR_LI_PATCHED) return;
  window.__SIR_LI_PATCHED = true;

  const MAX_DEPTH = 8;

  function emit(items) {
    if (!items || !items.length) return;
    try { window.postMessage({ __sirSocial: true, items }, '*'); } catch (_) {}
  }

  // Busca nodos de perfil con { publicIdentifier, headline } en el JSON voyager.
  function scan(node, depth, acc) {
    if (!node || depth > MAX_DEPTH || acc.length > 40) return;
    if (Array.isArray(node)) { for (const x of node) scan(x, depth + 1, acc); return; }
    if (typeof node !== 'object') return;

    const pi = node.publicIdentifier;
    const headline = node.headline;
    if (typeof pi === 'string' && pi && typeof headline === 'string' && headline.trim()) {
      acc.push({
        platform: 'linkedin',
        linkedinUrl: `https://linkedin.com/in/${pi}`,
        headline: headline.trim().slice(0, 200),
      });
    }
    for (const k in node) { const v = node[k]; if (v && typeof v === 'object') scan(v, depth + 1, acc); }
  }

  function handle(url, json) {
    if (!json || typeof json !== 'object') return;
    if (!/voyager|identity|profile/i.test(url) && !json.included && !json.data) return;
    const acc = [];
    try { scan(json, 0, acc); } catch (_) {}
    // Dedup por perfil dentro del batch.
    const byUrl = new Map();
    for (const it of acc) if (!byUrl.has(it.linkedinUrl)) byUrl.set(it.linkedinUrl, it);
    emit(Array.from(byUrl.values()));
  }

  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const p = origFetch.apply(this, args);
    try {
      const url = (args[0] && args[0].url) || String(args[0] || '');
      if (/voyager|api/i.test(url)) {
        p.then((res) => {
          try {
            const ct = res.headers.get('content-type') || '';
            if (!/json/i.test(ct)) return;
            res.clone().json().then((j) => { try { handle(url, j); } catch (_) {} }).catch(() => {});
          } catch (_) {}
        }).catch(() => {});
      }
    } catch (_) {}
    return p;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) { this.__sirUrl = url; return origOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', function () {
      try {
        const url = this.__sirUrl || '';
        if (!/voyager|api/i.test(url)) return;
        const txt = this.responseText;
        if (!txt || txt[0] !== '{') return;
        handle(url, JSON.parse(txt));
      } catch (_) {}
    });
    return origSend.apply(this, arguments);
  };

  try { console.debug('[SIR Reader] linkedin reader activo (pasivo)'); } catch (_) {}
})();
