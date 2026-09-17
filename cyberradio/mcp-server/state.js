// 全局运行态 (单进程内)
// 注: 不持久化, 持久化数据走 mem.* 工具
export const state = {
  current: {
    songId: null,
    title: null,
    artist: null,
    album: null,
    cover: null,
    url: null,
    duration: 0,        // 秒
    progress: 0,        // 秒
    introEnd: null,     // 秒, null 表示未知
    outroStart: null,
    startedAt: 0,       // ms timestamp
    paused: false
  },
  queue: [],            // 待播队列 [{songId, title, artist, url, duration, introEnd, outroStart}]
  recentPlays: [],      // 最近 50 首
  pwaConnected: 0,      // 当前 WS 连接数
  speaking: false       // 是否正在 TTS 播报
}

export function pushRecent(item) {
  state.recentPlays.unshift({ ...item, playedAt: Date.now() })
  state.recentPlays = state.recentPlays.slice(0, 50)
}

export function snapshot() {
  return {
    current: { ...state.current },
    queue: state.queue.slice(0, 20),
    queueLength: state.queue.length,
    pwaConnected: state.pwaConnected,
    speaking: state.speaking,
    recent: state.recentPlays.slice(0, 30)
  }
}
