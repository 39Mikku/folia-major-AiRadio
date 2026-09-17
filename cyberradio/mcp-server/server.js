#!/usr/bin/env node
// 标准 stdio MCP Server 入口。
// stdout 只写 MCP JSON-RPC；运行日志一律写 stderr。
import 'dotenv/config'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js'

import { startBridge, stopBridge } from './http-bridge.js'
import { registerPlayerTools } from './tools/player.js'
import { registerNcmTools }    from './tools/ncm.js'
import { registerMemTools }    from './tools/mem.js'
import { registerEnvTools }    from './tools/env.js'
import { registerWebTools }    from './tools/web.js'

// ───── tool registry ─────────────────────────────────────────────────
const TOOLS = []        // [{name, description, inputSchema, handler}]
function register(def) { TOOLS.push(def) }

// 注册所有工具
registerPlayerTools(register)
registerNcmTools(register)
registerMemTools(register)
registerEnvTools(register)
registerWebTools(register)

// ───── MCP 协议 ──────────────────────────────────────────────────────
export function createMcpServer() {
  const server = new Server(
    { name: 'cyber-radio', version: '0.1.0' },
    { capabilities: { tools: { listChanged: false } } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema || { type: 'object', properties: {} }
    }))
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params
    const tool = TOOLS.find(t => t.name === name)
    if (!tool) {
      return {
        content: [{ type: 'text', text: `未知工具: ${name}` }],
        isError: true
      }
    }
    try {
      const result = await tool.handler(args || {})
      const text = typeof result === 'string'
        ? result
        : JSON.stringify(result ?? null, null, 2)
      return { content: [{ type: 'text', text }] }
    } catch (e) {
      return {
        content: [{ type: 'text', text: `[${name}] 执行失败: ${e?.message || e}` }],
        isError: true
      }
    }
  })

  server.onerror = (error) => console.error('[mcp:error]', error)
  return server
}

// ───── 启动 ──────────────────────────────────────────────────────────
async function main() {
  // PWA 是播放器输出端，仍随 MCP 启动；可在纯协议测试时显式关闭。
  if (bridgeEnabled()) await startBridge()
  else console.error('[pwa] disabled by CYBERRADIO_BRIDGE')

  const server = createMcpServer()
  const transport = new StdioServerTransport()
  let shuttingDown = false

  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true
    await Promise.allSettled([server.close(), stopBridge()])
  }

  process.stdin.once('end', () => { void shutdown() })
  process.stdin.once('close', () => { void shutdown() })
  process.once('SIGINT', () => { void shutdown() })
  process.once('SIGTERM', () => { void shutdown() })

  await server.connect(transport)
  console.error(`[mcp] cyber-radio ready, ${TOOLS.length} tools registered`)
}

function bridgeEnabled() {
  const value = String(process.env.CYBERRADIO_BRIDGE ?? '1').toLowerCase()
  return !['0', 'false', 'off', 'no'].includes(value)
}

main().catch(async (e) => {
  console.error('[fatal]', e)
  await stopBridge()
  process.exitCode = 1
})
