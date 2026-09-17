// env.* — 天气 / 当下时间
import axios from 'axios'

// ── 时间 ────────────────────────────────────────────────────────────
function getNow() {
  const d = new Date()
  return {
    iso: d.toISOString(),
    local: d.toLocaleString('zh-CN', { hour12: false }),
    weekday: ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()],
    period: ['深夜','凌晨','早晨','上午','中午','下午','傍晚','晚上'][Math.floor(d.getHours() / 3)],
    hour: d.getHours(), minute: d.getMinutes()
  }
}

// ── 和风天气 ────────────────────────────────────────────────────────
async function fetchWeather(location) {
  const key = process.env.QWEATHER_KEY
  const loc = location || process.env.QWEATHER_LOCATION
  if (!key) return { error: 'QWEATHER_KEY 未配置', stub: true }
  if (!loc) return { error: 'QWEATHER_LOCATION 未配置', stub: true }
  // 和风新规: 个人开发者要用专属 API Host (xxx.qweatherapi.com), 公共域名 2026 起逐步停服
  // 优先读 QWEATHER_HOST, 兜底 devapi.qweather.com (老 KEY 仍可用)
  let host = (process.env.QWEATHER_HOST || 'devapi.qweather.com').trim()
  host = host.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const url = `https://${host}/v7/weather/now?location=${encodeURIComponent(loc)}`
  const r = await axios.get(url, {
    timeout: 8000,
    headers: { 'X-QW-Api-Key': key, 'Accept-Encoding': 'gzip' }
  })
  const now = r.data?.now
  if (!now) return { raw: r.data }
  return {
    text: now.text, temp: now.temp, feelsLike: now.feelsLike,
    humidity: now.humidity, wind: `${now.windDir} ${now.windScale}级`,
    obsTime: now.obsTime
  }
}

export function registerEnvTools(register) {
  register({
    name: 'env.get_now',
    description: '当前时间 + 时段 + 星期 (不需任何 key)',
    handler: async () => getNow()
  })

  register({
    name: 'env.get_weather',
    description: '当前天气 (和风天气). 不传 location 用 .env 默认',
    inputSchema: { type: 'object', properties: { location: { type: 'string' } } },
    handler: async ({ location } = {}) => fetchWeather(location)
  })
}
