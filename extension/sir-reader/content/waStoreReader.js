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

  // El Store trae `m.t` como epoch en segundos = el INSTANTE UTC real. Pero el
  // sustrato (chat_messages.sent_at) guarda la HORA DE PARED DE LIMA codificada
  // con 'Z' — así están las 289k filas que vinieron de los exports, que parsean
  // la hora MOSTRADA en pantalla. Ver la convención completa en
  // src/lib/chat-messages/append.ts (limaWallClock).
  //
  // POR QUÉ IMPORTA (bug real, 29-jul-2026): sin este -5 h, el mismo mensaje
  // quedaba guardado dos veces con 5 horas de diferencia (el reader en 23:44:31,
  // el export en 18:44) y ningún hash podía cruzarlos, porque para la base eran
  // dos instantes distintos. Se duplicaron ~71k mensajes de Diana.
  //
  // Perú no usa horario de verano desde 1994 → el desfase es -05:00 SIEMPRE, así
  // que la constante es segura (no hace falta una tabla de zonas).
  var LIMA_OFFSET_MS = -5 * 3600 * 1000;

  function toIso(t) {
    if (!t && t !== 0) return null;
    const ms = Number(t) * 1000;
    if (!Number.isFinite(ms) || ms <= 0) return null;
    try { return new Date(ms + LIMA_OFFSET_MS).toISOString(); } catch (_) { return null; }
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
  /**
   * @param {{dias?:number, chat?:string}} [opts]
   *
   * PARAMETRIZADO (30-jul-2026). Antes esto era fijo en 30 días y corría UNA sola vez
   * por carga de página, y ese era el motivo real de que el historial viejo de un chat
   * no estuviera: no es que el lector falle, es que nunca se le pedía más. Aaron:
   * *"quiero tener actualizado el chat de Diana… y solo me quieres mandar a scrolear
   * despacio, eso no me sirve"*. Ahora la ventana y el chat entran por comando remoto
   * (ver `lib/reader/comandos.ts`), así que pedir "Diana, 400 días" es una fila en una
   * tabla y no un pedido de trabajo manual.
   */
  /**
   * Trae los mensajes de un chat, con CAMINO ALTERNATIVO.
   *
   * POR QUÉ EXISTE (diagnóstico en vivo, 30-jul-2026). Con wa-js 4.4.1 sobre la
   * versión actual de WhatsApp Web, `WPP.chat.list()` funciona perfecto (devolvió
   * 1123 chats, 196 activos) pero `WPP.chat.getMessages()` tira
   * `Cannot read properties of undefined (reading 'get')` en TODOS los chats —
   * WhatsApp movió una colección interna que esa versión de wa-js todavía busca. El
   * resultado era el peor posible: `backfill listo: 0 msgs (196 chats)`. Recorría
   * todo y no traía nada.
   *
   * El plan B no necesita esa API: los modelos de chat que devuelve `list()` YA
   * traen su colección de mensajes en memoria (`chat.msgs`), que es lo que WhatsApp
   * Web usa para pintar la conversación. Se lee de ahí.
   *
   * Devuelve `{msgs, via}` para que el diagnóstico pueda decir por qué camino salió
   * — sin eso, un cambio de API vuelve a fallar en silencio.
   */
  async function mensajesDe(chat, count) {
    // 1. La API oficial. Cuando el bundle de wa-js esté al día, este es el camino.
    try {
      const r = await WPP.chat.getMessages(chat.id, { count });
      if (Array.isArray(r) && r.length) return { msgs: r, via: 'getMessages' };
      if (Array.isArray(r)) return { msgs: r, via: 'getMessages' };
    } catch (_) { /* sigue al plan B */ }

    // 2. La colección del propio modelo de chat. Distintas versiones la exponen
    //    distinto, así que se prueban las formas conocidas en orden.
    try {
      const col = chat.msgs;
      if (col) {
        if (typeof col.getModelsArray === 'function') {
          const a = col.getModelsArray();
          if (Array.isArray(a)) return { msgs: a, via: 'chat.msgs.getModelsArray' };
        }
        if (Array.isArray(col._models)) return { msgs: col._models, via: 'chat.msgs._models' };
        if (Array.isArray(col.models)) return { msgs: col.models, via: 'chat.msgs.models' };
        if (typeof col.toArray === 'function') {
          const a = col.toArray();
          if (Array.isArray(a)) return { msgs: a, via: 'chat.msgs.toArray' };
        }
      }
    } catch (_) { /* */ }
    return { msgs: [], via: 'ninguno' };
  }

  /** Por qué camino se leyeron los mensajes en el último backfill (para el probe). */
  let ultimoVia = null;

  async function backfill(opts) {
    const dias = opts && Number(opts.dias) > 0 ? Number(opts.dias) : 30;
    const soloChat = opts && typeof opts.chat === 'string' && opts.chat.trim()
      ? opts.chat.trim().toLowerCase() : null;
    const all = await waitForChats();
    const cutoff = Date.now() - dias * 24 * 3600 * 1000;
    const activeAll = all
      .filter((c) => !isSkippable(c))
      // Con un chat pedido por nombre, la recencia NO filtra: el punto de pedirlo es
      // traer su historial viejo, que por definición no está en la ventana.
      .filter((c) => (soloChat ? String(chatName(c)).toLowerCase().includes(soloChat) : true))
      .map((c) => ({ c, t: Number(c.t) || 0 }))
      .filter((x) => (soloChat ? true : x.t * 1000 >= cutoff))
      .sort((a, b) => b.t - a.t);               // más recientes primero
    const active = activeAll.slice(0, MAX_CHATS).map((x) => x.c);
    log(`backfill(${dias}d${soloChat ? `, chat~"${soloChat}"` : ''}): ${all.length} totales · ${activeAll.length} candidatos · procesando ${active.length}${activeAll.length > active.length ? ' (CAP)' : ''}`);
    if (!active.length && all.length) {
      warn('0 activos por recencia (¿chat.t vacío?). No fuerzo — revisa si falta data de fecha.');
    }
    let total = 0;
    for (const chat of active) {
      const cName = chatName(chat);
      let msgs = [];
      try {
        const r = await mensajesDe(chat, BACKFILL_COUNT);
        msgs = r.msgs || [];
        if (r.via !== ultimoVia) { ultimoVia = r.via; log(`leyendo mensajes vía: ${r.via}`); }
      }
      catch (e) { warn(`getMessages ${cName} falló:`, e && e.message); continue; }
      const mapped = msgs
        .filter((m) => (Number(m.t) * 1000) >= cutoff)
        .map((m) => mapMsg(m, cName))
        .filter(Boolean);
      if (mapped.length) { post(cName, mapped); total += mapped.length; }
      await sleep(CHAT_DELAY_MS); // ritmo humano
    }
    log(`backfill listo: ${total} msgs de ${dias}d (${active.length} chats) enviados al puente.`);
    return { chats: active.length, mensajes: total, dias, chat: soloChat || null };
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

  /**
   * Diagnóstico ESTRUCTURADO del lector. Antes esto solo logueaba a consola, así que
   * para saber si el lector estaba vivo había que pedirle a alguien que abriera F12 en
   * la otra PC. Devolverlo como objeto es lo que permite que viaje en el latido y que
   * una caída se note el mismo día en vez de a los cuatro.
   */
  async function probe() {
    const out = { lib: typeof window.WPP, libVersion: null, ready: false, chats: null, error: null };
    try {
      out.libVersion = (WPP && WPP.version) ? String(WPP.version) : null;
      out.ready = !!(WPP.isReady || (WPP.conn && WPP.conn.isMainReady && WPP.conn.isMainReady()));
      const chats = await listChats();
      out.chats = chats.length;
      // POR QUÉ CAMINO SE LEEN LOS MENSAJES. Sin esto, el 30-jul el reader recorrió
      // 196 chats y mandó 0 mensajes durante días sin que nada lo dijera: `chat.list`
      // funcionaba y `getMessages` estaba roto, y desde afuera se veía sano. Este
      // campo es el que delata que la API se movió.
      if (chats.length) {
        const r = await mensajesDe(chats[0], 5);
        out.error = r.via === 'ninguno'
          ? 'no puedo leer mensajes por ningún camino conocido (¿wa-js desactualizado?)'
          : null;
        out.lee = r.via;
        out.leeCuantos = (r.msgs || []).length;
      }
    } catch (e) {
      out.error = (e && e.message ? e.message : String(e)).slice(0, 300);
    }
    return out;
  }
  window.__sirProbe = probe;

  // ── PUENTE ISOLATED → MAIN → ISOLATED ─────────────────────────────────────
  // El puente que ya existía iba en un solo sentido (batches MAIN→ISOLATED). Los
  // comandos necesitan respuesta, así que acá se escucha el pedido y se contesta con
  // el mismo `id` para que el otro lado pueda casarlos.
  window.addEventListener('message', async (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__sirCmd !== true || !d.id) return;
    let res;
    try {
      if (d.kind === 'probe') res = { ok: true, probe: await probe() };
      else if (d.kind === 'resync') res = { ok: true, ...(await backfill({ dias: d.dias, chat: d.chat })) };
      else res = { ok: false, error: `kind desconocido: ${d.kind}` };
    } catch (e) {
      res = { ok: false, error: (e && e.message ? e.message : String(e)).slice(0, 300) };
    }
    try { window.postMessage({ __sirCmdRes: true, id: d.id, res }, '*'); } catch (_) { /* */ }
  });

  if (WPP.webpack && typeof WPP.webpack.onReady === 'function') {
    WPP.webpack.onReady(start);
  } else {
    let n = 0;
    const iv = setInterval(() => {
      const ready = WPP.isReady || (WPP.conn && WPP.conn.isMainReady && WPP.conn.isMainReady());
      if (ready) { clearInterval(iv); start(); }
      else if (++n > 120) { clearInterval(iv); warn('no llegó a ready; prueba window.__sirBackfill().'); }
    }, 500);
  }
})();
