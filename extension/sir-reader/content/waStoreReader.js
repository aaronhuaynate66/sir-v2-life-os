// SIR Reader — Lector de WhatsApp Web vía el Store interno (wa-js), MAIN world.
//
// Reemplaza el scraping del DOM por lectura del modelo ya DESCIFRADO en memoria
// (validado en F1). Corre en el contexto de la página (MAIN world), así que NO
// tiene acceso a chrome.* → manda los batches por window.postMessage a un puente
// en common.js (ISOLATED world), que reusa el transporte existente (sir-batch →
// background → /api/reader/ingest). READ-ONLY: nunca envía mensajes a WhatsApp.
//
//   F2: escucha mensajes nuevos en vivo (WPP.on('chat.new_message')).
//   F3: backfill del ÚLTIMO MES al arrancar (itera chats, lee historial reciente).
//   F4: al activarse, marca `data-sir-wajs="active"` en <html> → common.js apaga
//       el scraper DOM (evita duplicados; el DOM queda de fallback si wa-js no carga).
//
// Debug manual: window.__sirProbe()  ·  window.__sirBackfill()
(function () {
  const TAG = '[SIR waStore]';
  const log = (...a) => { try { console.log(TAG, ...a); } catch (_) {} };
  const warn = (...a) => { try { console.warn(TAG, ...a); } catch (_) {} };

  if (!window.WPP) {
    warn('window.WPP ausente → wa-js no cargó. El scraper DOM (fallback) sigue activo.');
    return;
  }
  // F4: avisar (por el DOM compartido) que wa-js maneja WhatsApp → DOM en standby.
  try { document.documentElement.dataset.sirWajs = 'active'; } catch (_) {}
  log('wa-js', WPP.version || '?', '→ modo Store activo (DOM scraper en standby).');

  const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
  const MAX_BATCH = 80;               // igual que common.js
  const BACKFILL_COUNT = 300;         // mensajes recientes a mirar por chat
  const CHAT_DELAY_MS = 900;          // ritmo humano entre chats

  const idStr = (id) => (id && (id._serialized || id.id || id)) || '';

  // Nombre para atribución. Usamos `wa:<nombre>` como threadId (igual que el
  // scraper DOM) para que el dedupe del server alinee ambas vías.
  function chatName(chat) {
    return (
      (chat && (chat.formattedTitle || chat.name)) ||
      (chat && chat.contact && (chat.contact.name || chat.contact.pushname || chat.contact.formattedName)) ||
      idStr(chat && chat.id) ||
      'desconocido'
    );
  }

  function toIso(t) {
    // wa-js `t` es unix en segundos. null si no hay.
    if (!t && t !== 0) return null;
    const ms = Number(t) * 1000;
    if (!Number.isFinite(ms) || ms <= 0) return null;
    try { return new Date(ms).toISOString(); } catch (_) { return null; }
  }

  // Nombre del remitente de un mensaje entrante (para grupos y 1:1).
  function senderName(m, fallbackChatName) {
    if (m.fromMe) return 'Aaron';
    const s = m.senderObj || m.sender;
    return (
      (s && (s.pushname || s.name || s.formattedName)) ||
      m.notifyName ||
      fallbackChatName ||
      'otro'
    );
  }

  // Mapea un mensaje del Store a {author, text, ts}. null si no es texto útil.
  function mapMsg(m, cName) {
    // Solo texto por ahora (media/voz fuera de alcance, como el pipeline actual).
    const body = (m.body != null ? String(m.body) : '').trim();
    if (!body) return null;
    return { author: senderName(m, cName), text: body, ts: toIso(m.t) };
  }

  function post(threadName, messages) {
    const clean = messages.filter(Boolean).filter((x) => x.text);
    if (!clean.length) return;
    for (let i = 0; i < clean.length; i += MAX_BATCH) {
      const chunk = clean.slice(i, i + MAX_BATCH);
      const batch = {
        platform: 'whatsapp',
        threadId: `wa:${threadName}`,
        threadName,
        messages: chunk,
      };
      try { window.postMessage({ __sirReader: true, batch }, '*'); } catch (e) { warn('postMessage falló', e && e.message); }
    }
    log(`→ ${threadName}: ${clean.length} msgs al puente`);
  }

  async function listChats() {
    try { return (await WPP.chat.list()) || []; }
    catch (e) { warn('WPP.chat.list falló:', e && e.message); return []; }
  }

  // F3 — backfill del último mes: por cada chat, últimos mensajes acotados a 30d.
  async function backfill() {
    const chats = await listChats();
    log(`backfill: ${chats.length} chats`);
    const cutoff = Date.now() - MONTH_MS;
    let total = 0;
    for (const chat of chats) {
      const cName = chatName(chat);
      let msgs = [];
      try { msgs = (await WPP.chat.getMessages(chat.id, { count: BACKFILL_COUNT })) || []; }
      catch (e) { warn(`getMessages ${cName} falló:`, e && e.message); continue; }
      const recent = msgs.filter((m) => (Number(m.t) * 1000) >= cutoff);
      const mapped = recent.map((m) => mapMsg(m, cName)).filter(Boolean);
      if (mapped.length) { post(cName, mapped); total += mapped.length; }
      await new Promise((r) => setTimeout(r, CHAT_DELAY_MS)); // ritmo humano
    }
    log(`backfill listo: ${total} msgs del último mes enviados al puente.`);
    return total;
  }

  // F2 — vivo: cada mensaje nuevo → puente.
  function subscribeLive() {
    try {
      WPP.on('chat.new_message', (msg) => {
        try {
          const cName = chatName(msg.chat || { id: msg.from });
          const mapped = mapMsg(msg, cName);
          if (mapped) post(cName, [mapped]);
        } catch (e) { warn('new_message handler:', e && e.message); }
      });
      log('suscrito a mensajes nuevos (vivo).');
    } catch (e) { warn('no pude suscribir new_message:', e && e.message); }
  }

  function start() {
    log('WhatsApp Web listo → backfill del último mes + live.');
    subscribeLive();
    backfill().catch((e) => warn('backfill error:', e && e.message));
  }

  // Debug manual
  window.__sirBackfill = backfill;
  window.__sirProbe = async () => {
    const chats = await listChats();
    log('probe: chats', chats.length, chats.slice(0, 8).map((c) => `${chatName(c)} [${idStr(c.id)}]`));
    if (chats[0]) {
      const m = await WPP.chat.getMessages(chats[0].id, { count: 3 }).catch(() => []);
      log('probe: sample', (m || []).map((x) => ({ from: senderName(x, chatName(chats[0])), body: (x.body || '').slice(0, 50) })));
    }
  };

  // Arranque cuando WhatsApp Web esté listo.
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
