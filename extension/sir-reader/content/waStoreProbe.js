// SIR Reader — F1 SPIKE (de-risk). Corre en MAIN world (contexto de la página).
// Valida DOS cosas antes de construir el lector real:
//   1) que wa-js (vendor/wppconnect-wa.js) CARGA sin que el CSP de web.whatsapp.com
//      lo bloquee (si window.WPP existe → el approach MAIN-world funciona).
//   2) que se puede LEER el Store interno ya DESCIFRADO (mensajes reales), en vez
//      de scrapear el DOM frágil.
// SOLO LOGUEA a la consola. NO envía nada a SIR, no modifica nada. Read-only.
// Para re-probar a mano con un chat abierto: window.__sirProbe() en la consola.
(function () {
  const TAG = '[SIR waStoreProbe]';
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);

  if (!window.WPP) {
    warn('❌ window.WPP NO existe → wa-js NO cargó (posible bloqueo de CSP o MAIN world). F1 FALLA — reportar esto.');
    return;
  }
  log('✅ window.WPP presente. versión wa-js:', WPP.version || 'desconocida');

  async function probe() {
    try {
      log('estado: isReady=', WPP.isReady, ' mainReady=', WPP.conn && WPP.conn.isMainReady && WPP.conn.isMainReady());

      // 1) Listar algunos chats (prueba de acceso al Store).
      let chats = [];
      try { chats = await WPP.chat.list({ count: 8 }); }
      catch (e1) {
        try { chats = await WPP.chat.list(); }
        catch (e2) { warn('WPP.chat.list falló:', e2 && e2.message); }
      }
      const ids = (chats || []).map((c) => (c && c.id && (c.id._serialized || c.id)) || '?');
      log(`chats leídos: ${(chats || []).length}`, ids.slice(0, 8));

      // 2) Leer mensajes del primer chat (prueba de TEXTO ya descifrado).
      const first = (chats || [])[0];
      if (first) {
        const cid = first.id && (first.id._serialized || first.id);
        let msgs = [];
        try { msgs = await WPP.chat.getMessages(cid, { count: 3 }); }
        catch (e) { warn('WPP.chat.getMessages falló:', e && e.message); }
        log(`mensajes del chat ${cid}: ${(msgs || []).length}`,
          (msgs || []).map((m) => ({
            from: m.from && (m.from._serialized || m.from),
            body: (m.body || '').slice(0, 60),
            t: m.t,
          })));
        log((msgs && msgs.length)
          ? '✅✅ LEE TEXTO DESCIFRADO DEL STORE → F1 OK, el approach funciona.'
          : '⚠️ listó el chat pero 0 mensajes (¿chat vacío?). Abrí un chat con mensajes y corré window.__sirProbe().');
      } else {
        warn('no se listaron chats — asegurate de estar logueado en WhatsApp Web y reintentá window.__sirProbe().');
      }
    } catch (e) {
      warn('probe error:', e && e.message);
    }
  }

  window.__sirProbe = probe;

  // Auto-run cuando WhatsApp Web termine de inicializar.
  if (WPP.webpack && typeof WPP.webpack.onReady === 'function') {
    WPP.webpack.onReady(() => { log('WhatsApp Web ready → corriendo probe…'); probe(); });
  } else {
    let n = 0;
    const iv = setInterval(() => {
      const ready = WPP.isReady || (WPP.conn && WPP.conn.isMainReady && WPP.conn.isMainReady());
      if (ready) { clearInterval(iv); log('ready (poll) → corriendo probe…'); probe(); }
      else if (++n > 60) { clearInterval(iv); warn('no llegó a ready en ~30s; probá window.__sirProbe() a mano con un chat abierto.'); }
    }, 500);
  }
})();
