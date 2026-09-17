// ncm.* — 网易云音乐
// 直接 require NeteaseCloudMusicApi 函数式调用 (不开端口)
// 占位实现: 调用核心几个接口, 其余按需扩
import { getConfig } from '../config.js'

let ncm = null
async function lazyNcm() {
  if (ncm) return ncm
  // NeteaseCloudMusicApi 是 CommonJS, ESM 里要用动态 import
  const mod = await import('NeteaseCloudMusicApi').catch(() => null)
  ncm = mod?.default || mod
  return ncm
}
function cookie() { return process.env.NCM_COOKIE || '' }

// ── LRC 解析 + 结构推断 ─────────────────────────────────────────────
function parseLRC(lrc) {
  if (!lrc) return []
  const lines = []
  for (const raw of lrc.split('\n')) {
    const m = raw.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/)
    if (!m) continue
    const t = parseInt(m[1]) * 60 + parseFloat(m[2])
    const text = m[3].trim()
    lines.push({ t, text })
  }
  return lines
}
const META_PAT = /^(作词|作曲|编曲|制作|出品|监制|混音|母带|演唱|歌手|主唱|和声|配唱|录音|吉他|贝斯|鼓|弦乐|键盘|钢琴|Producer|Composer|Lyricist|Arranger|Mixed|Mastered|Vocal|Recorded|Performed|by[:：]?\s|作詞|作曲家|編曲|歌詞|演奏)/i
function vocalLines(lines) {
  return lines.filter(l => {
    if (!l.text) return false
    if (META_PAT.test(l.text)) return false
    // 形如 "xx : yyy" 或 "xx ：yyy" 也视为元数据
    if (/^[A-Za-z\u4e00-\u9fa5]{1,8}\s*[:：]/.test(l.text)) return false
    return true
  })
}

// ── 评论清洗 ────────────────────────────────────────────────────────
const STORY_HINTS = /(我|那年|那天|当时|那时|大学|高三|高中|初中|她|他|奶奶|爷爷|爸爸|妈妈|哥哥|姐姐|失去|哭了|想起|怀念|喜欢|分手|毕业|宿舍|凌晨|地铁|出租车|窗外|雨|雪|下班)/
function makeCleaner(cfg) {
  const min = cfg?.comment_filter?.min_length ?? 30
  const max = cfg?.comment_filter?.max_length ?? 250
  return (content) => {
    if (!content) return false
    const len = [...content].length
    if (len < min || len > max) return false
    if (/https?:\/\//.test(content)) return false
    if (/@[\u4e00-\u9fa5\w]+/.test(content)) return false
    if ((content.match(/[!！]{2,}/g) || []).length > 0) return false
    if (!STORY_HINTS.test(content)) return false
    return true
  }
}

// ── 封面升清: 网易云 CDN 支持 ?param=NxN ─────────────────────────────
function hiResCover(url, size = 512) {
  if (!url) return url
  // 已经带 param 就替换, 否则追加
  if (/[?&]param=/.test(url)) return url.replace(/([?&]param=)\d+y\d+/, `$1${size}y${size}`)
  return url + (url.includes('?') ? '&' : '?') + `param=${size}y${size}`
}

export function registerNcmTools(register) {
  register({
    name: 'ncm.search_song',
    description: '搜索歌曲, 返回 [{id, name, artists, album, duration_ms}]',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string' }, limit: { type: 'number', default: 10 }
      },
      required: ['keyword']
    },
    handler: async ({ keyword, limit = 10 }) => {
      const n = await lazyNcm(); if (!n) return { error: 'NeteaseCloudMusicApi 未安装' }
      const r = await n.cloudsearch({ keywords: keyword, limit, cookie: cookie() })
      const songs = r.body?.result?.songs || []
      return songs.map(s => ({
        id: s.id, name: s.name,
        artists: (s.ar || []).map(a => a.name),
        album: s.al?.name, duration_ms: s.dt
      }))
    }
  })

  register({
    name: 'ncm.get_song_url',
    description: '获取歌曲可播放 URL',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: ['string','number'] },
        level: { type: 'string', description: 'standard/exhigh/lossless/hires', default: 'exhigh' }
      },
      required: ['id']
    },
    handler: async ({ id, level }) => {
      const n = await lazyNcm(); if (!n) return { error: 'NeteaseCloudMusicApi 未安装' }
      const lvl = level || getConfig().song_quality || 'exhigh'
      const r = await n.song_url_v1({ id, level: lvl, cookie: cookie() })
      const it = r.body?.data?.[0]
      return { id, url: it?.url, br: it?.br, size: it?.size, level: it?.level }
    }
  })

  register({
    name: 'ncm.get_lyric',
    description: '获取歌词 (LRC + 可能的 yrc / 翻译). 写 brief 时用来抓意象与情绪.',
    inputSchema: { type: 'object', properties: { id: { type: ['string','number'] } }, required: ['id'] },
    handler: async ({ id }) => {
      const n = await lazyNcm(); if (!n) return { error: 'NeteaseCloudMusicApi 未安装' }
      const r = await n.lyric_new({ id, cookie: cookie() }).catch(() => n.lyric({ id, cookie: cookie() }))
      return {
        lrc:  r.body?.lrc?.lyric || '',
        yrc:  r.body?.yrc?.lyric || '',
        tlyric: r.body?.tlyric?.lyric || ''
      }
    }
  })

  register({
    name: 'ncm.song_detail',
    description: '获取歌曲详情 (时长/专辑/封面等)',
    inputSchema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: ['string','number'] } } },
      required: ['ids']
    },
    handler: async ({ ids }) => {
      const n = await lazyNcm(); if (!n) return { error: 'NeteaseCloudMusicApi 未安装' }
      const r = await n.song_detail({ ids: ids.join(','), cookie: cookie() })
      return (r.body?.songs || []).map(s => ({
        id: s.id, name: s.name,
        artists: (s.ar || []).map(a => ({ id: a.id, name: a.name })),
        album: s.al?.name, album_pic: hiResCover(s.al?.picUrl),
        duration_ms: s.dt
      }))
    }
  })

  register({
    name: 'ncm.analyze_structure',
    description: '基于歌词推断前奏结束 / 尾奏开始 (秒). 无歌词时走兜底值.',
    inputSchema: { type: 'object', properties: { id: { type: ['string','number'] } }, required: ['id'] },
    handler: async ({ id }) => {
      const n = await lazyNcm(); if (!n) return { error: 'NeteaseCloudMusicApi 未安装' }
      const cfg = getConfig().segue || {}
      const fbIntro = cfg.fallback_intro_seconds ?? 12
      const fbOutro = cfg.fallback_outro_seconds ?? 8

      const [d, l] = await Promise.all([
        n.song_detail({ ids: String(id), cookie: cookie() }),
        n.lyric_new({ id, cookie: cookie() }).catch(() => n.lyric({ id, cookie: cookie() }))
      ])
      const dur = (d.body?.songs?.[0]?.dt || 0) / 1000
      const lines = vocalLines(parseLRC(l.body?.lrc?.lyric || ''))
      const introEnd  = lines[0]?.t ?? fbIntro
      const outroStart = lines.length ? Math.min(dur - 1, lines.at(-1).t + 6) : Math.max(0, dur - fbOutro)
      return {
        id, duration: dur,
        introEnd, outroStart,
        source: lines.length ? 'lrc' : 'fallback'
      }
    }
  })

  // ── 推荐 ──────────────────────────────────────────────────────────
  register({
    name: 'ncm.recommend_songs',
    description: '每日推荐歌曲 (需登录)',
    handler: async () => {
      const n = await lazyNcm(); if (!n) return { error: 'NeteaseCloudMusicApi 未安装' }
      const r = await n.recommend_songs({ cookie: cookie() })
      const list = r.body?.data?.dailySongs || []
      return list.map(s => ({
        id: s.id, name: s.name,
        artists: (s.ar || []).map(a => a.name),
        album: s.al?.name, duration_ms: s.dt
      }))
    }
  })

  register({
    name: 'ncm.personal_fm',
    description: '私人 FM 流, 取下一批候选 (需登录)',
    handler: async () => {
      const n = await lazyNcm(); if (!n) return { error: 'NeteaseCloudMusicApi 未安装' }
      const r = await n.personal_fm({ cookie: cookie() })
      const list = r.body?.data || []
      return list.map(s => ({
        id: s.id, name: s.name,
        artists: (s.artists || []).map(a => a.name),
        album: s.album?.name, duration_ms: s.duration
      }))
    }
  })

  register({
    name: 'ncm.simi_song',
    description: '相似歌曲 (用于接龙)',
    inputSchema: { type: 'object', properties: { id: { type: ['string','number'] } }, required: ['id'] },
    handler: async ({ id }) => {
      const n = await lazyNcm(); if (!n) return { error: 'NeteaseCloudMusicApi 未安装' }
      const r = await n.simi_song({ id, cookie: cookie() })
      return (r.body?.songs || []).map(s => ({
        id: s.id, name: s.name,
        artists: (s.artists || []).map(a => a.name),
        album: s.album?.name, duration_ms: s.duration
      }))
    }
  })

  // ── 用户红心 / 歌单 ──────────────────────────────────────────────
  register({
    name: 'ncm.likelist',
    description: '获取我的红心歌曲 ID 列表 (需登录, 需提供 uid)',
    inputSchema: { type: 'object', properties: { uid: { type: ['string','number'] } }, required: ['uid'] },
    handler: async ({ uid }) => {
      const n = await lazyNcm(); if (!n) return { error: 'NeteaseCloudMusicApi 未安装' }
      const r = await n.likelist({ uid, cookie: cookie() })
      return { ids: r.body?.ids || [] }
    }
  })

  register({
    name: 'ncm.user_playlist',
    description: '获取用户的所有歌单 (含创建+收藏, 需登录)',
    inputSchema: { type: 'object', properties: { uid: { type: ['string','number'] }, limit: { type: 'number', default: 100 } }, required: ['uid'] },
    handler: async ({ uid, limit = 100 }) => {
      const n = await lazyNcm(); if (!n) return { error: 'NeteaseCloudMusicApi 未安装' }
      const r = await n.user_playlist({ uid, limit, cookie: cookie() })
      return (r.body?.playlist || []).map(p => ({
        id: p.id, name: p.name, trackCount: p.trackCount,
        creator: p.creator?.nickname, isOwner: p.userId === uid
      }))
    }
  })

  register({
    name: 'ncm.playlist_track_all',
    description: '取一个歌单的全部曲目',
    inputSchema: {
      type: 'object',
      properties: { id: { type: ['string','number'] }, limit: { type: 'number', default: 1000 } },
      required: ['id']
    },
    handler: async ({ id, limit = 1000 }) => {
      const n = await lazyNcm(); if (!n) return { error: 'NeteaseCloudMusicApi 未安装' }
      const r = await n.playlist_track_all({ id, limit, cookie: cookie() })
      return (r.body?.songs || []).map(s => ({
        id: s.id, name: s.name,
        artists: (s.ar || []).map(a => a.name),
        album: s.al?.name, duration_ms: s.dt
      }))
    }
  })

  register({
    name: 'ncm.user_account',
    description: '当前登录用户信息 (用来拿 uid)',
    handler: async () => {
      const n = await lazyNcm(); if (!n) return { error: 'NeteaseCloudMusicApi 未安装' }
      const r = await n.user_account({ cookie: cookie() })
      return {
        uid: r.body?.profile?.userId,
        nickname: r.body?.profile?.nickname,
        loggedIn: !!r.body?.profile
      }
    }
  })

  // ── 评论 (清洗版) ──────────────────────────────────────────────
  register({
    name: 'ncm.comment_hot_clean',
    description: '获取经过清洗的热评 (剔除戾气/无关/打卡/链接, 仅保留有故事性的). 用于电台播报情感线索.',
    inputSchema: {
      type: 'object',
      properties: {
        id:    { type: ['string','number'] },
        limit: { type: 'number', default: 5 }
      },
      required: ['id']
    },
    handler: async ({ id, limit = 5 }) => {
      const n = await lazyNcm(); if (!n) return { error: 'NeteaseCloudMusicApi 未安装' }
      const r = await n.comment_hot({ id, type: 0, cookie: cookie() })
      const all = r.body?.hotComments || []
      const cleaner = makeCleaner(getConfig())
      const picked = []
      for (const c of all) {
        if (cleaner(c.content)) picked.push({ content: c.content, likes: c.likedCount })
        if (picked.length >= limit) break
      }
      return { id, count: picked.length, comments: picked }
    }
  })

  // ── 听歌历史 ────────────────────────────────────────────────────
  // 注: 网易云 record_recent_song / user_record 的字段语义对个人电台用处不大,
  //     且容易诱导 LLM 把"上次播放是 xx 时间"这种元数据念出来. 暂时不暴露.
}
