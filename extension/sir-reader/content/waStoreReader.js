// SIR Reader — Lector de WhatsApp Web vía el Store interno (wa-js), MAIN world.
//
// Reemplaza el scraping del DOM por lectura del modelo ya DESCIFRADO en memoria
// (validado en F1). Corre en el contexto de la página (MAIN world), así que NO
// tiene acceso a chrome.* → manda los batches por window.postMessage a un puente
// en common.js (ISOLATED world), que reusa el transporte existente (sir-batch →
// background → /api/reader/ingest). READ-ONLY: nunca envía mensajes a WhatsApp.
//
//   F2: escucha mensajes nuevos en vivo (WPP.on('chat.new_message')).
//   F3: backfill del ÚLTIMO MES al arrancar (SOLO chats con actividad en el último
//       mes, ordenados por recencia; espera a que el store cargue los chats).
//   F4: al activarse, marca `data-sir-wajs="active"` → common.js apaga el DOM.
//
// Debug manual: window.__sirBackfill()  ·  window.__sirProbe()
(function () {
  const TAG = '[SIR waStore]';
  const log = (...a) => { try { console.log(TAG, ...a); } catch (_) {} };
  const warn = (...a) => { try { console.warn(TAG, ...a); } catch (_) {} };

  if (!window.WPP) {
    warn('window.WPP ausente → wa-js no cargó. El scraper DOM (fallback) sigue activo.');
    return;
  }
  try { document.documentElement.dataset.sirWajs = 'active'; } catch (_) {}
  log('wa-js', WPP.version || '?', '→ modo Store activo (DOM scraper en standby).');

  const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
  const MAX_BATCH = 80;               // igual que common.js
  const BACKFILL_COUNT = 300;         // mensajes recientes a mirar por chat
  const CHAT_DELAY_MS = 400;          // pausa entre chats (getMessages lee el Store local)
  const MAX_CHATS = 300;              // backstop de seguridad (recencia ya acota al último mes)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const idStr = (id) => (id && (id._serialized || id.id || id)) || '';

  // Chats a ignorar: estados/historias y canales (no son conversaciones).
  function isSkippable(chat) {
    const id = idStr(chat && chat.id).toLowerCase();
    return !id || id.includes('status@broadcast') || id.endsWith('@newsletter') || id.includes('broadcast');
  }

  // Nombre para atribución. `wa:<nombre>` como threadId (igual que el scraper DOM)
  // para que el dedupe del server alinee ambas vías.
  function chatName(chat) {
    return (
      (chat && (chat.formattedTitle || chat.name)) ||
      (chat && chat.contact && (chat.contact.name || chat.contact.pushname || chat.contact.formattedName)) ||
      idStr(chat && chat.id) ||
      'desconocido'
    );
  }

  function toIso(t) {
    if (!t && t !== 0) return null;
    const ms = Number(t) * 1000;
    if (!Number.isFinite(ms) || ms <= 0) return null;
    try { return new Date(ms).toISOString(); } catch (_) { return null; }
  }

  function senderName(m, fallbackChatName) {
    if (m.fromMe) return 'Aaron';
    const s = m.senderObj || m.sender;
    return (
      (s && (s.pushname || s.name || s.formattedName)) ||
      m.notifyName || fallbackChatName || 'otro'
    );
  }

  function mapMsg(m, cName) {
    const body = (m.body != null ? String(m.body) : '').trim();
    if (!body) return null; // solo texto (media/voz fuera de alcance)
    return { author: senderName(m, cName), text: body, ts: toIso(m.t) };
  }

  function post(threadName, messages) {
    const clean = messages.filter(Boolean).filter((x) => x.text);
    if (!clean.length) return;
    for (let i = 0; i < clean.length; i += MAX_BATCH) {
      const chunk = clean.slice(i, i + MAX_BATCH);
      const batch = { platform: 'whatsapp', threadId: `wa:${threadName}`, threadName, messages: chunk };
      try { window.postMessage({ __sirReader: true, batch }, '*'); } catch (e) { warn('postMessage falló', e && e.message); }
    }
    log(`→ ${threadName}: ${clean.length} msgs al puente`);
  }

  async function listChats() {
    try { return (await WPP.chat.list()) || []; }
    catch (e) { warn('WPP.chat.list falló:', e && e.message); return []; }
  }

  // Espera a que el store cargue los chats (race: mainReady=true pero list()=0).
  async function waitForChats() {
    for (let i = 0; i < 25; i++) {
      const chats = await listChats();
      if (chats.length > 0) return chats;
      await sleep(2000);
    }
    return [];
  }

  // F3 — backfill del último mes: SOLO chats con actividad en el último mes,
  // ordenados por recencia (evita iterar los 1000+ chats históricos).
  async function backfill() {
    const all = await waitForChats();
    const cutoff = Date.now() - MONTH_MS;
    const activeAll = all
      .filter((c) => !isSkippable(c))
      .map((c) => ({ c, t: Number(c.t) || 0 }))
      .filter((x) => x.t * 1000 >= cutoff)     // solo activos en el último mes
      .sort((a, b) => b.t - a.t);               // más recientes primero
    const active = activeAll.slice(0, MAX_CHATS).map((x) => x.c);
    log(`backfill: ${all.length} totales · ${activeAll.length} activos en el último mes · procesando ${active.length}${activeAll.length > active.length ? ' (CAP — subir MAX_CHATS si querés todos)' : ''}`);
    if (!active.length && all.length) {
      warn('0 activos por recencia (¿chat.t vacío?). No fuerzo — revisá si falta data de fecha.');
    }
    let total = 0;
    for (const chat of active) {
      const cName = chatName(chat);
      let msgs = [];
      try { msgs = (await WPP.chat.getMessages(chat.id, { count: BACKFILL_COUNT })) || []; }
      catch (e) { warn(`getMessages ${cName} falló:`, e && e.message); continue; }
      const mapped = msgs
        .filter((m) => (Number(m.t) * 1000) >= cutoff)
        .map((m) => mapMsg(m, cName))
        .filter(Boolean);
      if (mapped.length) { post(cName, mapped); total += mapped.length; }
      await sleep(CHAT_DELAY_MS); // ritmo humano
    }
    log(`backfill listo: ${total} msgs del último mes (${active.length} chats) enviados al puente.`);
    return total;
  }

  // F2 — vivo.
  function subscribeLive() {
    try {
      WPP.on('chat.new_message', (msg) => {
        try {
          const chat = msg.chat || { id: msg.from };
          if (isSkippable(chat)) return;
          const cName = chatName(chat);
          const mapped = mapMsg(msg, cName);
          if (mapped) post(cName, [mapped]);
        } catch (e) { warn('new_message handler:', e && e.message); }
      });
      log('suscrito a mensajes nuevos (vivo).');
    } catch (e) { warn('no pude suscribir new_message:', e && e.message); }
  }

  function start() {
    log('WhatsApp Web listo → live + backfill del último mes.');
    subscribeLive();
    backfill().catch((e) => warn('backfill error:', e && e.message));
  }

  window.__sirBackfill = backfill;
  window.__sirProbe = async () => {
    const chats = await listChats();
    log('probe: chats', chats.length, chats.slice(0, 8).map((c) => `${chatName(c)} [${idStr(c.id)}] t=${c.t}`));
  };

  if (WPP.webpack && typeof WPP.webpack.onReady === 'function') {
    WPP.webpack.onReady(start);
  } else {
    let n = 0;
    const iv = setInterval(() => {
      const ready = WPP.isReady || (WPP.conn && WPP.conn.isMainReady && WPP.conn.isMainReady());
      if (ready) { clearInterval(iv); start(); }
      else if (++n > 120) { clearInterval(iv); warn('no llegó a ready; probá window.__sirBackfill().'); }
    }, 500);
  }
})();
