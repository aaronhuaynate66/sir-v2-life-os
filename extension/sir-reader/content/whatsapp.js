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
    // Título del chat abierto. SCOPEADO a #main (el panel de la conversación):
    // WhatsApp Web tiene varios <header> (lista de chats, conversación, y el
    // drawer "Detalles del perfil"). Sin scope, querySelector agarraba el del
    // panel de perfil → el hilo salía "Detalles del perfil" y no matcheaba a
    // nadie. El header de la conversación SIEMPRE vive dentro de #main.
    const header =
      document.querySelector('#main header [title], #main header span[dir="auto"][title]') ||
      document.querySelector('#main header span[dir="auto"]');
    const name = header ? (header.getAttribute('title') || text(header)) : '';
    // Guardas: sin #main abierto no hay conversación; y descartamos el label del
    // drawer por si algún layout lo colara.
    if (!name || /^detalles del perfil$/i.test(name)) return null;
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

  // Normaliza el timestamp crudo de WhatsApp Web ("10:32, 4/7/2026" o
  // "3:07 p. m., 4/7/2026") a ISO 8601. Formato español de Perú:
  // hora 24h ("H:MM"/"HH:MM") o 12h con "a. m."/"p. m."/"am"/"pm", y fecha
  // en orden día/mes/año (D/M/AAAA o D/M/AA). Si no se puede parsear con
  // confianza (formato raro, "hoy"/"ayer"/nombre de día, vacío) → null;
  // NUNCA devuelve un string no-ISO (el dedupe por hash del server protege).
  function waTsToIso(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    // Descarta referencias relativas o nombres de día (no fechables acá).
    if (/hoy|ayer|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo/i.test(s)) return null;

    // Separa hora y fecha por la última coma (la fecha no lleva coma).
    const idx = s.lastIndexOf(',');
    if (idx === -1) return null;
    const timePart = s.slice(0, idx).trim();
    const datePart = s.slice(idx + 1).trim();

    // Fecha: día/mes/año (NO mes/día). Año de 2 dígitos → 20AA.
    const dm = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!dm) return null;
    const day = parseInt(dm[1], 10);
    const month = parseInt(dm[2], 10);
    let year = parseInt(dm[3], 10);
    if (dm[3].length === 2) year += 2000;

    // Hora: "H:MM"/"HH:MM", con "a. m."/"p. m."/"am"/"pm" opcional.
    const tm = timePart.match(/^(\d{1,2}):(\d{2})(?:\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm))?$/i);
    if (!tm) return null;
    let hour = parseInt(tm[1], 10);
    const min = parseInt(tm[2], 10);
    const ampm = tm[3] ? tm[3].toLowerCase().replace(/[.\s]/g, '') : '';
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    // Valida rangos antes de construir la fecha.
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    if (hour > 23 || min > 59) return null;

    // Construye en UTC (consistente con el import del proyecto) → ISO 8601.
    return new Date(Date.UTC(year, month - 1, day, hour, min)).toISOString();
  }

  // Parsea "[10:32, 4/7/2026] Diana:" → {ts, author}. El ts sale ISO 8601 o null.
  function parsePrePlain(pre) {
    if (!pre) return { ts: null, author: '' };
    const m = pre.match(/^\[([^\]]+)\]\s*([^:]*):/);
    if (!m) return { ts: null, author: '' };
    return { ts: waTsToIso(m[1].trim()), author: (m[2] || '').trim() };
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
