'use strict'
const db = require('../db')
const { loi } = require('../errors')
const { z, phanTich, uuid, phanTrangTuQuery, boc, layId } = require('../validate')
const { dang } = require('../registry')
const { idTrongPham } = require('../phamvi')
const { dungThietBi } = require('./auth')

const NHOM = 'Thiết bị'

const COT = `d.id, d.tai_khoan_id, t.ten_dang_nhap, t.ho_ten, d.ma_thiet_bi, d.ten, d.kich_hoat_luc, d.het_han_luc, d.hoat_dong`
const TU = 'FROM thiet_bi d JOIN tai_khoan t ON t.id = d.tai_khoan_id'

dang({
  method: 'get', path: '/thiet-bi', quyen: 'thiet_bi.xem', nhom: NHOM,
  tom_tat: 'Danh sách thiết bị đã kích hoạt',
  tham_so: 'Query: trang, so_luong, tai_khoan_id',
  ghi_chu: 'Người dùng thường chỉ thấy thiết bị của mình; quản trị thấy tất cả.',
  xuLy: async (req, res) => {
    const p = phanTrangTuQuery(req.query)
    const f = phanTich(z.object({ tai_khoan_id: uuid.optional() }).passthrough(), req.query, 'query')
    const ids = await idTrongPham(req, req.pham_vi)
    if (f.tai_khoan_id && ids !== null && !ids.includes(f.tai_khoan_id)) throw loi.khongCoQuyen('Tài khoản nằm ngoài phạm vi được xem')
    const tham = [ids, f.tai_khoan_id || null]
    const dk = '($1::uuid[] IS NULL OR d.tai_khoan_id = ANY($1)) AND ($2::uuid IS NULL OR d.tai_khoan_id = $2)'
    const tong = (await db.query(`SELECT count(*)::int AS n ${TU} WHERE ${dk}`, tham)).rows[0].n
    const rows = (await db.query(`SELECT ${COT} ${TU} WHERE ${dk} ORDER BY d.kich_hoat_luc DESC, d.id LIMIT $3 OFFSET $4`, [...tham, p.so_luong, p.offset])).rows
    res.json(boc(rows, p, tong))
  },
})

dang({
  method: 'post', path: '/thiet-bi', quyen: 'thiet_bi.dang_ky', nhom: NHOM,
  tom_tat: 'Đăng ký (kích hoạt) thiết bị Android cho chính mình',
  tham_so: 'Body: ma_thiet_bi, ten (tuỳ chọn)',
  ket_qua: '201 + thiết bị (200 nếu đã đăng ký cho chính tài khoản này)',
  ghi_chu: 'Thiết bị đã gắn tài khoản khác bị từ chối (403); quản trị chuyển thiết bị bằng PATCH.',
  xuLy: async (req, res) => {
    const b = phanTich(z.object({ ma_thiet_bi: z.string().trim().min(1).max(100), ten: z.string().trim().max(150).optional() }).strict(), req.body)
    const cu = (await db.query('SELECT 1 FROM thiet_bi WHERE ma_thiet_bi = $1 AND tai_khoan_id = $2', [b.ma_thiet_bi, req.user.id])).rows[0]
    const id = await db.giaoDich(c => dungThietBi(c, req.user, b.ma_thiet_bi, b.ten))
    const r = (await db.query(`SELECT ${COT} ${TU} WHERE d.id = $1`, [id])).rows[0]
    res.status(cu ? 200 : 201).json(r)
  },
})

const suaSchema = z.object({
  ten: z.string().trim().max(150).nullable().optional(),
  hoat_dong: z.boolean().optional(),
  het_han_luc: z.string().datetime({ offset: true }).nullable().optional(),
  tai_khoan_id: uuid.optional(),
}).strict()

dang({
  method: 'patch', path: '/thiet-bi/:id', quyen: 'thiet_bi.quan_ly', nhom: NHOM,
  tom_tat: 'Khóa, gia hạn, đổi tên hoặc chuyển thiết bị sang tài khoản khác',
  tham_so: 'Body: ten, hoat_dong, het_han_luc (null = không hết hạn), tai_khoan_id',
  ghi_chu: 'Khóa hoặc chuyển thiết bị làm access token gắn thiết bị đó bị từ chối ngay ở lần gọi kế tiếp và thu hồi refresh token của thiết bị.',
  xuLy: async (req, res) => {
    const id = layId(req)
    const b = phanTich(suaSchema, req.body)
    if (!Object.keys(b).length) throw loi.yeuCauSai('Không có trường nào để sửa')
    await db.giaoDich(async c => {
      const cu = (await c.query('SELECT id FROM thiet_bi WHERE id = $1 FOR UPDATE', [id])).rows[0]
      if (!cu) throw loi.khongThay('Không tìm thấy thiết bị')
      if (b.tai_khoan_id) {
        const t = (await c.query('SELECT hoat_dong FROM tai_khoan WHERE id = $1', [b.tai_khoan_id])).rows[0]
        if (!t || !t.hoat_dong) throw loi.duLieuSai('Tài khoản nhận thiết bị không tồn tại hoặc đã bị khóa', [{ truong: 'tai_khoan_id', thong_diep: 'Không hợp lệ' }])
      }
      const sets = []
      const val = []
      for (const k of ['ten', 'hoat_dong', 'het_han_luc', 'tai_khoan_id']) {
        if (b[k] !== undefined) { val.push(b[k]); sets.push(`${k} = $${val.length}`) }
      }
      val.push(id)
      await c.query(`UPDATE thiet_bi SET ${sets.join(', ')} WHERE id = $${val.length}`, val)
      if (b.hoat_dong === false || b.tai_khoan_id) {
        await c.query('UPDATE phien_dang_nhap SET thu_hoi_luc = now() WHERE thiet_bi_id = $1 AND thu_hoi_luc IS NULL', [id])
      }
    })
    res.json((await db.query(`SELECT ${COT} ${TU} WHERE d.id = $1`, [id])).rows[0])
  },
})
