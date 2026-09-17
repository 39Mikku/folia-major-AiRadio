// MiniMax T2A v2 (非流式)
// 文档: https://www.minimax.io/platform/document/T2A%20V2
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import axios from 'axios'
import { PATHS, getConfig } from '../config.js'

const ENDPOINT = 'https://api.minimaxi.com/v1/t2a_v2'

export async function synthesizeToFile({ text, voice, speed } = {}) {
  if (!text || !text.trim()) throw new Error('text 不能为空')
  const cfg = getConfig().tts || {}

  const apiKey  = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    // stub: 没配 key 时不调真实接口, 返回一个静音占位文件, 便于联调
    const fname = stubFile(text)
    return { url: `/tts/${fname}`, fname, stub: true }
  }

  const voiceId = voice || cfg.voice_id || process.env.MINIMAX_VOICE_ID || 'male-qn-qingse'
  const model   = cfg.model || process.env.MINIMAX_MODEL || 'speech-02-hd'
  const sp      = typeof speed === 'number' ? speed : (cfg.speed ?? 1.0)

  const body = {
    model,
    text,
    stream: false,
    voice_setting: { voice_id: voiceId, speed: sp, vol: 1.0, pitch: 0 },
    audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 }
  }

  const r = await axios.post(ENDPOINT, body, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 60000
  })

  // 返回结构: data.audio (hex string) 或 data.audio_url
  const data = r.data?.data
  if (!data) throw new Error('MiniMax 无 data 返回: ' + JSON.stringify(r.data).slice(0, 300))

  let buf
  if (data.audio) buf = Buffer.from(data.audio, 'hex')
  else if (data.audio_url) {
    const ar = await axios.get(data.audio_url, { responseType: 'arraybuffer' })
    buf = Buffer.from(ar.data)
  } else {
    throw new Error('MiniMax 返回缺 audio: ' + JSON.stringify(r.data).slice(0, 300))
  }

  const hash = crypto.createHash('sha1').update(text + '|' + voiceId + '|' + sp).digest('hex').slice(0, 12)
  const fname = `${Date.now()}_${hash}.mp3`
  const file = path.join(PATHS.ttsCache, fname)
  fs.writeFileSync(file, buf)
  return { url: `/tts/${fname}`, fname, file }
}

// 没 key 时占位: 用一个 1KB 的近静音 mp3 (不是真静音, 仅占位)
function stubFile(text) {
  const hash = crypto.createHash('sha1').update(text).digest('hex').slice(0, 12)
  const fname = `stub_${hash}.mp3`
  const file = path.join(PATHS.ttsCache, fname)
  if (!fs.existsSync(file)) {
    // 空文件占位 (PWA 端会播放失败但不影响 ducking 流程联调)
    fs.writeFileSync(file, Buffer.alloc(0))
  }
  return fname
}
