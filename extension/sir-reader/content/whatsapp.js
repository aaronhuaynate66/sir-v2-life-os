// SIR Reader — adaptador WhatsApp Web (web.whatsapp.com).
//
// Extrae mensajes del hilo abierto de forma PASIVA. Usa el atributo
// `data-pre-plain-text` que WhatsApp pone en cada burbuja copiable — trae
// "[HH:MM, D/M/AAAA] Autor: " — la fuente más estable para autor + timestamp.
// Los selectores de WhatsApp cambian seguido: si deja de capturar, hay que
// ajustar acá (mirá la consola: [SIR Reader]).

(() => {
  function text(el) { return el ? (el.innerText || el.textContent || '').trim() : ''; }

  function getThread() {
    // Título del chat abierto (header).
    const header = document.querySelector('header [title], header span[dir="auto"][title]');
    const name = header ? (header.getAttribute('title') || text(header)) : '';
    if (!name) return null;
    return { threadId: `wa:${name}`, threadName: name };
  }

  function getContainer() {
    return (
      document.querySelector('[data-testid="conversation-panel-messages"]') ||
      document.querySelector('#main div.copyable-area [role="application"]') ||
      document.querySelector('#main [role="application"]') ||
      document.querySelector('#main')
    );
  }

  // Parsea "[10:32, 4/7/2026] Diana:" → {ts, author}
  function parsePrePlain(pre) {
    if (!pre) return { ts: null, author: '' };
    const m = pre.match(/^\[([^\]]+)\]\s*([^:]*):/);
    if (!m) return { ts: null, author: '' };
    return { ts: m[1].trim(), author: (m[2] || '').trim() };
  }

  function extractMessages(container) {
    const out = [];
    // Cada mensaje entrante/saliente tiene .message-in / .message-out.
    const rows = container.querySelectorAll('.message-in, .message-out');
    rows.forEach((row) => {
      const copyable = row.querySelector('.copyable-text');
      const pre = copyable ? copyable.getAttribute('data-pre-plain-text') : '';
      const { ts, author } = parsePrePlain(pre);
      // Texto del mensaje.
      const body =
        row.querySelector('span.selectable-text.copyable-text') ||
        row.querySelector('span.selectable-text') ||
        row.querySelector('.copyable-text span');
      const t = text(body);
      if (!t) return;
      const isOut = row.classList.contains('message-out');
      out.push({ author: isOut ? 'Aaron' : (author || 'otro'), text: t, ts: ts || null });
    });
    return out;
  }

  window.__SIR_ADAPTER = { platform: 'whatsapp', getThread, getContainer, extractMessages };
  if (window.__SIR_CORE_BOOT) window.__SIR_CORE_BOOT();
})();
