// 网易云扫码登录 — 拿 cookie 写入 .env
//
// 用法: npm run ncm:login
// 终端会打印 ASCII 二维码, 手机网易云 app "扫一扫" 登录, 等几秒终端会写入 .env 的 NCM_COOKIE
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import qrcode from 'qrcode-terminal'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_FILE = path.resolve(__dirname, '../.env')

async function main() {
  const ncm = await import('NeteaseCloudMusicApi')
  const api = ncm.default || ncm

  console.log('▶ 申请二维码 key …')
  const k = await api.login_qr_key({ timestamp: Date.now() })
  const unikey = k.body?.data?.unikey
  if (!unikey) throw new Error('拿不到 unikey: ' + JSON.stringify(k.body))

  const c = await api.login_qr_create({ key: unikey, qrimg: false, timestamp: Date.now() })
  const qrUrl = c.body?.data?.qrurl
  if (!qrUrl) throw new Error('拿不到 qrurl: ' + JSON.stringify(c.body))

  console.log('▶ 用网易云 App 扫描下方二维码:\n')
  qrcode.generate(qrUrl, { small: true })
  console.log('\n   (或者复制此 URL 用其他工具生成二维码再扫:\n    ' + qrUrl + ' )\n')

  // 轮询
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const s = await api.login_qr_check({ key: unikey, timestamp: Date.now() })
    const code = s.body?.code
    if (code === 800) throw new Error('二维码已失效, 请重试')
    if (code === 801) process.stdout.write('.')                         // 等待扫码
    if (code === 802) process.stdout.write('o')                         // 扫码成功, 等待确认
    if (code === 803) {
      const cookie = s.body?.cookie
      if (!cookie) throw new Error('登录成功但未拿到 cookie')
      writeCookie(cookie)
      console.log('\n✓ 登录成功. cookie 已写入 .env (NCM_COOKIE)')
      return
    }
  }
  throw new Error('超时未登录')
}

function writeCookie(cookie) {
  let env = ''
  if (fs.existsSync(ENV_FILE)) env = fs.readFileSync(ENV_FILE, 'utf8')
  // 只保留 MUSIC_U=...; __csrf=...; 等关键字段已经够, 此处直接整串塞入
  const oneLine = cookie.replace(/[\r\n]+/g, ' ')
  const lines = env.split('\n').filter(l => !l.startsWith('NCM_COOKIE='))
  lines.push(`NCM_COOKIE=${JSON.stringify(oneLine)}`)
  fs.writeFileSync(ENV_FILE, lines.join('\n'), 'utf8')
}

main().catch((e) => { console.error('\n[fatal]', e?.message || e); process.exit(1) })
