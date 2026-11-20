'use strict'
const config = require('./config')
const db = require('./db')
const nhatKy = require('./services/nhatKy')
const { taoApp, TIEN_TO } = require('./app')

const MOT_NGAY_MS = 24 * 60 * 60 * 1000

async function donNhatKy() {
  try {
    const kq = await db.giaoDich(c => nhatKy.donQuaHan(c))
    console.log(`[don nhat ky] da xoa ${kq.so_dong_da_xoa} dong cu hon ${kq.luu_tru_ngay} ngay`)
  } catch (e) {
    console.error('[don nhat ky] loi:', e.message)
  }
}

async function main() {
  await db.query('SELECT 1') // loi som neu CSDL khong ket noi duoc
  const app = taoApp({ ghiNhatKyYeuCau: true })
  const server = app.listen(config.port, () => console.log(`POTECO backend: http://localhost:${config.port}${TIEN_TO}`))

  let hen = null
  if (config.donNhatKyTuDong) {
    donNhatKy()
    hen = setInterval(donNhatKy, MOT_NGAY_MS)
    hen.unref()
  }

  const tat = (tin) => {
    console.log(`Nhan ${tin}, dang tat...`)
    if (hen) clearInterval(hen)
    server.close(async () => { await db.dong(); process.exit(0) })
    setTimeout(() => process.exit(1), 10000).unref()
  }
  process.on('SIGTERM', () => tat('SIGTERM'))
  process.on('SIGINT', () => tat('SIGINT'))
}

main().catch(e => { console.error(e); process.exit(1) })
