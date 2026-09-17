// mem.* — 记忆 (sqlite, Agent 自主读写)
import path from 'node:path'
import Database from 'better-sqlite3'
import { PATHS } from '../config.js'

let db = null
function getDb() {
  if (db) return db
  const file = path.join(PATHS.userData, 'memory.db')
  db = new Database(file)
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      k TEXT PRIMARY KEY,
      v TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_history_kind ON history(kind);
    CREATE INDEX IF NOT EXISTS idx_history_time ON history(created_at);

    CREATE TABLE IF NOT EXISTS cache (
      provider TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      payload TEXT NOT NULL,
      expires_at INTEGER,
      PRIMARY KEY (provider, fingerprint)
    );
  `)
  return db
}

export function registerMemTools(register) {
  register({
    name: 'mem.read',
    description: '读取键值记忆',
    inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
    handler: async ({ key }) => {
      const r = getDb().prepare('SELECT v FROM kv WHERE k = ?').get(key)
      return r ? { key, value: JSON.parse(r.v) } : { key, value: null }
    }
  })

  register({
    name: 'mem.write',
    description: '写入键值记忆 (任意 JSON)',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' }, value: {} },
      required: ['key', 'value']
    },
    handler: async ({ key, value }) => {
      getDb().prepare(`
        INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at
      `).run(key, JSON.stringify(value), Date.now())
      return { ok: true }
    }
  })

  register({
    name: 'mem.list_keys',
    description: '列出所有记忆键名',
    handler: async () => {
      const rows = getDb().prepare('SELECT k, updated_at FROM kv ORDER BY updated_at DESC').all()
      return rows
    }
  })

  register({
    name: 'mem.append_history',
    description: '追加一条历史记录 (如: 播过的歌、做出的决定)',
    inputSchema: {
      type: 'object',
      properties: { kind: { type: 'string' }, payload: {} },
      required: ['kind', 'payload']
    },
    handler: async ({ kind, payload }) => {
      const info = getDb().prepare(
        'INSERT INTO history (kind, payload, created_at) VALUES (?, ?, ?)'
      ).run(kind, JSON.stringify(payload), Date.now())
      return { ok: true, id: info.lastInsertRowid }
    }
  })

  register({
    name: 'mem.query_history',
    description: '查询历史 (按 kind / 时间倒序)',
    inputSchema: {
      type: 'object',
      properties: {
        kind:  { type: 'string' },
        limit: { type: 'number', default: 20 },
        since: { type: 'number', description: 'Unix ms, 仅返回此之后的' }
      }
    },
    handler: async ({ kind, limit = 20, since }) => {
      const where = []
      const args = []
      if (kind)  { where.push('kind = ?');       args.push(kind) }
      if (since) { where.push('created_at >= ?'); args.push(since) }
      const sql = `SELECT id, kind, payload, created_at FROM history
                   ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                   ORDER BY id DESC LIMIT ?`
      const rows = getDb().prepare(sql).all(...args, limit)
      return rows.map(r => ({ ...r, payload: JSON.parse(r.payload) }))
    }
  })

  register({
    name: 'mem.update_taste',
    description: '把一段笔记追加到 taste.md 末尾 (Agent 用此持续完善口味)',
    inputSchema: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] },
    handler: async ({ note }) => {
      const fs = await import('node:fs')
      const file = path.join(PATHS.userData, 'taste.md')
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
      fs.appendFileSync(file, `\n\n<!-- ${stamp} -->\n${note}\n`, 'utf8')
      return { ok: true }
    }
  })
}
