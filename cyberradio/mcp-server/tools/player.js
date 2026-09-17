// player.* — 播放控制 (核心闭环)
//
// 设计:
//   - MCP 工具不直接出声, 通过 WS broadcast 命令 PWA 端 (Web Audio) 出声
//   - PWA 上报进度/事件, 写入 state, 同步给 Agent 后续调用
//   - speak 内部: 调 tts.synthesize → 落盘到 user-data/cache/tts → broadcast {type:'speak', url:'/tts/xxx.mp3'}
//     ducking (duck → 等 speak_end → unduck) 全程在 server 内部托管
//   - 播放列表: 预合成全部 brief TTS + 通知 PWA prefetch 全部 mp3 → 监听 progress
//     在歌曲尾部 crossfade_ms 之前广播 crossfade_to, 实现"快结束做 mix 过渡"
import { broadcast, onPwaEvent } from '../http-bridge.js'
import { state, pushRecent, snapshot } from '../state.js'
import { getConfig, patchConfig } from '../config.js'
import { synthesizeToFile } from '../lib/minimax.js'

// ── PWA 事件 → 状态 ─────────────────────────────────────────────────
onPwaEvent('progress', (m) => {
  if (m.songId && state.current.songId === m.songId) {
    state.current.progress = m.t || 0
    if (m.dur) state.current.duration = m.dur
    state.current.paused = !!m.paused
  }
  // 播放列表的 crossfade 触发
  _maybeCrossfade(m)
})
onPwaEvent('song_end', async () => {
  const cur = state.current
  if (cur.songId) pushRecent({
    songId: cur.songId, title: cur.title, artist: cur.artist,
    album: cur.album, cover: cur.cover
  })
  state.current = { songId: null, title: null, artist: null, album: null, cover: null,
                    url: null, duration: 0, progress: 0, introEnd: null, outroStart: null,
                    startedAt: 0, paused: false }

  // 兜底: 如果 crossfade 没来得及触发就自然结束了 (例如 duration 不准), 直接接下一首
  if (activePlaylist && !activePlaylist.crossfadeFired && activePlaylist.idx < activePlaylist.items.length - 1) {
    _advancePlaylist({ fadeMs: 0 })  // 没时间做 fade, 直接切
    return
  }
  // 播放列表已结束 (最后一首自然 end)
  if (activePlaylist && activePlaylist.idx >= activePlaylist.items.length - 1) {
    activePlaylist = null
  }

  // 旧 queue
  if (state.queue.length) {
    const next = state.queue.shift()
    _playNow(next)
  }
})
onPwaEvent('speak_end', () => {
  state.speaking = false
  const cfg = getConfig().mix || {}
  broadcast({ type: 'unduck', ms: cfg.unduck_ramp_ms ?? 600 })
})
onPwaEvent('set_config', (m) => {
  if (!m?.payload) return
  const next = patchConfig(m.payload)
  broadcast({ type: 'config', payload: next })
})
// WebUI 控制条 → 同 player.skip / player.stop_playlist
onPwaEvent('request_skip', async () => {
  if (activePlaylist && activePlaylist.idx < activePlaylist.items.length - 1) {
    activePlaylist.crossfadeFired = true
    const fadeMs = activePlaylist.opts?.crossfadeMs ?? getConfig().segue?.crossfade_ms ?? 2000
    await _advancePlaylist({ fadeMs: Math.min(fadeMs, 2000) })
    return
  }
  const next = state.queue.shift()
  if (next) { _playNow(next); return }
  broadcast({ type: 'stop' })
  state.current = { songId: null, title: null, artist: null, album: null, cover: null,
                    url: null, duration: 0, progress: 0, introEnd: null, outroStart: null,
                    startedAt: 0, paused: false }
})
onPwaEvent('request_stop', () => {
  activePlaylist = null
  state.queue = []
  broadcast({ type: 'stop' })
  state.current = { songId: null, title: null, artist: null, album: null, cover: null,
                    url: null, duration: 0, progress: 0, introEnd: null, outroStart: null,
                    startedAt: 0, paused: false }
})

// ── 内部: 立即放一首 (替换 active) ──────────────────────────────────
function _playNow(item) {
  state.current = {
    songId: item.songId,
    title: item.title || null,
    artist: item.artist || null,
    album: item.album || null,
    cover: item.cover || null,
    url: item.url,
    duration: item.duration || 0,
    progress: 0,
    introEnd: item.introEnd ?? null,
    outroStart: item.outroStart ?? null,
    startedAt: Date.now(),
    paused: false
  }
  broadcast({ type: 'play_music', url: item.url, song: state.current })
}

// ── 内部: 用 crossfade 切到一首 (PWA 双槽承接) ──────────────────────
function _crossfadeTo(item, fadeMs) {
  state.current = {
    songId: item.songId,
    title: item.title || null,
    artist: item.artist || null,
    album: item.album || null,
    cover: item.cover || null,
    url: item.url,
    duration: item.duration || 0,
    progress: 0,
    introEnd: item.introEnd ?? null,
    outroStart: item.outroStart ?? null,
    startedAt: Date.now(),
    paused: false
  }
  broadcast({ type: 'crossfade_to', url: item.url, song: state.current, fadeMs })
}

// ── 内部: 等待 PWA 真正开始播这一首 ──
function _waitMusicStarted(songId, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (state.current.songId === songId && state.current.progress > 0.1) {
      return resolve(Date.now())
    }
    const off = onPwaEvent('progress', (m) => {
      if (m.songId === songId && (m.t || 0) > 0.1) {
        off(); resolve(Date.now())
      }
    })
    setTimeout(() => { off(); resolve(Date.now()) }, timeoutMs)
  })
}

// ── 内部: 在已起播的歌之上, 延迟一会儿做 duck + speak ──
async function _briefOverCurrent(voiceUrl) {
  const cfg = getConfig().mix || {}
  state.speaking = true
  broadcast({ type: 'duck', level: cfg.duck_level ?? 0.25, ms: cfg.duck_ramp_ms ?? 600 })
  setTimeout(() => broadcast({ type: 'speak', url: voiceUrl }), (cfg.duck_ramp_ms ?? 600) * 0.6)
}

// ── 内部: 带前置口播的播放 ──
async function _playWithBrief(item, briefText, briefOpts = {}) {
  _playNow(item)
  const ttsPromise = synthesizeToFile({
    text: briefText, voice: briefOpts.voice, speed: briefOpts.speed
  })
  const musicStartedAt = await _waitMusicStarted(item.songId)
  const normalizeReadyMs = briefOpts.briefDelayMs ?? 6200
  const { url: voiceUrl, fname } = await ttsPromise
  const elapsed = Date.now() - musicStartedAt
  if (elapsed < normalizeReadyMs) await new Promise(r => setTimeout(r, normalizeReadyMs - elapsed))
  await _briefOverCurrent(voiceUrl)
  return { voiceUrl, fname, musicStartedAt, briefDelayMs: normalizeReadyMs }
}

// ── 播放列表 ───────────────────────────────────────────────────────
// activePlaylist: { items, idx, ttsCache, opts, crossfadeFired }
let activePlaylist = null

// 计算下一首 crossfade 触发时间点 (秒)
function _crossfadeTriggerAt(item, fadeSec) {
  const dur = item.duration || state.current.duration || 0
  if (!dur) return null
  // 优先用 outroStart (歌曲尾奏开始), 否则 dur - fadeSec
  const byOutro  = item.outroStart && item.outroStart > 0 ? item.outroStart : Infinity
  const byEnd    = dur - fadeSec
  return Math.max(0, Math.min(byOutro, byEnd))
}

// 进度回调里检查是否该触发 crossfade
function _maybeCrossfade(m) {
  const pl = activePlaylist
  if (!pl) return
  if (pl.crossfadeFired) return
  if (pl.idx >= pl.items.length - 1) return  // 最后一首, 不需要切
  if (m.songId !== pl.items[pl.idx].songId) return  // 当前 progress 不属于 active 曲

  const cur = pl.items[pl.idx]
  const fadeSec = (pl.opts.crossfadeMs ?? getConfig().segue?.crossfade_ms ?? 4000) / 1000
  const trig = _crossfadeTriggerAt(cur, fadeSec)
  if (trig == null) return
  if ((m.t || 0) >= trig) {
    pl.crossfadeFired = true
    _advancePlaylist({ fadeMs: fadeSec * 1000 })
  }
}

// 推进播放列表到下一首 (核心: crossfade + brief 承接)
async function _advancePlaylist({ fadeMs }) {
  const pl = activePlaylist
  if (!pl) return
  // 把当前正在播的歌写入 recent (crossfade 不会触发 song_end, 这里补上)
  const cur = state.current
  if (cur.songId) pushRecent({
    songId: cur.songId, title: cur.title, artist: cur.artist,
    album: cur.album, cover: cur.cover
  })
  pl.idx += 1
  const i = pl.idx
  const next = pl.items[i]
  const voiceUrl = pl.ttsCache.get(i)

  if (fadeMs > 0) _crossfadeTo(next, fadeMs)
  else _playNow(next)

  // 重置 crossfade 触发标记 (留给下一首用)
  pl.crossfadeFired = false

  // 等新曲真正起播, 再走 brief
  _waitMusicStarted(next.songId).then(async () => {
    if (!voiceUrl) return
    const gap = pl.opts?.segueGapMs ?? 1500
    await new Promise(r => setTimeout(r, gap))
    await _briefOverCurrent(voiceUrl)
  })
}

async function _playPlaylist(items, opts = {}) {
  if (!items?.length) return { ok: false, error: 'empty' }

  // 1) 全部 brief TTS 预合成
  const ttsCache = new Map()
  await Promise.all(items.map(async (it, i) => {
    if (!it.brief) { ttsCache.set(i, null); return }
    try {
      const { url } = await synthesizeToFile({
        text: it.brief,
        voice: opts.briefVoice ?? it.briefVoice,
        speed: opts.briefSpeed ?? it.briefSpeed
      })
      ttsCache.set(i, url)
    } catch (e) {
      ttsCache.set(i, null)
    }
  }))

  // 2) 通知 PWA prefetch 全部 mp3 (浏览器会主动拉到 HTTP cache)
  broadcast({ type: 'prefetch', urls: items.map(x => x.url).filter(Boolean) })

  activePlaylist = { items, idx: 0, ttsCache, opts, crossfadeFired: false }

  // 3) 第一首: 起播 + 等归一化 + brief
  const first = items[0]
  _playNow(first)
  const musicStartedAt = await _waitMusicStarted(first.songId)
  const voiceUrl = ttsCache.get(0)
  if (voiceUrl) {
    const normalizeReadyMs = opts.briefDelayMs ?? 6200
    const elapsed = Date.now() - musicStartedAt
    if (elapsed < normalizeReadyMs) await new Promise(r => setTimeout(r, normalizeReadyMs - elapsed))
    await _briefOverCurrent(voiceUrl)
  }
  return {
    ok: true, total: items.length,
    withBrief: [...ttsCache.values()].filter(Boolean).length,
    crossfadeMs: opts.crossfadeMs ?? getConfig().segue?.crossfade_ms ?? 4000
  }
}

// ── 工具注册 ────────────────────────────────────────────────────────
export function registerPlayerTools(register) {
  register({
    name: 'player.play_song',
    description: '立即播放一首歌 (会替换当前播放). 传入 url 与可选元信息. 如果带 brief, 会先合成 TTS 再"同时"开始, 避免歌已经唱了一会儿才听到口播.',
    inputSchema: {
      type: 'object',
      properties: {
        url:        { type: 'string', description: '可直接由 <audio> 加载的音频 URL (网易云 song_url_v1 拿到的)' },
        songId:     { type: ['string','number'], description: '网易云 songId, 用于事件回填' },
        title:      { type: 'string' },
        artist:     { type: 'string' },
        album:      { type: 'string' },
        cover:      { type: 'string', description: '专辑封面图 URL' },
        duration:   { type: 'number', description: '总时长(秒), 可选' },
        introEnd:   { type: 'number', description: '前奏结束(秒), 可选' },
        outroStart: { type: 'number', description: '尾奏开始(秒), 可选' },
        brief:      { type: 'string', description: '可选: 同时播放的前置口播文本. TTS 合成完再一起开声, 零感知延迟.' },
        briefVoice: { type: 'string' },
        briefSpeed: { type: 'number' }
      },
      required: ['url']
    },
    handler: async (a) => {
      if (a.brief) {
        const r = await _playWithBrief(a, a.brief, { voice: a.briefVoice, speed: a.briefSpeed })
        return { ok: true, current: state.current, brief: r }
      }
      _playNow(a)
      return { ok: true, current: state.current }
    }
  })

  register({
    name: 'player.enqueue_song',
    description: '把一首歌加入队列, 等当前曲结束后自动播放',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' }, songId: { type: ['string','number'] },
        title: { type: 'string' }, artist: { type: 'string' },
        album: { type: 'string' }, cover: { type: 'string' },
        duration: { type: 'number' }, introEnd: { type: 'number' }, outroStart: { type: 'number' }
      },
      required: ['url']
    },
    handler: async (a) => {
      if (!state.current.songId) { _playNow(a); return { ok: true, started: true, current: state.current } }
      state.queue.push(a)
      return { ok: true, queued: true, queueLength: state.queue.length }
    }
  })

  register({
    name: 'player.play_playlist',
    description: [
      '播放一组歌曲, 每首带自己的 brief 文稿.',
      '调用前请把全部歌曲信息+文稿准备好一次性传入. server 会预合成所有 TTS + 通知 PWA prefetch mp3.',
      '快结束时 (outroStart 或 duration-crossfadeMs 较早者) 自动 crossfade 到下一首, 新曲起播后 segueGapMs 进 brief.',
      '若 brief 缺省, 该首跳过口播只接歌. 若 duration 缺省, 用 song_end 兜底硬切.'
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: '歌曲序列. 每项包含: url, songId, title, artist, album, cover, duration, introEnd, outroStart, brief (可选), briefVoice (可选), briefSpeed (可选)',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string' }, songId: { type: ['string','number'] },
              title: { type: 'string' }, artist: { type: 'string' },
              album: { type: 'string' }, cover: { type: 'string' },
              duration: { type: 'number' }, introEnd: { type: 'number' }, outroStart: { type: 'number' },
              brief: { type: 'string' }, briefVoice: { type: 'string' }, briefSpeed: { type: 'number' }
            },
            required: ['url']
          }
        },
        briefVoice: { type: 'string', description: '统一的 voice_id, 留空用 .env 默认' },
        briefSpeed: { type: 'number' },
        segueGapMs: { type: 'number', description: '新歌起播后多久再开口 brief (毫秒, 默认 1500)' },
        briefDelayMs: { type: 'number', description: '第一首归一化等待 (默认 6200)' },
        crossfadeMs:  { type: 'number', description: '交叉淡入时长 (毫秒, 默认 config.segue.crossfade_ms = 4000)' }
      },
      required: ['items']
    },
    handler: async (a) => {
      const r = await _playPlaylist(a.items, {
        briefVoice: a.briefVoice, briefSpeed: a.briefSpeed,
        segueGapMs: a.segueGapMs, briefDelayMs: a.briefDelayMs,
        crossfadeMs: a.crossfadeMs
      })
      return r
    }
  })

  register({
    name: 'player.stop_playlist',
    description: '停止当前播放列表 (不影响当前正在播的这一首). 让自动接下一首停下来.',
    handler: async () => {
      const had = !!activePlaylist
      activePlaylist = null
      return { ok: true, hadActive: had }
    }
  })

  register({
    name: 'player.speak',
    description: '让 AI DJ 说一段话. 会自动 TTS → ducking 背景音乐 → 播报 → 恢复音量.',
    inputSchema: {
      type: 'object',
      properties: {
        text:    { type: 'string', description: '播报文本' },
        voice:   { type: 'string', description: 'MiniMax voice_id, 留空用配置默认' },
        speed:   { type: 'number', description: '语速 0.5-2.0, 留空用配置' }
      },
      required: ['text']
    },
    handler: async (a) => {
      const { url, fname } = await synthesizeToFile({
        text: a.text, voice: a.voice, speed: a.speed
      })
      const cfg = getConfig().mix || {}
      state.speaking = true
      broadcast({ type: 'duck',  level: cfg.duck_level ?? 0.25, ms: cfg.duck_ramp_ms ?? 600 })
      broadcast({ type: 'speak', url })
      return { ok: true, audio: url, file: fname }
    }
  })

  register({
    name: 'player.pause',
    description: '暂停当前播放',
    handler: async () => { broadcast({ type: 'pause' }); state.current.paused = true; return { ok: true } }
  })

  register({
    name: 'player.resume',
    description: '恢复播放',
    handler: async () => { broadcast({ type: 'resume' }); state.current.paused = false; return { ok: true } }
  })

  register({
    name: 'player.skip',
    description: '跳过当前歌曲. 优先按播放列表推进 (走 crossfade), 没有列表时落到旧 queue.',
    handler: async () => {
      if (activePlaylist && activePlaylist.idx < activePlaylist.items.length - 1) {
        activePlaylist.crossfadeFired = true
        const fadeMs = activePlaylist.opts?.crossfadeMs ?? getConfig().segue?.crossfade_ms ?? 2000
        // skip 时用更短的 fade
        await _advancePlaylist({ fadeMs: Math.min(fadeMs, 2000) })
        return { ok: true, skippedTo: state.current, source: 'playlist' }
      }
      const next = state.queue.shift()
      if (next) { _playNow(next); return { ok: true, skippedTo: state.current, source: 'queue' } }
      broadcast({ type: 'stop' })
      state.current = { songId: null, title: null, artist: null, album: null, cover: null,
                        url: null, duration: 0, progress: 0, introEnd: null, outroStart: null,
                        startedAt: 0, paused: false }
      return { ok: true, skippedTo: null }
    }
  })

  register({
    name: 'player.now_playing',
    description: '获取当前播放状态 / 队列概况 / 最近 5 首 / 播放列表进度',
    handler: async () => {
      const s = snapshot()
      if (activePlaylist) {
        s.playlist = {
          idx: activePlaylist.idx,
          total: activePlaylist.items.length,
          remaining: activePlaylist.items.slice(activePlaylist.idx + 1).map(x => ({
            title: x.title, artist: x.artist, songId: x.songId
          }))
        }
      }
      return s
    }
  })

  register({
    name: 'player.set_config',
    description: '更新配置 (ducking 深度/渐变时长/segue lead/crossfade 等), 立即热生效并推 PWA',
    inputSchema: {
      type: 'object',
      properties: {
        mix: {
          type: 'object',
          properties: {
            duck_level:      { type: 'number' },
            duck_ramp_ms:    { type: 'number' },
            unduck_ramp_ms:  { type: 'number' }
          }
        },
        segue: {
          type: 'object',
          properties: {
            lead_seconds:           { type: 'number' },
            fallback_intro_seconds: { type: 'number' },
            fallback_outro_seconds: { type: 'number' },
            crossfade_ms:           { type: 'number' }
          }
        }
      }
    },
    handler: async (patch) => {
      const next = patchConfig(patch)
      broadcast({ type: 'config', payload: next })
      return { ok: true, config: next }
    }
  })
}
