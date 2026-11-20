'use strict'
const { z } = require('zod')
const { loi } = require('./errors')

/** Chay schema, nem loi 422 co danh sach truong sai. */
function phanTich(schema, du_lieu, vung = 'body') {
  const kq = schema.safeParse(du_lieu === undefined ? {} : du_lieu)
  if (!kq.success) {
    const chiTiet = kq.error.issues.map(i => ({
      truong: [vung, ...i.path].join('.'),
      thong_diep: i.message,
    }))
    throw loi.duLieuSai('Dữ liệu không hợp lệ', chiTiet)
  }
  return kq.data
}

const uuid = z.string().uuid('Phải là UUID')
const kinhDo = z.number().min(-180).max(180)
const viDo = z.number().min(-90).max(90)

/** Chuoi rong -> null; cat khoang trang. */
const chuoiTuyChon = (max = 200) =>
  z.preprocess(v => {
    if (v === undefined) return undefined
    if (v === null) return null
    if (typeof v === 'string') { const t = v.trim(); return t === '' ? null : t }
    return v
  }, z.string().max(max).nullable().optional())

/** Boolean chap nhan "true"/"false" (KML cu luu dang chuoi). */
const boolLong = z.preprocess(v => {
  if (v === 'true') return true
  if (v === 'false') return false
  return v
}, z.boolean())

const ngay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng YYYY-MM-DD')
  .refine(s => !Number.isNaN(Date.parse(s + 'T00:00:00Z')), 'Ngày không tồn tại')

/** Tham so phan trang trong query: trang (>=1), so_luong (1..200). */
const phanTrangSchema = z.object({
  trang: z.coerce.number().int().min(1).default(1),
  so_luong: z.coerce.number().int().min(1).max(200).default(50),
})

function phanTrangTuQuery(query) {
  const p = phanTich(phanTrangSchema, query, 'query')
  return { trang: p.trang, so_luong: p.so_luong, offset: (p.trang - 1) * p.so_luong }
}

function boc(du_lieu, p, tong) {
  return { du_lieu, phan_trang: { trang: p.trang, so_luong: p.so_luong, tong } }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Lay tham so duong dan dang UUID; sai dinh dang -> 400 thay vi loi CSDL 500. */
function layId(req, ten = 'id') {
  const v = req.params[ten]
  if (typeof v !== 'string' || !UUID_RE.test(v)) {
    throw loi.yeuCauSai(`Tham số ${ten} phải là UUID`)
  }
  return v.toLowerCase()
}

module.exports = {
  z, phanTich, uuid, kinhDo, viDo, chuoiTuyChon, boolLong, ngay,
  phanTrangSchema, phanTrangTuQuery, boc, layId,
}
