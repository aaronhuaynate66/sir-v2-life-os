// SIR V2 — Hook de Claude Code que reporta el estado EN VIVO de la sesión.
//
// POR QUÉ: el bot de dev (@sir_aaron_dev_bot) solo veía GitHub (lo ya pusheado).
// Mientras Claude Code trabaja LOCAL, Aaron no veía nada. Este hook empuja el
// progreso a prod (POST /api/dev/session) para que el bot lo cuente en tiempo real.
//
// SE REGISTRA en .claude/settings.json en estos eventos de Claude Code:
//   - SessionStart  -> "arrancó una sesión"
//   - PostToolUse   -> heartbeat (con throttle ~45s): última herramienta usada
//   - Stop          -> "terminó el turno" + resumen (última respuesta del asistente)
//
// CONFIG (local, no se commitea): lee DEV_SESSION_SECRET de process.env o de
// .env.local del repo. DEV_SESSION_URL opcional (default = prod). El MISMO secret
// debe estar en Vercel. Sin secret => no-op silencioso.
//
// REGLAS DE HOOK: jamás lanza, jamás escribe a stdout (podría interpretarse como
// control), termina siempre con exit 0. Timeout corto para no trabar a Claude.

import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_URL = 'https://sir-v2-life-os.vercel.app'
const HEARTBEAT_MS = 45_000 // throttle de PostToolUse

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

/** Convierte una ruta msys/git-bash "/c/Users/…" a Windows "C:\\Users\\…". */
function fromMsys(p) {
  const m = /^\/([a-zA-Z])\/(.*)$/.exec(p || '')
  return m ? `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, '\\')}` : p
}

/** Lee una var del entorno o, si falta, de .env.local del repo. Busca en varios
 *  candidatos de directorio porque el cwd del hook puede venir en formato Windows
 *  o msys según cómo lo lance Claude Code. */
function envOrDotenv(name, cwd) {
  if (process.env[name]) return process.env[name]
  const candidates = [cwd, fromMsys(cwd), process.cwd()].filter(Boolean)
  for (const dir of candidates) {
    try {
      const p = join(dir, '.env.local')
      if (!existsSync(p)) continue
      for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (m && m[1] === name) return m[2].replace(/^["']|["']$/g, '').trim()
      }
      return undefined // encontró el archivo pero no la var
    } catch {
      /* siguiente candidato */
    }
  }
  return undefined
}

function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

/** Resumen compacto de git status --porcelain (conteo + primeras líneas). */
function changedFilesSummary(cwd) {
  const raw = git(['status', '--porcelain'], cwd)
  if (!raw) return ''
  const lines = raw.split(/\r?\n/).filter(Boolean)
  const head = lines.slice(0, 15).join('\n')
  return lines.length > 15 ? `${head}\n… (+${lines.length - 15} más, ${lines.length} en total)` : head
}

/** Última respuesta de texto del asistente en el transcript JSONL. */
function lastAssistantText(transcriptPath) {
  try {
    if (!transcriptPath) return ''
    const path = existsSync(transcriptPath)
      ? transcriptPath
      : existsSync(fromMsys(transcriptPath))
        ? fromMsys(transcriptPath)
        : null
    if (!path) return ''
    const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean)
    for (let i = lines.length - 1; i >= 0; i--) {
      let ev
      try {
        ev = JSON.parse(lines[i])
      } catch {
        continue
      }
      if (ev?.type !== 'assistant') continue
      const content = ev?.message?.content
      if (!Array.isArray(content)) continue
      const text = content
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n')
        .trim()
      if (text) return text.slice(-1500)
    }
  } catch {
    /* no-op */
  }
  return ''
}

/** Throttle por sesión usando un archivo en tmp: true si toca postear. */
function shouldHeartbeat(sessionId) {
  try {
    const f = join(tmpdir(), `sir-dev-hb-${(sessionId || 'x').replace(/[^a-z0-9]/gi, '')}.txt`)
    const now = Date.now()
    if (existsSync(f)) {
      const last = Number(readFileSync(f, 'utf8').trim())
      if (Number.isFinite(last) && now - last < HEARTBEAT_MS) return false
    }
    // Marca ahora (import dinámico para no fallar si algo raro).
    import('node:fs').then((fs) => {
      try {
        fs.writeFileSync(f, String(now))
      } catch {
        /* no-op */
      }
    })
    return true
  } catch {
    return true
  }
}

async function post(url, secret, payload) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 5000)
  try {
    await fetch(`${url.replace(/\/$/, '')}/api/dev/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dev-session-secret': secret },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch {
    /* fail-open: si no hay red o prod está caído, ni modo */
  } finally {
    clearTimeout(t)
  }
}

async function main() {
  const input = readStdin()
  let hook = {}
  try {
    hook = JSON.parse(input)
  } catch {
    return
  }

  const event = hook.hook_event_name || 'progress'
  const rawCwd = hook.cwd || process.cwd()
  // Normaliza el cwd (puede venir msys "/c/…"); cae a process.cwd() si nada existe.
  const cwd = existsSync(rawCwd)
    ? rawCwd
    : existsSync(fromMsys(rawCwd))
      ? fromMsys(rawCwd)
      : process.cwd()
  const sessionId = hook.session_id || 'local'

  const secret = envOrDotenv('DEV_SESSION_SECRET', cwd)
  if (!secret) return // sin config => no-op silencioso
  const baseUrl = envOrDotenv('DEV_SESSION_URL', cwd) || DEFAULT_URL

  // PostToolUse: heartbeat con throttle para no martillar Supabase.
  if (event === 'PostToolUse') {
    if (!shouldHeartbeat(sessionId)) return
  }

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  const lastCommit = git(['log', '-1', '--oneline'], cwd)
  const changedFiles = changedFilesSummary(cwd)

  const payload = {
    sessionId,
    cwd,
    branch: branch || null,
    lastCommit: lastCommit || null,
    changedFiles: changedFiles || null,
  }

  if (event === 'SessionStart') {
    payload.event = 'start'
    payload.activity = 'Sesión iniciada'
  } else if (event === 'Stop' || event === 'SubagentStop') {
    payload.event = 'stop'
    payload.summary = lastAssistantText(hook.transcript_path)
    payload.activity = 'Turno terminado'
  } else {
    payload.event = 'progress'
    const tool = hook.tool_name ? String(hook.tool_name) : 'trabajando'
    payload.activity = `${tool}${hook.tool_input?.file_path ? ` · ${String(hook.tool_input.file_path).split(/[/\\]/).pop()}` : ''}`
  }

  await post(baseUrl, secret, payload)
}

main().finally(() => process.exit(0))
