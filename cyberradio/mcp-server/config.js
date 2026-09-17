// 配置加载 / 写入 (热更新)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.resolve(__dirname, '../user-data/config.json')

let cached = null
let mtime = 0

export function getConfig() {
  try {
    const stat = fs.statSync(CONFIG_PATH)
    if (!cached || stat.mtimeMs !== mtime) {
      cached = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
      mtime = stat.mtimeMs
    }
  } catch (e) {
    if (!cached) cached = {}
  }
  return cached
}

export function patchConfig(patch) {
  const cur = getConfig()
  const next = deepMerge(cur, patch)
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8')
  cached = next
  mtime = fs.statSync(CONFIG_PATH).mtimeMs
  return next
}

function deepMerge(a, b) {
  if (Array.isArray(b)) return b
  if (b && typeof b === 'object') {
    const out = { ...(a || {}) }
    for (const k of Object.keys(b)) out[k] = deepMerge(a?.[k], b[k])
    return out
  }
  return b
}

export const PATHS = {
  root: path.resolve(__dirname, '..'),
  userData: path.resolve(__dirname, '../user-data'),
  cache: path.resolve(__dirname, '../user-data/cache'),
  ttsCache: path.resolve(__dirname, '../user-data/cache/tts'),
  web: path.resolve(__dirname, '../web')
}

// 确保关键目录存在
for (const p of [PATHS.userData, PATHS.cache, PATHS.ttsCache]) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}
