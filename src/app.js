'use strict'
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const config = require('./config')
const { AppError } = require('./errors')
const { router } = require('./routes')

const TIEN_TO = '/api/v1'

/** Ten rang buoc CSDL -> thong diep de hieu. */
const RANG_BUOC = {
  ux_tuyen_ten_trong_du_an: 'Tên tuyến đã tồn tại trong dự án này',
  ux_tai_khoan_ten_dang_nhap: 'Tên đăng nhập đã tồn tại',
  thiet_bi_ma_thiet_bi_key: 'Mã thiết bị đã được đăng ký',
  dm_loai_cong_trinh_ma_key: 'Mã loại công trình đã tồn tại',
}

function anhXaLoiPg(err) {
  switch (err.code) {
    case '23505': return new AppError(409, 'XUNG_DOT', RANG_BUOC[err.constraint] || 'Dữ liệu bị trùng')
    case '23503': return new AppError(422, 'DU_LIEU_KHONG_HOP_LE', 'Dữ liệu tham chiếu đến mục không tồn tại')
    case '23502': return new AppError(422, 'DU_LIEU_KHONG_HOP_LE', 'Thiếu dữ liệu bắt buộc')
    case '23514': return new AppError(422, 'DU_LIEU_KHONG_HOP_LE', 'Dữ liệu vi phạm ràng buộc')
    case '22003': return new AppError(422, 'DU_LIEU_KHONG_HOP_LE', 'Giá trị số vượt giới hạn')
    case '22001': return new AppError(422, 'DU_LIEU_KHONG_HOP_LE', 'Chuỗi quá dài')
    case '22P02': return new AppError(400, 'YEU_CAU_KHONG_HOP_LE', 'Giá trị sai định dạng')
    case '40001':
    case '40P01': return new AppError(409, 'XUNG_DOT', 'Xung đột đồng thời, hãy thử lại')
    default: return null
  }
}

function taoApp({ ghiNhatKyYeuCau = false } = {}) {
  const app = express()
  app.disable('x-powered-by')
  if (config.trustProxy) app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy)

  app.use(helmet())
  app.use(cors({
    origin: config.corsOrigins.length ? config.corsOrigins : false,
    exposedHeaders: ['Content-Disposition'],
    maxAge: 600,
  }))
  app.use(express.json({ limit: '20mb' }))
  app.use(express.text({ type: ['application/xml', 'text/xml', 'text/plain', 'application/vnd.google-earth.kml+xml'], limit: '50mb' }))

  if (ghiNhatKyYeuCau) {
    app.use((req, res, next) => {
      const t = Date.now()
      res.on('finish', () => console.log(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Date.now() - t}ms`))
      next()
    })
  }

  // Mac dinh chi mount /api/v1. Sau reverse proxy (vd https://host/api_poteco) dat API_PREFIX
  // cho khop, ke ca khi proxy cat hoac khong cat tien to.
  const tienTo = config.apiPrefix.length ? config.apiPrefix : [TIEN_TO]
  for (const p of [...new Set(tienTo)]) app.use(p, router)

  app.use((_req, _res, next) => next(new AppError(404, 'KHONG_TIM_THAY', 'Đường dẫn không tồn tại')))

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    let e = err
    if (!(e instanceof AppError)) {
      if (e && e.type === 'entity.parse.failed') e = new AppError(400, 'YEU_CAU_KHONG_HOP_LE', 'Nội dung gửi lên không phải JSON hợp lệ')
      else if (e && e.type === 'entity.too.large') e = new AppError(413, 'NOI_DUNG_QUA_LON', 'Nội dung gửi lên quá lớn')
      else if (e && e.type === 'charset.unsupported') e = new AppError(415, 'YEU_CAU_KHONG_HOP_LE', 'Bảng mã không được hỗ trợ')
      else e = (e && e.code && anhXaLoiPg(e)) || null
    }
    if (!e) {
      console.error(`[loi] ${req.method} ${req.originalUrl.split('?')[0]}:`, err && err.stack ? err.stack : err)
      e = new AppError(500, 'LOI_MAY_CHU', 'Lỗi máy chủ')
    }
    if (res.headersSent) return
    const loi = { ma: e.ma, thong_diep: e.message }
    if (e.chiTiet !== undefined) loi.chi_tiet = e.chiTiet
    res.status(e.status).json({ loi })
  })

  return app
}

module.exports = { taoApp, TIEN_TO }
