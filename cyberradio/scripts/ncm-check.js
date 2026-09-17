// 一次性: 验证 cookie 是否生效, 拉账号信息
import 'dotenv/config'
const ncm = await import('NeteaseCloudMusicApi').then(m => m.default || m)

const cookie = process.env.NCM_COOKIE || ''
console.log('cookie 长度:', cookie.length)

const r = await ncm.user_account({ cookie })
const p = r.body?.profile
if (!p) {
  console.log('未登录或 cookie 失效, 原始响应:')
  console.log(JSON.stringify(r.body, null, 2).slice(0, 500))
  process.exit(1)
}
console.log('✓ 登录有效')
console.log('  uid     :', p.userId)
console.log('  昵称     :', p.nickname)
console.log('  VIP type:', p.vipType)

// 再测一下推荐接口能否工作
const rec = await ncm.recommend_songs({ cookie })
const songs = rec.body?.data?.dailySongs || []
console.log(`✓ 每日推荐 ${songs.length} 首, 例: ${songs.slice(0,3).map(s => s.name + ' - ' + (s.ar?.[0]?.name||'')).join(' / ')}`)
