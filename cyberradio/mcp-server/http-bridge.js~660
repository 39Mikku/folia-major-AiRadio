// HTTP + WS bridge: 给 PWA 提供页面 / 静态资源 / 实时通道
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { WebSocketServer } from 'ws'
import { PATHS, getConfig } from './config.js'
import { state, snapshot } from './state.js'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3':  'audio/mpeg',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webmanifest': 'application/manifest+json'
}

let httpServer = null
let wss = null
let startPromise = null
const clients = new Set()

export function broadcast(msg) {
  const data = JSON.stringify(msg)
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(data)
  }
}

// 单向事件订阅 (PWA → server). 返回取消订阅函数.
const handlers = {}
export function onPwaEvent(type, fn) {
  const arr = (handlers[type] ||= [])
  arr.push(fn)
  return () => {
    const i = arr.indexOf(fn)
    if (i >= 0) arr.splice(i, 1)
  }
}

export async function startBridge({ port: requestedPort } = {}) {
  if (httpServer?.listening) return bridgeAddress(httpServer)
  if (startPromise) return startPromise

  startPromise = (async () => {
    const rawPort = requestedPort ?? process.env.PWA_PORT ?? getConfig().pwa?.port ?? 5050
    const port = Number(rawPort)
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error(`invalid PWA port: ${rawPort}`)
    }

    const server = http.createServer((req, res) => {
      handleHttp(req, res).catch((e) => {
        res.writeHead(500); res.end(String(e))
      })
    })
    const wsServer = new WebSocketServer({ server, path: '/stream' })

    wsServer.on('connection', (ws) => {
      clients.add(ws)
      state.pwaConnected = clients.size
      ws.send(JSON.stringify({ type: 'hello', config: getConfig(), state: snapshot() }))
      ws.on('message', (raw) => {
        let msg
        try { msg = JSON.parse(raw.toString()) } catch { return }
        const list = handlers[msg.type] || []
        for (const fn of list) {
          try { fn(msg, ws) } catch (e) { console.error('[pwa-event]', e) }
        }
      })
      ws.on('close', () => {
        clients.delete(ws)
        state.pwaConnected = clients.size
      })
    })

    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => reject(error)
        server.once('error', onError)
        server.listen(port, '127.0.0.1', () => {
          server.off('error', onError)
          resolve()
        })
      })
    } catch (error) {
      wsServer.close()
      throw error
    }

    httpServer = server
    wss = wsServer
    const address = bridgeAddress(server)
    console.error(`[pwa] ${address.http}  ${address.ws}`)
    return address
  })()

  try {
    return await startPromise
  } finally {
    startPromise = null
  }
}

export async function stopBridge() {
  if (startPromise) {
    try { await startPromise } catch { /* startup already failed */ }
  }

  const server = httpServer
  const wsServer = wss
  httpServer = null
  wss = null

  for (const ws of clients) ws.terminate()
  clients.clear()
  state.pwaConnected = 0

  if (wsServer) {
    await new Promise((resolve) => wsServer.close(() => resolve()))
  }
  if (server?.listening) {
    await new Promise((resolve) => server.close(() => resolve()))
  }
}

function bridgeAddress(server) {
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : null
  return {
    host: '127.0.0.1',
    port,
    http: `http://127.0.0.1:${port}`,
    ws: `ws://127.0.0.1:${port}/stream`
  }
}

async function handleHttp(req, res) {
  const url = new URL(req.url, 'http://x')
  const pathname = url.pathname

  // /api/state
  if (pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ state: snapshot(), config: getConfig() }))
    return
  }

  // /tts/*.mp3  → user-data/cache/tts
  if (pathname.startsWith('/tts/')) {
    const fname = path.basename(pathname)
    const file = path.join(PATHS.ttsCache, fname)
    return serveFile(res, file)
  }

  // 静态资源 → web/
  let rel = pathname === '/' ? '/index.html' : pathname
  const file = path.join(PATHS.web, rel)
  // 防越界
  if (!file.startsWith(PATHS.web)) {
    res.writeHead(403); res.end('forbidden'); return
  }
  return serveFile(res, file)
}

function serveFile(res, file) {
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404); res.end('not found'); return
    }
    const ext = path.extname(file).toLowerCase()
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    })
    fs.createReadStream(file).pipe(res)
  })
}
