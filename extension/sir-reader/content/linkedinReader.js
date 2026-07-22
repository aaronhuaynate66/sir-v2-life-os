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
      // Nombre (para matchear/auto-setear la persona la 1ª vez, sin URL previa).
      const fn = typeof node.firstName === 'string' ? node.firstName.trim() : '';
      const ln = typeof node.lastName === 'string' ? node.lastName.trim() : '';
      const name = `${fn} ${ln}`.trim();
      acc.push({
        platform: 'linkedin',
        linkedinUrl: `https://linkedin.com/in/${pi}`,
        headline: headline.trim().slice(0, 200),
        name: name || undefined,
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

  // Fallback pasivo: si LinkedIn renderiza un perfil sin disparar JSON voyager
  // visible para el interceptor, lee SOLO el perfil actualmente abierto en DOM.
  const domSeen = new Set();
  let domTimer = null;
  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }
  function visibleLines(root) {
    return String((root && root.innerText) || '')
      .split(/\n+/)
      .map(cleanText)
      .filter(Boolean);
  }
  function currentProfileUrl() {
    const m = location.pathname.match(/^\/in\/([^/]+)/i);
    return m ? `https://linkedin.com/in/${m[1]}` : '';
  }
  function visibleProfileName() {
    const h1 = document.querySelector('h1');
    const h1Name = cleanText(h1 && h1.innerText);
    if (h1Name) return h1Name;

    const titleName = cleanText(document.title.replace(/\s*\|\s*LinkedIn.*$/i, ''));
    if (titleName && !/^(Feed|LinkedIn|Inicio)$/i.test(titleName)) return titleName;

    const main = document.querySelector('main') || document.body;
    return visibleLines(main).find((line, index, lines) =>
      index > 0 &&
      line.length > 2 &&
      line.length < 90 &&
      lines[index + 1] &&
      !/^(Inicio|Mi red|Empleos|Mensajes|Notificaciones|Yo|Para negocios|Publicidad|Recursos)$/i.test(line)
    ) || '';
  }
  function visibleProfileHeadline(name) {
    const main = document.querySelector('main') || document.body;
    const lines = visibleLines(main);
    const nameIndex = lines.findIndex((line) => line === name);
    const candidates = lines.slice(Math.max(0, nameIndex + 1), nameIndex > -1 ? nameIndex + 8 : 10);
    return candidates.find((line) =>
      line &&
      line !== name &&
      line.length > 8 &&
      line.length < 220 &&
      !/^(Más|Enviar mensaje|Conectar|Seguir|Mensaje|Contacto|Acerca de|Actividad)$/i.test(line)
    );
  }
  function scanProfileDom() {
    domTimer = null;
    try {
      const linkedinUrl = currentProfileUrl();
      if (!linkedinUrl || domSeen.has(linkedinUrl)) return;
      const name = visibleProfileName();
      const headline = visibleProfileHeadline(name);
      if (!name && !headline) return;
      domSeen.add(linkedinUrl);
      emit([{ platform: 'linkedin', linkedinUrl, name: name || undefined, headline: headline || undefined }]);
    } catch (_) {}
  }
  function scheduleDomScan() {
    if (domTimer) return;
    domTimer = setTimeout(scanProfileDom, 1500);
  }
  function patchHistoryMethod(method) {
    const orig = history[method];
    history[method] = function () {
      const out = orig.apply(this, arguments);
      scheduleDomScan();
      return out;
    };
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

  try {
    patchHistoryMethod('pushState');
    patchHistoryMethod('replaceState');
    addEventListener('popstate', scheduleDomScan);
    const mo = new MutationObserver(scheduleDomScan);
    mo.observe(document.documentElement || document, { childList: true, subtree: true });
    scheduleDomScan();
    setTimeout(scheduleDomScan, 5000);
  } catch (_) {}

  try { console.debug('[SIR Reader] linkedin reader activo (pasivo)'); } catch (_) {}
})();
