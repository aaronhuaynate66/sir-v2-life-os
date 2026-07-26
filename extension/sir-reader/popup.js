// SIR Reader — popup: configurar URL/token, prender/apagar plataformas, ver estado.

const $ = (id) => document.getElementById(id);

async function load() {
  const { sirUrl, token, enabled, status } = await chrome.storage.local.get(['sirUrl', 'token', 'enabled', 'status']);
  $('sirUrl').value = sirUrl || 'https://sir-v2-life-os.vercel.app';
  $('token').value = token || '';
  const en = enabled || {};
  $('t-teams').checked = en.teams !== false;
  $('t-whatsapp').checked = en.whatsapp !== false;
  $('t-outlook').checked = en.outlook !== false;
  renderStatus(status);
}

function renderStatus(status) {
  const el = $('status');
  if (!status) { el.textContent = 'Sin actividad todavía. Guarda tu token y abre un chat.'; return; }
  const when = status.at ? new Date(status.at).toLocaleTimeString('es') : '—';
  let html = '';
  if (status.lastError) {
    html += `<span class="err">Error:</span> ${status.lastError}<br/>`;
  } else if (status.lastThread) {
    html += `<b>Último:</b> ${status.lastThread} <span class="k">(${status.lastPlatform || ''})</span><br/>`;
  }
  html += `<span class="k">Mensajes enviados:</span> ${status.sent || 0}<br/>`;
  html += `<span class="k">Actualizado:</span> ${when}`;
  el.innerHTML = html;
}

async function save() {
  const sirUrl = $('sirUrl').value.trim();
  const token = $('token').value.trim();
  const enabled = { teams: $('t-teams').checked, whatsapp: $('t-whatsapp').checked, outlook: $('t-outlook').checked };
  await chrome.storage.local.set({ sirUrl, token, enabled });
  const btn = $('save');
  btn.textContent = 'Guardado ✓';
  setTimeout(() => { btn.textContent = 'Guardar'; }, 1400);
}

$('save').addEventListener('click', save);

// Diagnóstico: pregunta al content script de la pestaña activa qué detecta.
$('diag').addEventListener('click', async () => {
  const out = $('diagOut');
  out.style.display = 'block';
  out.textContent = 'Probando…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) { out.textContent = 'No hay pestaña activa.'; return; }
    const rep = await chrome.tabs.sendMessage(tab.id, { type: 'sir-diagnose' });
    if (!rep) { out.textContent = 'La extensión no está corriendo en esta pestaña. Abre un chat de Teams/WhatsApp Web y reinténtalo.'; return; }
    const lines = [
      `plataforma: ${rep.platform}`,
      `hilo: ${rep.threadName || '(no detectado)'}`,
      `contenedor: ${rep.containerFound ? 'sí' : 'NO'}`,
      `mensajes extraídos (muestra): ${rep.sampleCount}`,
    ];
    if (rep.sample && rep.sample.length) lines.push('ej: ' + rep.sample.map((m) => `${m.author}: ${m.text}`).join(' | '));
    if (rep.error) lines.push('error: ' + rep.error);
    if (rep.hint) lines.push(rep.hint);
    if (!rep.containerFound && rep.containerHtml) lines.push('dom: ' + rep.containerHtml);
    if (rep.rowsHtml && rep.rowsHtml.length) {
      lines.push('--- HTML crudo de fila (copiar para ajustar selectores) ---');
      rep.rowsHtml.forEach((h, i) => lines.push(`[fila ${i + 1}] ${h}`));
    }
    lines.push(rep.ok ? '→ OK: detectando bien.' : '→ Copia TODO esto y pásalo para ajustar los selectores de autor/cuerpo.');
    out.textContent = lines.join('\n');
  } catch (e) {
    out.textContent = 'No se pudo diagnosticar (¿estás en una pestaña de Teams/WhatsApp Web?). ' + String(e).slice(0, 120);
  }
});

// Refrescar estado en vivo mientras el popup está abierto.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.status) renderStatus(changes.status.newValue);
});

load();
