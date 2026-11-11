/**
 * Host helper: lets the containerised bridge open and close Windows apps.
 *
 * A container cannot see the desktop, so this tiny process runs on the host
 * (WSL) and does exactly three things, nothing more: open an allowlisted app,
 * open an http(s) link, close an allowlisted app. Every request needs the shared
 * secret; nothing else (no shell, no typing, no files) is exposed.
 *
 *   JARVIS_PC_SECRET   shared secret (required)
 *   JARVIS_PC_PORT     default 8788
 *   JARVIS_PC_BIND     default 127.0.0.1
 */
import http from 'node:http'
import { execFile } from 'node:child_process'
import { timingSafeEqual } from 'node:crypto'

const SECRET = process.env.JARVIS_PC_SECRET ?? ''
const PORT = Number(process.env.JARVIS_PC_PORT ?? 8788)
const BIND = process.env.JARVIS_PC_BIND ?? '127.0.0.1'
if (SECRET.length < 16) {
  console.error('[pc-helper] JARVIS_PC_SECRET must be set (16+ characters).')
  process.exit(1)
}

// name the user says -> [program to start, process name to stop]
const APPS = {
  chrome: ['chrome', 'chrome'],
  edge: ['msedge', 'msedge'],
  notepad: ['notepad', 'notepad'],
  bloknot: ['notepad', 'notepad'],
  calculator: ['calc', 'CalculatorApp'],
  kalkulyator: ['calc', 'CalculatorApp'],
  explorer: ['explorer', null],
  word: ['winword', 'WINWORD'],
  excel: ['excel', 'EXCEL'],
  powerpoint: ['powerpnt', 'POWERPNT'],
  telegram: ['telegram', 'Telegram'],
  spotify: ['spotify', 'Spotify'],
  vscode: ['code', 'Code'],
  paint: ['mspaint', 'mspaint'],
}

const ps = (script, target) =>
  new Promise((resolve, reject) =>
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      // The target travels in an environment variable, never inside the script
      // text, so nothing the model says can become code.
      { env: { ...process.env, JV_TARGET: target, WSLENV: 'JV_TARGET' }, timeout: 15000 },
      (err, out, errOut) => (err ? reject(new Error((errOut || err.message).trim().slice(0, 200))) : resolve(out)),
    ),
  )

const authed = (req) => {
  const got = Buffer.from(String(req.headers['x-jarvis-secret'] ?? ''))
  const want = Buffer.from(SECRET)
  return got.length === want.length && timingSafeEqual(got, want)
}

http
  .createServer(async (req, res) => {
    const reply = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json' })
      res.end(JSON.stringify(obj))
    }
    if (!authed(req)) return reply(403, { error: 'forbidden' })
    if (req.method !== 'POST') return reply(405, { error: 'POST only' })
    let body = ''
    for await (const c of req) {
      body += c
      if (body.length > 4096) return reply(413, { error: 'too large' })
    }
    let msg
    try {
      msg = JSON.parse(body)
    } catch {
      return reply(400, { error: 'bad json' })
    }
    try {
      if (req.url === '/open_app') {
        const app = APPS[String(msg.app ?? '').toLowerCase().trim()]
        if (!app) return reply(400, { error: 'unknown app', known: Object.keys(APPS) })
        await ps('Start-Process -FilePath $env:JV_TARGET', app[0])
        return reply(200, { ok: true })
      }
      if (req.url === '/open_url') {
        const url = new URL(String(msg.url ?? ''))
        if (!['http:', 'https:'].includes(url.protocol)) return reply(400, { error: 'http(s) only' })
        await ps('Start-Process -FilePath $env:JV_TARGET', url.href)
        return reply(200, { ok: true })
      }
      if (req.url === '/close_app') {
        const app = APPS[String(msg.app ?? '').toLowerCase().trim()]
        if (!app?.[1]) return reply(400, { error: 'cannot close that app' })
        await ps('Stop-Process -Name $env:JV_TARGET -ErrorAction Stop', app[1])
        return reply(200, { ok: true })
      }
      return reply(404, { error: 'not found' })
    } catch (e) {
      return reply(502, { error: e.message })
    }
  })
  .listen(PORT, BIND, () => console.log(`[pc-helper] listening on ${BIND}:${PORT}`))
