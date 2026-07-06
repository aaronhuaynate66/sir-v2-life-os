// SIR Reader — adaptador Microsoft Teams (teams.microsoft.com).
//
// Lee, pasivo, los mensajes del chat abierto. Teams usa componentes Fluent UI con
// atributos `data-tid`; los selectores acá cubren las variantes conocidas con
// fallbacks. Si Teams cambia el DOM y deja de capturar, se ajusta acá (consola:
// [SIR Reader]). Alternativa más robusta a futuro: leer vía la Chat Service API
// reusando el token de sesión (Fase 1b) — este adaptador es la versión pasiva-DOM.

(() => {
  function text(el) { return el ? (el.innerText || el.textContent || '').trim() : ''; }

  function getThread() {
    // Título del chat/canal abierto. `chat-title` es el vigente en
    // teams.cloud.microsoft (2026); el resto son fallbacks de versiones previas.
    const h =
      document.querySelector('[data-tid="chat-title"]') ||
      document.querySelector('[data-tid="chat-header-title"]') ||
      document.querySelector('[data-tid="threadHeaderTitle"]') ||
      document.querySelector('[data-tid="chatListHeaderTitle"]') ||
      document.querySelector('main [role="heading"]');
    const name = text(h);
    if (!name) return null;
    return { threadId: `teams:${name}`, threadName: name };
  }

  function getContainer() {
    return (
      document.querySelector('[data-tid="message-pane-list-runway"]') ||
      document.querySelector('[data-tid="messagePaneList"]') ||
      document.querySelector('[role="log"]') ||
      document.querySelector('[data-tid="chat-pane-list"]') ||
      document.querySelector('main [role="main"]')
    );
  }

  // id estable del mensaje (data-mid, o el número dentro de id="message-body-<n>"
  // / id="content-<n>"). Sirve para deduplicar el par padre/hijo del mismo mensaje.
  function messageId(row) {
    const el =
      (row.matches && row.matches('[data-mid]') ? row : null) ||
      row.querySelector('[data-mid]') ||
      row.querySelector('[id^="message-body-"]') ||
      row.querySelector('[id^="content-"]');
    if (!el) return null;
    const mid = el.getAttribute && el.getAttribute('data-mid');
    if (mid) return mid;
    const m = (el.id || '').match(/\d{5,}/);
    return m ? m[0] : null;
  }

  function extractMessages(container) {
    // UNIÓN de selectores (mensajes propios y ajenos pueden usar distinta
    // estructura: los ajenos vienen en `.fui-ChatMessage` con autor; los propios
    // NO tienen ese wrapper y solo matchean por `[data-tid="chat-pane-message"]` /
    // `[role="listitem"]`). Para no duplicar (el padre `.fui-ChatMessage` y su hijo
    // `[data-tid="chat-pane-message"]` son el MISMO mensaje) deduplicamos por el id
    // estable del mensaje, quedándonos con la variante más rica (con autor + hora).
    const rows = container.querySelectorAll(
      '[data-tid="chat-pane-message"], .fui-ChatMessage, [data-tid="messageBodyContainer"], [role="listitem"]'
    );
    const byId = new Map();
    rows.forEach((row) => {
      const bodyEl =
        row.querySelector('[id^="content-"]') ||
        row.querySelector('[data-tid="messageBodyContent"]') ||
        row.querySelector('[data-tid="message-body"]') ||
        row.querySelector('.fui-ChatMessage__body') ||
        row.querySelector('div[dir="auto"]');
      const t = text(bodyEl);
      if (!t) return;
      const authorEl =
        row.querySelector('[data-tid="message-author-name"]') ||
        row.querySelector('[data-tid="messageAuthorName"]') ||
        row.querySelector('[data-tid="messageSenderDisplayName"]') ||
        row.querySelector('[data-tid="author-name"]') ||
        row.querySelector('.fui-ChatMessage__author');
      const timeEl = row.querySelector('time') || row.querySelector('[data-tid="messageTimeStamp"]');
      const author = text(authorEl);
      const ts = timeEl ? (timeEl.getAttribute('datetime') || text(timeEl) || null) : null;
      const key = messageId(row) || t; // sin id → clave por texto (peor caso)
      const prev = byId.get(key);
      // Conservar la variante con más info (el padre trae autor/hora; el hijo no).
      byId.set(key, {
        author: (prev && prev.author) || author,
        text: (prev && prev.text) || t,
        ts: (prev && prev.ts) || ts,
      });
    });
    // Sin autor visible = mensaje propio (Teams no rotula los tuyos) → 'yo'.
    return [...byId.values()].map((m) => ({ author: m.author || 'yo', text: m.text, ts: m.ts }));
  }

  window.__SIR_ADAPTER = { platform: 'teams', getThread, getContainer, extractMessages };
  if (window.__SIR_CORE_BOOT) window.__SIR_CORE_BOOT();
})();
