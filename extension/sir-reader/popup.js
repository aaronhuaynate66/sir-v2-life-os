// SIR Reader — popup: configurar URL/token, prender/apagar plataformas, ver estado.

const $ = (id) => document.getElementById(id);

async function load() {
  const { sirUrl, token, enabled, status } = await chrome.storage.local.get(['sirUrl', 'token', 'enabled', 'status']);
  $('sirUrl').value = sirUrl || 'https://sir-v2-life-os.vercel.app';
  $('token').value = token || '';
  const en = enabled || {};
  $('t-teams').checked = en.teams !== false;
  $('t-whatsapp').checked = en.whatsapp !== false;
  renderStatus(status);
}

function renderStatus(status) {
  const el = $('status');
  if (!status) { el.textContent = 'Sin actividad todavía. Guardá tu token y abrí un chat.'; return; }
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
  const enabled = { teams: $('t-teams').checked, whatsapp: $('t-whatsapp').checked };
  await chrome.storage.local.set({ sirUrl, token, enabled });
  const btn = $('save');
  btn.textContent = 'Guardado ✓';
  setTimeout(() => { btn.textContent = 'Guardar'; }, 1400);
}

$('save').addEventListener('click', save);

// Refrescar estado en vivo mientras el popup está abierto.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.status) renderStatus(changes.status.newValue);
});

load();
