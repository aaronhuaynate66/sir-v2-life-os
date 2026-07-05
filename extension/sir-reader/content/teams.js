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

  function extractMessages(container) {
    const out = [];
    const rows = container.querySelectorAll(
      '[data-tid="chat-pane-message"], .fui-ChatMessage, [data-tid="messageBodyContainer"], [role="listitem"]'
    );
    rows.forEach((row) => {
      const authorEl =
        row.querySelector('[data-tid="message-author-name"]') ||
        row.querySelector('[data-tid="messageAuthorName"]') ||
        row.querySelector('[data-tid="messageSenderDisplayName"]') ||
        row.querySelector('[data-tid="author-name"]') ||
        row.querySelector('.fui-ChatMessage__author');
      const bodyEl =
        row.querySelector('[data-tid="messageBodyContent"]') ||
        row.querySelector('[data-tid="message-body"]') ||
        row.querySelector('.fui-ChatMessage__body') ||
        row.querySelector('[id^="content-"]') ||
        row.querySelector('div[dir="auto"]');
      const timeEl = row.querySelector('time') || row.querySelector('[data-tid="messageTimeStamp"]');
      const t = text(bodyEl);
      if (!t) return;
      const author = text(authorEl) || 'otro';
      const ts = timeEl ? (timeEl.getAttribute('datetime') || text(timeEl) || null) : null;
      out.push({ author, text: t, ts });
    });
    return out;
  }

  window.__SIR_ADAPTER = { platform: 'teams', getThread, getContainer, extractMessages };
  if (window.__SIR_CORE_BOOT) window.__SIR_CORE_BOOT();
})();
