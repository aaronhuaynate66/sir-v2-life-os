// SIR Reader — Instagram (MAIN world, PASIVO por interceptación de red).
//
// Enfoque recomendado por el research: NO hace requests propios ni "ve" stories
// por su cuenta (eso IG lo detecta y banea). Solo lee el JSON que IG YA le manda
// a tu navegador mientras VOS navegas normal (tray de stories, story abierta),
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

  function emitFollowing(following) {
    if (!following || !following.length) return;
    try { window.postMessage({ __sirSocial: true, following }, '*'); } catch (_) {}
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
      if (hasStory) {
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

  // ── Perfil: seguidores, publicaciones, bio, nombre (issue #994) ───────────
  //
  // Aaron preguntó por qué, si el reader ya saca el user de las historias, no
  // saca de una vez los seguidores y las publicaciones. La respuesta es que sí
  // puede y sin pedirle NADA nuevo a Instagram: cuando él entra a un perfil, IG
  // ya le manda todo eso en la respuesta que carga la página. Lo que pasaba es
  // que `handle()` filtraba con `looksTray` y tiraba el payload entero.
  //
  // Esto sigue siendo PASIVO: no abrimos perfiles ni pedimos nada: leemos lo que
  // ya pasó por el navegador porque Aaron entró ahí él mismo.
  //
  // Vale doble porque el nombre real casi solo existe acá: la barra de historias
  // da el handle pelado (130 cuentas en la bandeja, 0 con nombre al 27-jul).

  function num(v) {
    if (typeof v === 'number' && isFinite(v) && v >= 0) return v;
    if (v && typeof v === 'object' && typeof v.count === 'number') return v.count;
    if (typeof v === 'string' && v.trim()) return v.trim(); // el server expande "1.2k"
    return undefined;
  }

  function firstDefined() {
    for (let i = 0; i < arguments.length; i++) {
      if (arguments[i] !== undefined && arguments[i] !== null) return arguments[i];
    }
    return undefined;
  }

  // Los shapes de IG conviven: REST viejo (edge_followed_by.count),
  // REST nuevo (follower_count) y GraphQL. Aceptamos cualquiera.
  function profileFromUserNode(u) {
    if (!u || typeof u !== 'object') return null;
    const username = typeof u.username === 'string' ? u.username.trim() : '';
    if (!username) return null;

    const followers = firstDefined(num(u.edge_followed_by), num(u.follower_count));
    const following = firstDefined(num(u.edge_follow), num(u.following_count));
    const posts = firstDefined(num(u.edge_owner_to_timeline_media), num(u.media_count));

    // Sin ningún contador esto no es un nodo de perfil (es el user de una story).
    if (followers === undefined && following === undefined && posts === undefined) return null;

    const profile = { handle: username };
    if (typeof u.full_name === 'string' && u.full_name.trim()) profile.fullName = u.full_name.trim();
    if (typeof u.biography === 'string' && u.biography.trim()) profile.biography = u.biography.trim();
    if (typeof u.external_url === 'string' && u.external_url.trim()) profile.externalLink = u.external_url.trim();
    const cat = firstDefined(u.category_name, u.business_category_name, u.category);
    if (typeof cat === 'string' && cat.trim()) profile.category = cat.trim();
    if (followers !== undefined) profile.followersCount = followers;
    if (following !== undefined) profile.followingCount = following;
    if (posts !== undefined) profile.postsCount = posts;
    if (typeof u.is_verified === 'boolean') profile.isVerified = u.is_verified;
    const biz = firstDefined(u.is_business_account, u.is_business, u.is_professional_account);
    if (typeof biz === 'boolean') profile.isBusiness = biz;
    return profile;
  }

  function findProfile(node, depth) {
    if (!node || depth > MAX_DEPTH || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const x of node) { const hit = findProfile(x, depth + 1); if (hit) return hit; }
      return null;
    }
    const direct = profileFromUserNode(node.user) || profileFromUserNode(node);
    if (direct) return direct;
    for (const k in node) {
      const v = node[k];
      if (v && typeof v === 'object') { const hit = findProfile(v, depth + 1); if (hit) return hit; }
    }
    return null;
  }

  const profileSeen = new Map(); // handle -> firma, para no re-mandar lo mismo

  function handleProfile(url, json) {
    // Gate barato antes del scan: perfiles llegan por endpoints reconocibles.
    const looksProfile =
      /web_profile_info|users\/\d+\/info|ProfilePage|profile_page|PolarisProfile/i.test(url) ||
      (json && typeof json === 'object' && json.data && json.data.user && typeof json.data.user === 'object');
    if (!looksProfile) return false;

    let p = null;
    try { p = findProfile(json, 0); } catch (_) {}
    if (!p) return false;

    // Dedup: solo re-emitimos si algo cambió (los contadores se mueven).
    const firma = [p.followersCount, p.followingCount, p.postsCount, p.fullName].join('|');
    if (profileSeen.get(p.handle) === firma) return true;
    profileSeen.set(p.handle, firma);

    // Va como item normal: el server ya sabe matchear por handle/nombre. El
    // `name` de primer nivel es lo que rellena la bandeja "¿quién es quién?".
    const item = { platform: 'instagram', handle: p.handle, profile: p };
    if (p.fullName) item.name = p.fullName;
    emit([item]);
    return true;
  }

  function handle(url, json) {
    if (!json || typeof json !== 'object') return;
    // El perfil se mira PRIMERO y no corta el flujo: una misma respuesta puede
    // traer perfil y tray a la vez.
    try { handleProfile(url, json); } catch (_) {}
    // ¿Trae el tray de historias? IG web migró de REST a GraphQL, así que NO
    // dependemos del endpoint exacto (cambia seguido): aceptamos por URL conocida,
    // por keys de nivel superior, o —para GraphQL— por SNIFF ACOTADO del contenido
    // (field names que IG usa en ambos: reels_tray/latest_reel_media/reels_media).
    let looksTray =
      /reels_tray|reels_media|feed\/reels|\/stories\/|clips|story/i.test(url) ||
      !!json.tray || !!json.reels || !!json.reels_media;
    if (!looksTray && /graphql/i.test(url)) {
      try { looksTray = /reels_tray|latest_reel_media|reels_media/.test(JSON.stringify(json).slice(0, 60000)); } catch (_) {}
    }
    if (!looksTray) return;
    const acc = [];
    // Scan del objeto ENTERO: el deep-scan tolerante encuentra los nodos de usuario
    // con story donde sea que IG los anide (REST plano o GraphQL profundo).
    try { scan(json, 0, acc); } catch (_) {}
    // Dedup por handle dentro del batch (quedate con el que trae texto).
    const byHandle = new Map();
    for (const it of acc) {
      const prev = byHandle.get(it.handle);
      if (!prev || (!prev.text && it.text)) byHandle.set(it.handle, it);
    }
    emit(Array.from(byHandle.values()));
  }

  // Fallback pasivo: IG a veces ya renderiza la barra de historias en DOM pero
  // no expone `reels_tray/latest_reel_media` en las respuestas interceptadas.
  // Leemos SOLO labels visibles tipo "Story by foo, not seen"; no abrimos stories.
  const domSeen = new Set();
  let domTimer = null;
  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }
  function comparableName(value) {
    return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }
  function isHandleLike(value) {
    return /^[a-z0-9._]{2,30}$/i.test(cleanText(value));
  }
  function distinctDisplayName(value, handle) {
    const name = cleanText(value);
    if (!name || name.length > 80) return undefined;
    if (comparableName(name) === comparableName(handle)) return undefined;
    if (isHandleLike(name) && comparableName(name) === comparableName(handle.replace(/^@/, ''))) return undefined;
    return name;
  }
  function displayNameFromAlt(alt, handle) {
    const text = cleanText(alt);
    if (!text) return undefined;
    const patterns = [
      /^Foto de perfil de\s+(.+)$/i,
      /^Foto del perfil de\s+(.+)$/i,
      /^Profile picture of\s+(.+)$/i,
      /^(.+?)'s profile picture$/i
    ];
    for (const pattern of patterns) {
      const m = text.match(pattern);
      const name = m && distinctDisplayName(m[1], handle);
      if (name) return name;
    }
    return undefined;
  }
  function displayNameFromText(root, handle) {
    const seen = new Set();
    const nodes = root ? root.querySelectorAll('[dir="auto"], span, div') : [];
    for (const node of nodes) {
      const text = cleanText(node.textContent);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      if (text.includes('\n') || text.length > 80) continue;
      const name = distinctDisplayName(text, handle);
      if (name && !isHandleLike(name)) return name;
    }
    return undefined;
  }
  function storyDomMeta(el, handle) {
    const root = el.closest('li') || el.closest('div[role="button"], a, button') || el;
    const img = (root && root.querySelector('img')) || el.querySelector('img');
    const avatarUrl = img && img.src ? img.src : undefined;
    const name = displayNameFromAlt(img && img.getAttribute('alt'), handle) || displayNameFromText(root, handle);
    return { name, avatarUrl };
  }
  function scanStoryDom() {
    domTimer = null;
    const items = [];
    try {
      const nodes = document.querySelectorAll('[aria-label]');
      for (const el of nodes) {
        const label = (el.getAttribute('aria-label') || '').trim();
        const m = label.match(/^(?:Story by|Historia de)\s+([^,]+),\s*(?:not seen|no vista|no visto)/i);
        if (!m) continue;
        const handle = m[1].trim();
        if (!handle || domSeen.has(handle)) continue;
        domSeen.add(handle);
        const meta = storyDomMeta(el, handle);
        const item = { platform: 'instagram', handle, hasActiveStory: true };
        // IG ya no expone un display name útil en la story bar; el avatar sí
        // permite identificar visualmente contactos sin abrir la historia.
        if (meta.name) item.name = meta.name;
        if (meta.avatarUrl) item.avatarUrl = meta.avatarUrl;
        items.push(item);
        if (items.length >= 40) break;
      }
    } catch (_) {}
    emit(items);
  }

  function scheduleDomScan() {
    if (domTimer) return;
    domTimer = setTimeout(scanStoryDom, 1200);
  }

  // Catálogo de "Siguiendo": SOLO cuando Aaron ya abrió el diálogo/pantalla.
  // Acá sí se permite bajar el scroll del diálogo, despacio, porque esa vista se
  // abrió a propósito para resolver handles -> nombres reales.
  const followingSeen = new Set();
  let followingTimer = null;
  let followingRun = null;
  let followingStopped = false;

  function handleFromProfileHref(href) {
    try {
      const url = new URL(href, location.origin);
      if (url.origin !== location.origin) return null;
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length !== 1) return null;
      const handle = parts[0];
      if (/^(accounts|explore|p|reels?|stories|direct|followers|following)$/i.test(handle)) return null;
      return isHandleLike(handle) ? handle : null;
    } catch (_) {
      return null;
    }
  }

  function looksLikeLimitText(text) {
    return /intenta(?:r)?\s+m[aá]s\s+tarde|try\s+again\s+later|limitamos|we\s+limit|temporarily\s+blocked/i.test(text || '');
  }

  function findFollowingDialog() {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    for (const dialog of dialogs) {
      const text = cleanText(dialog.textContent).slice(0, 1200);
      const hasProfileLinks = dialog.querySelectorAll('a[href^="/"]').length >= 3;
      const titleLooksFollowing = Array.from(dialog.querySelectorAll('h1, h2, [role="heading"]'))
        .some((node) => /^(siguiendo|following)$/i.test(cleanText(node.textContent)));
      const urlLooksFollowing = /\/following\/?$/i.test(location.pathname);
      if (hasProfileLinks && (titleLooksFollowing || urlLooksFollowing)) return dialog;
    }
    return null;
  }

  function findScrollBox(dialog) {
    const nodes = [dialog, ...Array.from(dialog.querySelectorAll('div'))];
    let best = null;
    for (const node of nodes) {
      const overflowY = getComputedStyle(node).overflowY;
      const scrollable = node.scrollHeight > node.clientHeight + 80;
      if (!scrollable || !/(auto|scroll)/i.test(overflowY)) continue;
      if (!best || node.scrollHeight > best.scrollHeight) best = node;
    }
    return best || dialog;
  }

  function nameFromFollowingRow(anchor, handle) {
    let row = anchor.parentElement || anchor;
    for (let hops = 0, node = anchor.parentElement; node && hops < 6; hops += 1, node = node.parentElement) {
      const text = cleanText(node.textContent);
      if (node.querySelector(`a[href="/${handle}/"]`) && text.length > handle.length && text.length < 260) {
        row = node;
      }
    }
    const texts = [];
    const nodes = row.querySelectorAll('span, div[dir="auto"], span[dir="auto"]');
    for (const node of nodes) {
      const text = cleanText(node.textContent);
      if (!text || text.length > 90 || texts.includes(text)) continue;
      texts.push(text);
    }
    for (const text of texts) {
      const name = distinctDisplayName(text, handle);
      if (name && !isHandleLike(name)) return name;
    }
    return undefined;
  }

  function collectFollowingVisible(dialog) {
    const out = [];
    const anchors = dialog.querySelectorAll('a[href^="/"]');
    for (const anchor of anchors) {
      const handle = handleFromProfileHref(anchor.getAttribute('href'));
      if (!handle || followingSeen.has(handle)) continue;
      followingSeen.add(handle);
      const item = { handle };
      const name = nameFromFollowingRow(anchor, handle);
      if (name) item.name = name;
      out.push(item);
    }
    return out;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function runFollowingCapture(dialog) {
    const scrollBox = findScrollBox(dialog);
    let stableRounds = 0;
    let lastSeenCount = followingSeen.size;
    let lastScrollTop = -1;

    for (let round = 0; round < 120; round += 1) {
      if (!document.documentElement.contains(dialog)) break;
      const text = cleanText(dialog.textContent);
      if (looksLikeLimitText(text)) {
        followingStopped = true;
        break;
      }

      const batch = collectFollowingVisible(dialog);
      for (let i = 0; i < batch.length; i += 500) emitFollowing(batch.slice(i, i + 500));

      const seenCount = followingSeen.size;
      if (seenCount === lastSeenCount && scrollBox.scrollTop === lastScrollTop) stableRounds += 1;
      else stableRounds = 0;
      if (stableRounds >= 4) break;

      lastSeenCount = seenCount;
      lastScrollTop = scrollBox.scrollTop;
      const step = Math.max(260, Math.min(700, Math.floor(scrollBox.clientHeight * 0.75)));
      scrollBox.scrollTop = Math.min(scrollBox.scrollTop + step, scrollBox.scrollHeight);
      await sleep(1050 + Math.floor(Math.random() * 350));
    }
  }

  function scheduleFollowingScan() {
    if (followingStopped || followingTimer || followingRun) return;
    followingTimer = setTimeout(() => {
      followingTimer = null;
      const dialog = findFollowingDialog();
      if (!dialog) return;
      followingRun = runFollowingCapture(dialog).catch(() => {}).finally(() => { followingRun = null; });
    }, 1800);
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

  try {
    scheduleDomScan();
    const mo = new MutationObserver(scheduleDomScan);
    mo.observe(document.documentElement || document, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label'] });
    setTimeout(scheduleDomScan, 4000);
    setTimeout(scheduleDomScan, 10000);
  } catch (_) {}

  try {
    scheduleFollowingScan();
    const followingMo = new MutationObserver(scheduleFollowingScan);
    followingMo.observe(document.documentElement || document, { childList: true, subtree: true });
    setTimeout(scheduleFollowingScan, 4000);
  } catch (_) {}

  try { console.debug('[SIR Reader] instagram reader activo (pasivo)'); } catch (_) {}
})();
