import { spawn } from 'node:child_process'
import { existsSync, readFileSync, watchFile, unwatchFile } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'

/** Where the canvas is served inside the DSH web app: `/design-studio/<session id>/`. */
export const CANVAS_PREFIX = '/design-studio'

const SERVICES = ['webServer', 'connection', 'sessions', 'workingDirectory']
const CANVAS_ADDRESS = /http:\/\/127\.0\.0\.1:(\d+)\//
const CANVAS_PAGE = /^\/(\?|$)/
const DRAFT_SANDBOX = 'sandbox allow-scripts'
const PASSED_HEADERS = ['content-type', 'cache-control', 'content-security-policy', 'x-content-type-options']
const IDLE_MS = 5 * 60_000

/**
 * Serves each session's design canvas under the DSH origin, behind the DSH login.
 * The canvas itself stays a loopback-only Bun process; this only forwards to it.
 */
export function serveCanvas(ctx, pluginRoot) {
  ctx.inject(SERVICES, (sub) => {
    sub.effect(() => {
      const canvases = new Canvases(join(pluginRoot, 'bin', 'design-studio'))
      const unregister = sub.webServer.register({
        kind: 'prefix',
        path: CANVAS_PREFIX,
        // A failure here must end this one response, not reach the host as an unhandled rejection.
        handler: (req, res) => respond(sub, canvases, req, res).catch(() => (res.headersSent ? res.destroy() : end(res, 500))),
      })
      return () => {
        unregister()
        canvases.stopAll()
      }
    }, 'design-studio: canvas route')
  })
}

async function respond(ctx, canvases, req, res) {
  const rejection = ctx.connection.requestRejection(req)
  if (rejection !== undefined) return end(res, rejection)
  if (req.method !== 'GET' && req.method !== 'HEAD') return end(res, 405, 'method not allowed', { allow: 'GET, HEAD' })

  const url = new URL(String(req.url), 'http://localhost')
  const match = /^\/design-studio\/([^/]+)(\/.*)$/.exec(url.pathname)
  if (match === null) return end(res, 404, 'not found')
  const session = ctx.sessions.get(sessionIdFrom(match[1]))
  if (session === undefined) return end(res, 404, 'unknown session')

  const base = join(ctx.workingDirectory.get(session), '.design')
  const id = sessionIdFrom(match[1])
  if (!/^[\w-]+$/.test(id)) return end(res, 404, 'invalid session')
  let root, brief
  const selection = join(base, 'sessions', id)
  try {
    brief = readFileSync(selection, 'utf8')
    if (brief === '@legacy') root = base
    else if (/^[a-z0-9][a-z0-9-]{0,79}$/.test(brief)) root = join(base, 'briefs', brief)
    else return end(res, 500, 'Invalid active design brief.')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const path = match[2]
  if (!root || !existsSync(join(root, 'drafts'))) {
    if (path !== '/') return end(res, 404, 'not found')
    return end(res, 200, emptyPage(root), { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  }

  let canvas
  try {
    canvas = await canvases.use(root)
  } catch (error) {
    return end(res, 502, `The design canvas did not start: ${error.message}`)
  }
  forward(canvas, path + url.search, req, res)
  if (path === '/events') {
    const changed = () => {
      let current
      try { current = readFileSync(selection, 'utf8') } catch { /* Missing or unreadable: recheck through the authenticated page. */ }
      if (current === brief || res.destroyed) return
      if (!res.headersSent) res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end('event: brief-changed\ndata: reload\n\n')
    }
    watchFile(selection, { persistent: false, interval: 500 }, changed)
    res.once('close', () => unwatchFile(selection, changed))
    changed()
  }
}

/** The session id from the address, or '' (no such session) when it is not valid percent-encoding. */
function sessionIdFrom(segment) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return ''
  }
}

function forward(canvas, path, req, res) {
  const authority = `127.0.0.1:${canvas.port}`
  const upstream = request(
    { host: '127.0.0.1', port: canvas.port, method: req.method, path, headers: { host: authority, accept: req.headers.accept ?? '*/*' } },
    (reply) => {
      const headers = {}
      for (const name of PASSED_HEADERS) if (reply.headers[name] !== undefined) headers[name] = reply.headers[name]
      // Drafts are scripted HTML and must never run with the DSH origin, so only the canvas page itself is left unsandboxed.
      if (!CANVAS_PAGE.test(path)) headers['content-security-policy'] = DRAFT_SANDBOX
      res.writeHead(reply.statusCode ?? 502, headers)
      reply.pipe(res)
    },
  )
  upstream.on('error', () => (res.headersSent ? res.destroy() : end(res, 502, 'The design canvas is not answering.')))
  res.on('close', () => {
    upstream.destroy()
    canvas.release()
  })
  upstream.end()
}

function end(res, status, body = '', headers = { 'content-type': 'text/plain; charset=utf-8' }) {
  res.writeHead(status, headers)
  res.end(body)
}

function emptyPage(root) {
  const where = (root ? join(root, 'drafts') : 'design-studio brief new <slug>').replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`)
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>Design Studio</title>
<body style="font:14px system-ui;margin:2rem;color:#555;color-scheme:light dark">
<p>No drafts yet. Ask for a design and they will show up here.</p><p><code>${where}</code></p>`
}

/** One `design-studio canvas` process per `.design` folder, stopped when nobody has it open. */
class Canvases {
  #cli
  #running = new Map()

  constructor(cli) {
    this.#cli = cli
  }

  async use(root) {
    const entry = this.#running.get(root) ?? this.#start(root)
    const port = await entry.port
    clearTimeout(entry.idle)
    entry.clients += 1
    return { port, release: () => this.#release(entry) }
  }

  stopAll() {
    for (const entry of this.#running.values()) {
      clearTimeout(entry.idle)
      entry.child.kill()
    }
    this.#running.clear()
  }

  #start(root) {
    const child = spawn('bun', [this.#cli, 'canvas', '--dir', root, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] })
    const forget = () => {
      if (this.#running.get(root) === entry) this.#running.delete(root)
    }
    const entry = { child, clients: 0, idle: undefined, port: undefined, forget }
    entry.port = new Promise((resolve, reject) => {
      let printed = ''
      let complaint = ''
      child.stdout.on('data', (chunk) => {
        printed += chunk
        const address = CANVAS_ADDRESS.exec(printed)
        if (address !== null) resolve(Number(address[1]))
      })
      child.stderr.on('data', (chunk) => (complaint += chunk))
      child.on('error', (error) => {
        forget()
        reject(error)
      })
      child.on('exit', (code) => {
        forget()
        reject(new Error(complaint.trim() || `it exited with code ${code}`))
      })
    })
    // A failed start is reported to the request that asked; this keeps it from also crashing the host.
    entry.port.catch(() => {})
    this.#running.set(root, entry)
    return entry
  }

  #release(entry) {
    entry.clients -= 1
    if (entry.clients > 0) return
    entry.idle = setTimeout(() => {
      // Forget it first, so a request arriving now starts a fresh canvas instead of reaching a dying one.
      entry.forget()
      entry.child.kill()
    }, IDLE_MS)
    entry.idle.unref()
  }
}
