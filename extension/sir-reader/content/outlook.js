// SIR Reader — adaptador Outlook Web / OWA (outlook.office.com, outlook.office365.com).
//
// Lee, PASIVO, tu correo de trabajo cuando NO hay acceso admin a Azure/Graph:
// scrapea los correos VISIBLES de la lista (remitente, asunto, fecha, preview) +
// el cuerpo del correo abierto en el panel de lectura. Solo lo que ya se ve; sin
// auto-scroll ni requests de fondo. Postea a /api/email/ingest (vía background),
// que normaliza y reusa TODO el backend de correo del SIR.
//
// NO usa el núcleo de chat (common.js CORE) porque el correo no es "un hilo": es
// una lista de correos sueltos + un panel de lectura. Corre su propio scanner
// liviano y manda { messages: [...] }. El DOM de OWA cambia seguido → parseo
// DEFENSIVO con fallbacks; nunca tira (mirá la consola: [SIR Reader]).
//
// Diagnóstico: expone window.__SIR_EMAIL.diagnose() y common.js lo delega cuando
// el popup pide 'sir-diagnose' en una pestaña de OWA.

(() => {
  const PLATFORM = 'outlook'
  const FLUSH_MS = 4000
  const MAX_BATCH = 120

  const STATE = {
    started: false,
    seen: new Set(),      // dedupKey en memoria (por sesión de página)
    pending: [],          // correos scrapeados sin enviar
    flushTimer: null,
    observer: null,
    scanTimer: null,
  }

  function log(...a) { try { console.debug('[SIR Reader]', ...a) } catch (_) {} }
  function text(el) { return el ? (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : '' }
  function attr(el, name) { try { return el ? (el.getAttribute(name) || '') : '' } catch (_) { return '' } }

  async function isEnabled() {
    try {
      const { enabled } = await chrome.storage.local.get('enabled')
      return !enabled || enabled.outlook !== false // default ON salvo apagado explícito
    } catch (_) { return true }
  }

  const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
  function firstEmail(s) { const m = (s || '').match(EMAIL_RE); return m ? m[0] : '' }

  // Llave de dedup en memoria — alineada en espíritu con emailDedupKey del server
  // (messageId si hay; si no from|subject|receivedAt). Solo evita re-mandar lo
  // mismo dentro de la misma sesión de página; el server dedup es la verdad.
  function keyOf(e) {
    if (e.messageId) return 'mid:' + e.messageId
    const basis = [(e.fromEmail || e.from || '').toLowerCase(), (e.subject || '').toLowerCase(), (e.receivedAt || '').toLowerCase()].join('|')
    let h = 5381
    for (let i = 0; i < basis.length; i++) h = ((h << 5) + h + basis.charCodeAt(i)) >>> 0
    return 'h:' + (h >>> 0).toString(16)
  }

  // ─── Lista de correos (bandeja) ───────────────────────────────────────────
  // OWA usa una lista virtualizada; los renglones visibles suelen ser
  // role="option" dentro de un role="listbox"/role="list". Cada renglón trae
  // remitente, asunto, preview y fecha. Los selectores cambian → varios fallbacks
  // + heurística por líneas de texto como último recurso.
  function listRows() {
    const sel = [
      'div[role="listbox"] div[role="option"]',
      'div[role="list"] div[role="listitem"]',
      'div[aria-label] div[role="option"]',
      'div[role="option"]',
      'div[data-convid]',
    ]
    for (const s of sel) {
      const rows = document.querySelectorAll(s)
      if (rows && rows.length) return Array.from(rows)
    }
    return []
  }

  function parseListRow(row) {
    const messageId = attr(row, 'data-convid') || attr(row, 'data-item-id') || attr(row, 'id') || ''
    // Sub-elementos por hints conocidos de OWA (cambian; por eso el fallback).
    const senderEl =
      row.querySelector('[data-testid="SenderName"]') ||
      row.querySelector('span[title]:not([title=""])') ||
      row.querySelector('[class*="sender" i] span, [class*="from" i] span')
    const subjectEl =
      row.querySelector('[data-testid="MessageSubject"]') ||
      row.querySelector('[role="heading"]') ||
      row.querySelector('span[title][class*="subject" i]')
    const previewEl =
      row.querySelector('[data-testid="MessagePreviewText"]') ||
      row.querySelector('[class*="preview" i]')
    const timeEl =
      row.querySelector('time') ||
      row.querySelector('[data-testid="SentReceivedTime"]') ||
      row.querySelector('span[class*="time" i], span[class*="date" i]')

    let from = text(senderEl) || attr(senderEl, 'title')
    let subject = text(subjectEl) || attr(subjectEl, 'title')
    let snippet = text(previewEl)
    let receivedAt = (timeEl && (attr(timeEl, 'datetime') || attr(timeEl, 'title'))) || text(timeEl)

    // Fallback total: partir el texto/aria del renglón en líneas.
    if (!from || !subject) {
      const lines = (text(row) || attr(row, 'aria-label')).split(/\s{2,}|\n|,\s/).map((x) => x.trim()).filter(Boolean)
      if (!from && lines[0]) from = lines[0]
      if (!subject && lines[1]) subject = lines[1]
      if (!snippet && lines[2]) snippet = lines[2]
    }
    const fromEmail = firstEmail(attr(senderEl, 'title') || attr(row, 'aria-label') || from)

    if (!from && !subject && !snippet) return null
    return { from, fromEmail, subject, receivedAt: receivedAt || '', snippet, body: '', messageId }
  }

  // ─── Panel de lectura (correo abierto) ────────────────────────────────────
  function readingPane() {
    return (
      document.querySelector('[role="main"] [aria-label="Message body"]') ||
      document.querySelector('[aria-label="Message body"]') ||
      document.querySelector('[aria-label="Cuerpo del mensaje"]') ||
      document.querySelector('div[role="document"]') ||
      null
    )
  }

  function parseOpenEmail() {
    const bodyEl = readingPane()
    if (!bodyEl) return null
    const main = document.querySelector('[role="main"]') || document
    const subjectEl =
      main.querySelector('[role="heading"][aria-level="2"]') ||
      main.querySelector('[data-testid="ReadingPaneSubject"]') ||
      main.querySelector('[role="heading"]')
    // El chip del remitente suele tener el email en title/aria.
    const senderEl =
      main.querySelector('[data-testid="SenderPersona"] span[title]') ||
      main.querySelector('button[aria-label*="@"]') ||
      main.querySelector('span[title*="@"]') ||
      main.querySelector('[class*="sender" i] span[title]')
    const timeEl = main.querySelector('[data-testid="SentReceivedSavedTime"]') || main.querySelector('time')

    const senderTitle = attr(senderEl, 'title') || attr(senderEl, 'aria-label') || text(senderEl)
    const fromEmail = firstEmail(senderTitle)
    const from = text(senderEl) || (senderTitle || '').replace(EMAIL_RE, '').replace(/[<>]/g, '').trim() || fromEmail
    const subject = text(subjectEl)
    const receivedAt = (timeEl && (attr(timeEl, 'datetime') || attr(timeEl, 'title'))) || text(timeEl) || ''
    const body = text(bodyEl).slice(0, 8000)
    const messageId = attr(main.querySelector('[data-convid]'), 'data-convid') || ''

    if (!from && !fromEmail && !subject && !body) return null
    return { from, fromEmail, subject, receivedAt, snippet: '', body, messageId }
  }

  function collect() {
    const out = []
    try { for (const row of listRows()) { const e = parseListRow(row); if (e) out.push(e) } } catch (e) { log('list error', e) }
    try { const open = parseOpenEmail(); if (open) out.push(open) } catch (e) { log('open error', e) }
    return out
  }

  function scan() {
    let emails
    try { emails = collect() } catch (e) { log('collect error', e); return }
    let added = 0
    for (const e of emails) {
      const k = keyOf(e)
      if (STATE.seen.has(k)) continue
      STATE.seen.add(k)
      STATE.pending.push(e)
      if (STATE.pending.length > MAX_BATCH) STATE.pending.shift()
      added++
    }
    if (added) scheduleFlush()
  }

  function scheduleFlush() {
    if (STATE.flushTimer) return
    STATE.flushTimer = setTimeout(flush, FLUSH_MS)
  }

  async function flush() {
    STATE.flushTimer = null
    if (!STATE.pending.length) return
    const messages = STATE.pending.splice(0, STATE.pending.length)
    try {
      const res = await chrome.runtime.sendMessage({ type: 'sir-email-batch', messages })
      log('correo enviado', messages.length, res && res.ok ? 'ok' : res)
    } catch (e) {
      log('error enviando correo', e)
      // Best-effort: no reinyectamos para no crecer sin límite; el re-scrape
      // natural del inbox los vuelve a tomar.
    }
  }

  function attachObserver() {
    const scope = document.querySelector('[role="main"]') || document.body
    if (STATE.observer) STATE.observer.disconnect()
    STATE.observer = new MutationObserver(() => {
      if (STATE.scanTimer) clearTimeout(STATE.scanTimer)
      STATE.scanTimer = setTimeout(scan, 600)
    })
    STATE.observer.observe(scope, { childList: true, subtree: true })
    scan() // primera pasada de lo ya visible
    log('observando outlook', scope)
  }

  async function boot() {
    if (STATE.started) return
    if (!(await isEnabled())) { log('outlook apagado'); return }
    let tries = 0
    const iv = setInterval(() => {
      tries++
      if (listRows().length || readingPane()) {
        clearInterval(iv)
        STATE.started = true
        attachObserver()
      } else if (tries > 60) {
        clearInterval(iv)
        log('no encontré la lista de correos ni el panel de lectura (OWA) — puede que los selectores necesiten ajuste')
      }
    }, 1500)
  }

  // ─── Diagnóstico (lo invoca common.js ante 'sir-diagnose' en OWA) ──────────
  function shortHtml(el, max) {
    if (!el) return '(no encontrado)'
    const h = (el.outerHTML || '').replace(/\s+/g, ' ').trim()
    return h.length > max ? h.slice(0, max) + '…' : h
  }
  function diagnose() {
    const rows = listRows()
    const open = (() => { try { return parseOpenEmail() } catch (_) { return null } })()
    const sample = (() => { try { return collect().slice(0, 3) } catch (_) { return [] } })()
    let rowsHtml = null
    if (rows.length && sample.length === 0) rowsHtml = rows.slice(0, 2).map((el) => shortHtml(el, 600))
    return {
      ok: !!(sample.length),
      platform: PLATFORM,
      threadName: open ? (open.from || open.subject) : (rows.length ? `${rows.length} correos en la lista` : null),
      containerFound: !!(rows.length || readingPane()),
      containerHtml: shortHtml(document.querySelector('[role="main"]'), 220),
      sampleCount: sample.length,
      sample: sample.map((m) => ({ author: m.from || m.fromEmail, ts: m.receivedAt, text: (m.subject || m.snippet || m.body || '').slice(0, 80) })),
      rowsHtml,
      error: null,
      hint: `filas lista: ${rows.length} · panel abierto: ${open ? 'sí' : 'no'}`,
    }
  }

  window.__SIR_EMAIL = { platform: PLATFORM, diagnose }
  boot()
})()
