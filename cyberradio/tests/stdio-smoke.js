import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import WebSocket from 'ws'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverEntry = path.join(root, 'mcp-server', 'server.js')
const stderr = []

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntry],
  cwd: root,
  env: {
    ...process.env,
    CYBERRADIO_BRIDGE: '1',
    PWA_PORT: '0'
  },
  stderr: 'pipe'
})
transport.stderr?.on('data', chunk => stderr.push(chunk.toString()))

const client = new Client({ name: 'cyber-radio-smoke-test', version: '1.0.0' })

try {
  await client.connect(transport)

  let bridgeMatch
  for (let i = 0; i < 50 && !bridgeMatch; i += 1) {
    bridgeMatch = stderr.join('').match(/\[pwa\] http:\/\/127\.0\.0\.1:(\d+)/)
    if (!bridgeMatch) await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.ok(bridgeMatch, 'PWA HTTP/WebSocket 桥接应随 MCP 启动')
  const bridgePort = Number(bridgeMatch[1])

  const stateResponse = await fetch(`http://127.0.0.1:${bridgePort}/api/state`)
  assert.equal(stateResponse.status, 200)
  assert.ok((await stateResponse.json()).state)

  const hello = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${bridgePort}/stream`)
    const timer = setTimeout(() => {
      ws.terminate()
      reject(new Error('WebSocket hello timeout'))
    }, 2000)
    let message
    ws.once('message', data => {
      message = JSON.parse(data.toString())
      ws.close()
    })
    ws.once('close', () => {
      clearTimeout(timer)
      resolve(message)
    })
    ws.once('error', reject)
  })
  assert.equal(hello.type, 'hello')

  const { tools } = await client.listTools()
  assert.equal(tools.length, 32, '应完整暴露 32 个 MCP 工具')
  for (const required of [
    'player.play_playlist',
    'ncm.search_song',
    'mem.read',
    'env.get_now',
    'web.search'
  ]) {
    assert.ok(tools.some(tool => tool.name === required), `缺少工具 ${required}`)
  }

  const now = await client.callTool({ name: 'env.get_now', arguments: {} })
  assert.equal(now.isError, undefined)
  assert.equal(now.content[0]?.type, 'text')
  assert.ok(JSON.parse(now.content[0].text).iso)

  const unknown = await client.callTool({ name: 'missing.tool', arguments: {} })
  assert.equal(unknown.isError, true)

  const startedAt = Date.now()
  await client.close()
  assert.ok(Date.now() - startedAt < 1800, '关闭 stdin 后服务应主动退出，而不是等待强杀')

  assert.match(stderr.join(''), /cyber-radio ready, 32 tools registered/)
  console.log('stdio MCP smoke test passed (32 tools, callTool, graceful shutdown)')
} catch (error) {
  await client.close().catch(() => {})
  if (stderr.length) console.error(stderr.join(''))
  throw error
}
