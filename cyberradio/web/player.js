// Cyber Radio — PWA player
// Web Audio: 双槽音乐 (slot A/B 用于 crossfade) + voice 通道, 通过 GainNode 做 ducking
(() => {
  const $ = (id) => document.getElementById(id)
  const log = (...args) => {
    const line = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
    const el = $('log'); if (!el) return
    el.textContent = (new Date().toLocaleTimeString() + '  ' + line + '\n') + el.textContent
  }

  // ── 时钟 / 顶栏状态 ─────────────────────────────────────────────
  const WEEK = ['SUN','MON','TUE','WED','THU','FRI','SAT']
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  function tickClock() {
    const d = new Date()
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    $('clockTime').textContent = `${hh}:${mm}`
    $('clockDay').textContent  = WEEK[d.getDay()]
    $('clockDate').textContent = `${String(d.getDate()).padStart(2, '0')} · ${MONTHS[d.getMonth()]} · ${d.getFullYear()}`
  }
  tickClock(); setInterval(tickClock, 15000)

  function setOnAir(live) {
    $('onairText').textContent = live ? 'ON AIR' : 'OFF AIR'
    $('onairDot').classList.toggle('live', !!live)
  }
  function setConn(state) {
    const cn = $('conn'), cd = $('statusDot')
    if (state === 'connected') { cn.textContent = 'CONNECTED'; cd.className = 'status-dot on' }
    else if (state === 'lost') { cn.textContent = 'DISCONNECTED'; cd.className = 'status-dot off' }
    else                       { cn.textContent = 'CONNECTING';   cd.className = 'status-dot' }
  }

  // ── Tabs ────────────────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'))
      t.classList.add('active')
      const name = t.dataset.tab
      ;['queue','history','mix'].forEach(n => {
        $(`panel-${n}`).hidden = (n !== name)
      })
      if (name === 'queue' || name === 'history') refreshLists()
    })
  })

  // ── 播放历史 / 队列 列表渲染 ────────────────────────────────────
  function bigCoverSafe(url) { try { return bigCover(url) } catch { return url } }
  function makeListItem(idx, song) {
    const li = document.createElement('li')
    li.className = 'list-item'
    const cover = song.cover ? bigCoverSafe(song.cover) : ''
    li.innerHTML = `
      <span class="idx">${String(idx).padStart(2, '0')}</span>
      <span class="thumb"${cover ? ` style="background-image:url('${cover}')"` : ''}></span>
      <span class="info">
        <span class="t"></span>
        <span class="a"></span>
      </span>
      <span class="meta"></span>
    `
    li.querySelector('.t').textContent = song.title  || ('#' + (song.songId || '?'))
    li.querySelector('.a').textContent = song.artist || '—'
    if (song.playedAt) {
      const d = new Date(song.playedAt)
      li.querySelector('.meta').textContent =
        `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    } else if (song.album) {
      li.querySelector('.meta').textContent = song.album
    }
    return li
  }
  let _refreshing = false
  async function refreshLists() {
    if (_refreshing) return
    _refreshing = true
    try {
      const r = await fetch('/api/state', { cache: 'no-store' })
      if (!r.ok) return
      const j = await r.json()
      const s = j.state || {}
      const queue   = Array.isArray(s.queue)  ? s.queue  : []
      const recent  = Array.isArray(s.recent) ? s.recent : []

      const qList = $('queueList')
      if (qList) {
        qList.innerHTML = ''
        if (!queue.length) {
          const li = document.createElement('li')
          li.className = 'empty'
          li.textContent = '— 没有等待中的曲目 —'
          qList.appendChild(li)
        } else {
          queue.forEach((sg, i) => qList.appendChild(makeListItem(i + 1, sg)))
        }
      }
      const hList = $('historyList')
      if (hList) {
        hList.innerHTML = ''
        if (!recent.length) {
          const li = document.createElement('li')
          li.className = 'empty'
          li.textContent = '— 还没有播放历史 —'
          hList.appendChild(li)
        } else {
          recent.forEach((sg, i) => hList.appendChild(makeListItem(i + 1, sg)))
        }
      }
      const qc = $('queueCount'),  hc = $('historyCount')
      if (qc) qc.textContent = (s.queueLength != null ? s.queueLength : queue.length)
      if (hc) hc.textContent = recent.length
    } catch (err) {
      log('refreshLists err', err.message)
    } finally {
      _refreshing = false
    }
  }
  // 起步刷一次 + 定时兜底 (防漏 WS 事件)
  refreshLists()
  setInterval(refreshLists, 15000)

  // ── Audio 图 ─────────────────────────────────────────────────────
  let ctx
  let voiceEl, voiceSrc, voiceGain
  let busGain, duckGain, userMusicNode, masterGain
  // 双槽: 每槽独立 audio + analyser + gain (gain 用作归一化 + crossfade)
  const slots = { A: null, B: null }
  let activeSlot = 'A'  // 当前主播槽
  let userMusicGain = 1.0
  let userVoiceBase = 2.2
  // 归一化参数 (所有槽共用)
  const norm = {
    targetRms: 0.12, minGain: 0.4, maxGain: 2.5,
    sampleStartMs: 1500, sampleDurMs: 3500, rampMs: 1200, enabled: true
  }
  let audioReady = false

  function makeSlot(name) {
    const el  = new Audio(); el.crossOrigin = 'anonymous'; el.preload = 'auto'
    const src = ctx.createMediaElementSource(el)
    const gain = ctx.createGain(); gain.gain.value = 0  // 默认静音, crossfade 时再拉起
    const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0
    const buf = new Float32Array(analyser.fftSize)
    src.connect(analyser)
    src.connect(gain).connect(busGain)
    const slot = {
      name, el, src, gain, analyser, buf,
      song: null, songId: null,
      normalized: false, normTimer: null, normSamples: [],
      targetGain: 1.0  // 归一化算出的目标 gain (crossfade 时拉到这个值)
    }
    // 进度上报: 仅 active slot 上报, 避免双槽都发 progress
    el.addEventListener('timeupdate', () => {
      if (slot !== slots[activeSlot]) return
      if (!ws || ws.readyState !== 1 || !slot.song) return
      ws.send(JSON.stringify({
        type: 'progress', songId: slot.songId,
        t: el.currentTime, dur: el.duration || slot.song.duration || 0,
        paused: el.paused
      }))
      $('bar').style.width = (el.duration ? (el.currentTime / el.duration * 100) : 0) + '%'
      $('t').textContent = fmt(el.currentTime)
      $('d').textContent = fmt(el.duration || slot.song.duration || 0)
      pushPositionState(el)
    })
    el.addEventListener('play',  () => { if (slot === slots[activeSlot] && 'mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing' })
    el.addEventListener('pause', () => { if (slot === slots[activeSlot] && 'mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused' })
    el.addEventListener('ended', () => {
      // 仅 active slot 的自然结束才往 server 报 song_end (兜底, crossfade 已经先于此触发)
      if (slot !== slots[activeSlot]) return
      log('song_end (natural)')
      ws?.send(JSON.stringify({ type: 'song_end', songId: slot.songId }))
      slot.song = null; slot.songId = null
      updateMediaSession(null); setOnAir(false)
      refreshLists()
    })
    el.addEventListener('error', () => {
      log(`slot ${name} load err code=` + el.error?.code)
      if (slot === slots[activeSlot]) $('hint').textContent = '⚠ 音频加载失败 (code ' + el.error?.code + ')'
    })
    return slot
  }

  function ensureAudio() {
    if (ctx) return
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    busGain        = ctx.createGain(); busGain.gain.value = 1
    duckGain       = ctx.createGain(); duckGain.gain.value = 1
    userMusicNode  = ctx.createGain(); userMusicNode.gain.value = userMusicGain
    masterGain     = ctx.createGain(); masterGain.gain.value = 1
    busGain.connect(duckGain).connect(userMusicNode).connect(masterGain).connect(ctx.destination)

    voiceEl  = new Audio(); voiceEl.crossOrigin = 'anonymous'; voiceEl.preload = 'auto'
    voiceSrc = ctx.createMediaElementSource(voiceEl)
    voiceGain = ctx.createGain(); voiceGain.gain.value = userVoiceBase
    voiceSrc.connect(voiceGain).connect(masterGain)
    voiceEl.addEventListener('ended', () => {
      log('speak_end'); ws?.send(JSON.stringify({ type: 'speak_end' }))
    })
    voiceEl.addEventListener('error', () => {
      log('voice load err', 'code=' + voiceEl.error?.code)
      ws?.send(JSON.stringify({ type: 'speak_end' }))
    })

    slots.A = makeSlot('A')
    slots.B = makeSlot('B')
  }

  // 解锁
  async function unlockAudio() {
    ensureAudio()
    try { await ctx.resume() } catch {}
    audioReady = true
    $('unlock').hidden = true
    log('audio unlocked')
    if (pendingSong) { doPlayInitial(pendingSong); pendingSong = null }
  }
  $('unlock').addEventListener('click', unlockAudio)
  document.addEventListener('click', unlockAudio, { once: true })
  document.addEventListener('keydown', unlockAudio, { once: true })

  function fmt(s) { s = Math.floor(s||0); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}` }
  function ramp(gainParam, target, ms) {
    const t = ctx.currentTime
    gainParam.cancelScheduledValues(t)
    gainParam.setValueAtTime(gainParam.value, t)
    gainParam.linearRampToValueAtTime(target, t + Math.max(0.01, ms / 1000))
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

  // ── 归一化: 针对单个槽位 ──
  function startNormalizeSlot(slot) {
    if (!norm.enabled) return
    slot.normalized = false
    slot.normSamples = []
    clearTimeout(slot.normTimer)
    const songId = slot.songId
    slot.normTimer = setTimeout(() => {
      if (slot.songId !== songId) return
      const tickMs = 200
      const n = Math.max(1, Math.floor(norm.sampleDurMs / tickMs))
      let i = 0
      const tick = () => {
        if (slot.songId !== songId) return
        slot.analyser.getFloatTimeDomainData(slot.buf)
        let sum = 0
        for (let j = 0; j < slot.buf.length; j++) sum += slot.buf[j] * slot.buf[j]
        const r = Math.sqrt(sum / slot.buf.length)
        if (r > 0.005) slot.normSamples.push(r)
        if (++i < n) slot.normTimer = setTimeout(tick, tickMs)
        else applyNormalizeSlot(slot, songId)
      }
      tick()
    }, norm.sampleStartMs)
  }
  function applyNormalizeSlot(slot, songId) {
    if (slot.songId !== songId) return
    const arr = slot.normSamples
    if (!arr.length) { log(`[${slot.name}] normalize: 没采到信号`); slot.normalized = true; return }
    arr.sort((a, b) => a - b)
    const rms = arr[Math.floor(arr.length * 0.7)]
    let g = clamp(norm.targetRms / rms, norm.minGain, norm.maxGain)
    log(`[${slot.name}] normalize: rms=${rms.toFixed(3)} → gain=${g.toFixed(2)}`)
    slot.targetGain = g
    slot.normalized = true
    // 仅当当前是 active slot 才立刻 ramp (非 active 槽是 crossfade 期间会自己拉到这个目标)
    if (slot === slots[activeSlot]) ramp(slot.gain.gain, g, norm.rampMs)
  }

  // 网易云 CDN 升清: 强制 512x512
  function bigCover(url) {
    if (!url) return url
    if (/[?&]param=/.test(url)) return url.replace(/([?&]param=)\d+y\d+/, '$1512y512')
    return url + (url.includes('?') ? '&' : '?') + 'param=512y512'
  }

  // ── MediaSession ──
  function updateMediaSession(song) {
    if (!('mediaSession' in navigator)) return
    if (!song || !song.songId) {
      navigator.mediaSession.metadata = null
      navigator.mediaSession.playbackState = 'none'
      document.title = 'Cyber Radio'; return
    }
    const cover = bigCover(song.cover)
    const artwork = cover ? [
      { src: cover, sizes: '96x96',   type: 'image/jpeg' },
      { src: cover, sizes: '192x192', type: 'image/jpeg' },
      { src: cover, sizes: '512x512', type: 'image/jpeg' }
    ] : []
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  song.title  || '未知歌曲',
      artist: song.artist || '未知艺人',
      album:  song.album  || '',
      artwork
    })
    document.title = `${song.title || '?'} — ${song.artist || '?'}`
    try {
      const el = slots[activeSlot]?.el
      navigator.mediaSession.setActionHandler('play',          () => { el?.play().catch(()=>{}) })
      navigator.mediaSession.setActionHandler('pause',         () => { el?.pause() })
      navigator.mediaSession.setActionHandler('nexttrack',     () => { ws?.send(JSON.stringify({ type: 'request_skip' })) })
      navigator.mediaSession.setActionHandler('previoustrack', null)
      navigator.mediaSession.setActionHandler('seekto', (d) => {
        if (el && d.seekTime != null) { el.currentTime = d.seekTime }
      })
    } catch {}
  }
  function pushPositionState(el) {
    if (!('mediaSession' in navigator) || !el) return
    if (typeof navigator.mediaSession.setPositionState !== 'function') return
    const dur = el.duration || 0
    if (!dur || !isFinite(dur)) return
    try {
      navigator.mediaSession.setPositionState({
        duration: dur,
        position: Math.max(0, Math.min(el.currentTime || 0, dur)),
        playbackRate: el.playbackRate || 1
      })
    } catch {}
  }

  // ── 状态 ────────────────────────────────────────────────────────
  let pendingSong = null
  let cfg = { mix: { duck_level: 0.25, duck_ramp_ms: 600, unduck_ramp_ms: 600 } }

  // ── 渲染 ────────────────────────────────────────────────────────
  function renderCurrent(song) {
    if (!song || !song.songId) {
      $('title').textContent  = '未在播放'; $('artist').textContent = '—'
      $('cover').style.backgroundImage = ''; $('hint').textContent = ''
      $('bar').style.width = '0%'; $('t').textContent = '0:00'; $('d').textContent = '0:00'
      return
    }
    $('title').textContent  = song.title  || ('#' + song.songId)
    $('artist').textContent = song.artist || '—'
    $('cover').style.backgroundImage = song.cover ? `url("${bigCover(song.cover)}")` : ''
    if (song.introEnd != null && song.outroStart != null) {
      $('hint').textContent = `intro≈${Number(song.introEnd).toFixed(0)}s · outro≈${Number(song.outroStart).toFixed(0)}s`
    } else {
      $('hint').textContent = ''
    }
  }

  // ── 播放: 首次起播 (用当前 active slot, 直接拉到目标 gain) ──
  function doPlayInitial(song) {
    const slot = slots[activeSlot]
    // 重置另一槽
    const other = slots[activeSlot === 'A' ? 'B' : 'A']
    try { other.el.pause(); other.el.removeAttribute('src'); other.el.load() } catch {}
    other.gain.gain.cancelScheduledValues(ctx.currentTime); other.gain.gain.value = 0
    other.song = null; other.songId = null

    slot.song = song; slot.songId = song.songId
    slot.el.src = song.url
    slot.el.play().catch(err => log('play err', err.message))
    // 先静音, 等 'playing' 后拉满 (避免咔嗒声)
    slot.gain.gain.cancelScheduledValues(ctx.currentTime); slot.gain.gain.value = 0
    const onPlaying = () => {
      slot.el.removeEventListener('playing', onPlaying)
      ramp(slot.gain.gain, 1.0, 200)  // 先到 1, 归一化采样后会 ramp 到 targetGain
    }
    slot.el.addEventListener('playing', onPlaying, { once: true })

    renderCurrent(song); updateMediaSession(song)
    startNormalizeSlot(slot)
    log(`[${slot.name}] play_initial`, song.title || song.url)
  }

  // ── 交叉淡入: 把 active slot 切给 next, 同时新槽淡入 / 旧槽淡出 ──
  function doCrossfade(song, fadeMs = 4000) {
    if (!audioReady) { doPlayInitial(song); return }
    const oldName = activeSlot
    const newName = oldName === 'A' ? 'B' : 'A'
    const oldSlot = slots[oldName], newSlot = slots[newName]

    newSlot.song = song; newSlot.songId = song.songId
    newSlot.el.src = song.url
    newSlot.gain.gain.cancelScheduledValues(ctx.currentTime); newSlot.gain.gain.value = 0
    newSlot.normalized = false; newSlot.targetGain = 1.0
    newSlot.el.play().catch(err => log('crossfade play err', err.message))

    const onPlaying = () => {
      newSlot.el.removeEventListener('playing', onPlaying)
      // 新槽 fade in 到 1.0 (归一化稍后会接管)
      ramp(newSlot.gain.gain, 1.0, fadeMs)
      // 旧槽 fade out 到 0
      ramp(oldSlot.gain.gain, 0, fadeMs)
      // active 立刻切, 让 progress 上报新 songId
      activeSlot = newName
      renderCurrent(song); updateMediaSession(song)
      startNormalizeSlot(newSlot)
      // fadeMs 后停掉旧槽 + 清 src 释放资源
      setTimeout(() => {
        try { oldSlot.el.pause(); oldSlot.el.removeAttribute('src'); oldSlot.el.load() } catch {}
        oldSlot.song = null; oldSlot.songId = null
        log(`[${oldName}→${newName}] crossfade done`)
      }, fadeMs + 200)
    }
    newSlot.el.addEventListener('playing', onPlaying, { once: true })
    log(`[${oldName}→${newName}] crossfade ${fadeMs}ms`, song.title || song.url)
  }

  // ── Prefetch: 让浏览器提前把 mp3 拉到 HTTP 缓存 ──
  const prefetchPool = []
  function prefetchUrls(urls) {
    if (!Array.isArray(urls)) return
    for (const u of urls) {
      if (!u) continue
      if (prefetchPool.find(a => a.src === u)) continue
      const a = new Audio(); a.crossOrigin = 'anonymous'; a.preload = 'auto'; a.src = u
      try { a.load() } catch {}
      prefetchPool.push(a)
      // 只保留最近 8 个引用, 旧的让 GC
      if (prefetchPool.length > 8) prefetchPool.shift()
    }
    log('prefetch', urls.length, 'urls')
  }

  // ── WS ──────────────────────────────────────────────────────────
  let ws
  function connect() {
    setConn('connecting')
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/stream`
    ws = new WebSocket(url)
    ws.onopen  = () => setConn('connected')
    ws.onclose = () => {
      setConn('lost'); setOnAir(false)
      setTimeout(connect, 1500)
    }
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data) } catch { return }
      handle(m)
    }
  }
  function handle(m) {
    if (m.type === 'hello') {
      cfg = m.config || cfg; applyCfgUI()
      const cur = m.state?.current
      if (cur && cur.songId) {
        renderCurrent(cur); updateMediaSession(cur); setOnAir(true)
        if (!audioReady) {
          $('unlock').hidden = false
          pendingSong = cur
          $('hint').textContent = '点击页面任意位置以恢复声音'
        } else {
          doPlayInitial(cur)
        }
      } else {
        renderCurrent(null); updateMediaSession(null); setOnAir(false)
      }
      refreshLists()
      log('hello connected')
      return
    }
    if (m.type === 'prefetch') { prefetchUrls(m.urls); return }
    if (m.type === 'play_music') {
      const song = m.song || { url: m.url }
      setOnAir(true); refreshLists()
      if (!audioReady) {
        pendingSong = song
        renderCurrent(song); $('unlock').hidden = false
        $('hint').textContent = '点击页面任意位置以启动播放'
        log('queued (locked)', song.title || song.url)
        return
      }
      doPlayInitial(song); return
    }
    if (m.type === 'crossfade_to') {
      const song = m.song || { url: m.url }
      setOnAir(true); refreshLists()
      if (!audioReady) { pendingSong = song; return }
      doCrossfade(song, m.fadeMs ?? 4000); return
    }
    if (m.type === 'speak') {
      if (!audioReady) { ws?.send(JSON.stringify({ type: 'speak_end' })); return }
      voiceEl.src = m.url
      const slot = slots[activeSlot]
      const musicHasStarted = slot?.el && !slot.el.paused && slot.el.currentTime > 0.05
      const fire = () => {
        voiceEl.play().catch(err => {
          log('speak err', err.message); ws?.send(JSON.stringify({ type: 'speak_end' }))
        })
      }
      if (musicHasStarted) fire()
      else if (slot?.el) {
        const onPlaying = () => { slot.el.removeEventListener('playing', onPlaying); fire() }
        slot.el.addEventListener('playing', onPlaying, { once: true })
        setTimeout(() => { slot.el.removeEventListener('playing', onPlaying); if (voiceEl.paused) fire() }, 1200)
      } else { fire() }
      log('speak', m.url); return
    }
    if (m.type === 'duck')   { if (audioReady) ramp(duckGain.gain, m.level ?? 0.25, m.ms ?? 600); log('duck', m.level); return }
    if (m.type === 'unduck') { if (audioReady) ramp(duckGain.gain, 1, m.ms ?? 600); log('unduck'); return }
    if (m.type === 'pause')  { slots[activeSlot]?.el.pause(); return }
    if (m.type === 'resume') { slots[activeSlot]?.el.play().catch(()=>{}); return }
    if (m.type === 'stop')   {
      for (const k of ['A','B']) {
        const s = slots[k]; if (!s) continue
        try { s.el.pause(); s.el.currentTime = 0 } catch {}
        s.song = null; s.songId = null
      }
      renderCurrent(null); updateMediaSession(null); setOnAir(false); refreshLists(); return
    }
    if (m.type === 'volume') { ensureAudio(); masterGain.gain.value = m.level ?? 1; $('vol').value = m.level ?? 1; return }
    if (m.type === 'config') { cfg = m.payload; applyCfgUI(); return }
  }
  function applyCfgUI() {
    const mix = cfg.mix || {}
    $('duck').value = mix.duck_level ?? 0.25
    $('duckV').textContent = (mix.duck_level ?? 0.25).toFixed(2)
    $('ramp').value = mix.duck_ramp_ms ?? 600
    $('rampV').textContent = (mix.duck_ramp_ms ?? 600)
  }

  // ── UI ──
  $('btnPlay').onclick = () => {
    unlockAudio()
    const el = slots[activeSlot]?.el
    if (!el) return
    if (el.paused) el.play().catch(()=>{}); else el.pause()
  }
  $('btnSkip').onclick = () => { ws?.send(JSON.stringify({ type: 'request_skip' })) }
  $('btnStop').onclick = () => { ws?.send(JSON.stringify({ type: 'request_stop' })) }
  $('vol').oninput  = (e) => {
    ensureAudio()
    const v = parseFloat(e.target.value)
    masterGain.gain.value = v; $('volV').textContent = v.toFixed(2)
  }
  $('musicVol').oninput = (e) => {
    ensureAudio()
    userMusicGain = parseFloat(e.target.value)
    if (userMusicNode) userMusicNode.gain.value = userMusicGain
    $('musicVolV').textContent = userMusicGain.toFixed(2)
  }
  $('voiceVol').oninput = (e) => {
    ensureAudio()
    userVoiceBase = parseFloat(e.target.value)
    if (voiceGain) voiceGain.gain.value = userVoiceBase
    $('voiceVolV').textContent = userVoiceBase.toFixed(1)
  }
  $('duck').oninput = (e) => {
    const v = parseFloat(e.target.value); $('duckV').textContent = v.toFixed(2)
    cfg.mix.duck_level = v
    ws?.send(JSON.stringify({ type: 'set_config', payload: { mix: { duck_level: v } } }))
  }
  $('ramp').oninput = (e) => {
    const v = parseInt(e.target.value); $('rampV').textContent = v
    cfg.mix.duck_ramp_ms = v; cfg.mix.unduck_ramp_ms = v
    ws?.send(JSON.stringify({ type: 'set_config', payload: { mix: { duck_ramp_ms: v, unduck_ramp_ms: v } } }))
  }

  connect()
})()
