'use strict'
const db = require('../db')
const { loi } = require('../errors')
const { z, phanTich, uuid, phanTrangTuQuery, boc, layId } = require('../validate')
const { dang } = require('../registry')
const { idTrongPham, trongPham } = require('../phamvi')
const { VAI_TRO, QUYEN } = require('../permissions')
const matKhau = require('../auth/matkhau')

const NHOM = 'Tài khoản và vai trò'

const COT = `t.id, t.ten_dang_nhap, t.ho_ten, v.ma AS vai_tro, v.ten AS vai_tro_ten, t.quan_ly_id,
  ql.ho_ten AS quan_ly_ho_ten, t.hoat_dong, t.tao_luc, t.cap_nhat_luc`
const TU = `FROM tai_khoan t JOIN vai_tro v ON v.id = t.vai_tro_id LEFT JOIN tai_khoan ql ON ql.id = t.quan_ly_id`

async function layTaiKhoan(req, q, id) {
  const t = (await q.query(`SELECT ${COT} ${TU} WHERE t.id = $1`, [id])).rows[0]
  const ids = await idTrongPham(req, req.pham_vi, q)
  if (!t || !trongPham(ids, t.id)) throw loi.khongThay('Không tìm thấy tài khoản')
  return t
}

async function layVaiTro(q, ma) {
  const v = (await q.query('SELECT id, ma, cap_quan_ly FROM vai_tro WHERE ma = $1', [ma])).rows[0]
  if (!v) throw loi.duLieuSai('Vai trò không tồn tại', [{ truong: 'vai_tro', thong_diep: `Không có vai trò ${ma}` }])
  return v
}

/** Quan ly truc tiep phai la nguoi dang hoat dong, cap cao hon cap cua nguoi duoc quan ly, va khong phai quan tri. */
async function kiemTraQuanLy(q, quanLyId, capNguoiDuocQuanLy, taiKhoanId) {
  if (quanLyId === null || quanLyId === undefined) return
  if (taiKhoanId && quanLyId === taiKhoanId) throw loi.duLieuSai('Không thể tự quản lý chính mình', [{ truong: 'quan_ly_id', thong_diep: 'Trùng chính tài khoản' }])
  const ql = (await q.query(
    'SELECT t.id, t.hoat_dong, v.ma, v.cap_quan_ly FROM tai_khoan t JOIN vai_tro v ON v.id = t.vai_tro_id WHERE t.id = $1', [quanLyId])).rows[0]
  const sai = (m) => loi.duLieuSai(m, [{ truong: 'quan_ly_id', thong_diep: m }])
  if (!ql || !ql.hoat_dong) throw sai('Người quản lý không tồn tại hoặc đã bị khóa')
  if (ql.ma === 'quan_tri') throw sai('Quản trị hệ thống không làm người quản lý trực tiếp')
  if (ql.cap_quan_ly <= capNguoiDuocQuanLy) throw sai('Người quản lý phải có cấp quản lý cao hơn')
  if (taiKhoanId) {
    const vong = (await q.query(
      `WITH RECURSIVE cay AS (
         SELECT id FROM tai_khoan WHERE id = $1
         UNION SELECT t.id FROM tai_khoan t JOIN cay c ON t.quan_ly_id = c.id)
       SELECT 1 FROM cay WHERE id = $2`, [taiKhoanId, quanLyId])).rows[0]
    if (vong) throw sai('Người quản lý không được là cấp dưới của chính tài khoản này')
  }
}

const TEN_DANG_NHAP = z.string().trim().regex(/^[A-Za-z0-9._-]{3,60}$/, '3-60 ký tự gồm chữ, số, . _ -')
const MA_VAI_TRO = z.enum(VAI_TRO.map(v => v.ma))

dang({
  method: 'get', path: '/vai-tro', quyen: 'vai_tro.xem', nhom: NHOM,
  tom_tat: 'Danh sách vai trò và quyền của từng vai trò (ma trận phân quyền)',
  ket_qua: '{ vai_tro: [{ ma, ten, cap_quan_ly, la_ke_toan, quyen }], quyen: [{ ma, nhom, mo_ta }] }',
  xuLy: async (_req, res) => {
    const rows = (await db.query('SELECT ma, ten, cap_quan_ly, la_ke_toan FROM vai_tro ORDER BY cap_quan_ly, ma')).rows
    res.json({
      vai_tro: rows.map(r => ({
        ...r,
        quyen: Object.fromEntries(Object.entries(QUYEN).filter(([, q]) => q.ma_tran[r.ma]).map(([k, q]) => [k, q.ma_tran[r.ma]])),
      })),
      quyen: Object.entries(QUYEN).map(([ma, q]) => ({ ma, nhom: q.nhom, mo_ta: q.mo_ta })),
    })
  },
})

dang({
  method: 'get', path: '/tai-khoan', quyen: 'tai_khoan.xem', nhom: NHOM,
  tom_tat: 'Danh sách tài khoản trong phạm vi được xem',
  tham_so: 'Query: trang, so_luong, q (tên đăng nhập / họ tên), vai_tro, hoat_dong (true|false), quan_ly_id',
  ket_qua: 'Phân trang { du_lieu, phan_trang }',
  ghi_chu: 'Nhân viên chỉ thấy chính mình; quản lý thấy cả nhánh cấp dưới; quản trị thấy tất cả.',
  xuLy: async (req, res) => {
    const p = phanTrangTuQuery(req.query)
    const f = phanTich(z.object({
      q: z.string().trim().max(100).optional(), vai_tro: MA_VAI_TRO.optional(),
      hoat_dong: z.enum(['true', 'false']).optional(), quan_ly_id: uuid.optional(),
    }).passthrough(), req.query, 'query')
    const ids = await idTrongPham(req, req.pham_vi)
    const tham = [ids, f.q ? `%${f.q.replace(/[%_\\]/g, m => '\\' + m)}%` : null, f.vai_tro || null,
      f.hoat_dong === undefined ? null : f.hoat_dong === 'true', f.quan_ly_id || null]
    const dk = `($1::uuid[] IS NULL OR t.id = ANY($1))
      AND ($2::text IS NULL OR t.ten_dang_nhap ILIKE $2 OR t.ho_ten ILIKE $2)
      AND ($3::text IS NULL OR v.ma = $3) AND ($4::boolean IS NULL OR t.hoat_dong = $4)
      AND ($5::uuid IS NULL OR t.quan_ly_id = $5) AND t.ten_dang_nhap <> 'he_thong'`
    const tong = (await db.query(`SELECT count(*)::int AS n ${TU} WHERE ${dk}`, tham)).rows[0].n
    const rows = (await db.query(`SELECT ${COT} ${TU} WHERE ${dk} ORDER BY t.ho_ten, t.id LIMIT $6 OFFSET $7`, [...tham, p.so_luong, p.offset])).rows
    res.json(boc(rows, p, tong))
  },
})

dang({
  method: 'get', path: '/tai-khoan/:id', quyen: 'tai_khoan.xem', nhom: NHOM,
  tom_tat: 'Chi tiết một tài khoản',
  ghi_chu: 'Ngoài phạm vi trả 404.',
  xuLy: async (req, res) => res.json(await layTaiKhoan(req, db, layId(req))),
})

const taoSchema = z.object({
  ten_dang_nhap: TEN_DANG_NHAP,
  mat_khau: z.string().min(1).max(200),
  ho_ten: z.string().trim().min(1).max(150),
  vai_tro: MA_VAI_TRO,
  quan_ly_id: uuid.nullable().optional(),
}).strict()

dang({
  method: 'post', path: '/tai-khoan', quyen: 'tai_khoan.tao', nhom: NHOM,
  tom_tat: 'Tạo tài khoản',
  tham_so: 'Body: ten_dang_nhap, mat_khau, ho_ten, vai_tro, quan_ly_id (tuỳ chọn)',
  ket_qua: '201 + tài khoản',
  ghi_chu: 'Người quản lý phải đang hoạt động, có cấp quản lý cao hơn và không phải quản trị. Tên đăng nhập không phân biệt hoa thường.',
  xuLy: async (req, res) => {
    const b = phanTich(taoSchema, req.body)
    const yeu = matKhau.kiemTraDoManh(b.mat_khau)
    if (yeu) throw loi.duLieuSai(yeu, [{ truong: 'body.mat_khau', thong_diep: yeu }])
    const hash = await matKhau.bam(b.mat_khau)
    const id = await db.giaoDich(async c => {
      const v = await layVaiTro(c, b.vai_tro)
      await kiemTraQuanLy(c, b.quan_ly_id, v.cap_quan_ly, null)
      return (await c.query(
        `INSERT INTO tai_khoan (ten_dang_nhap, mat_khau_hash, ho_ten, vai_tro_id, quan_ly_id)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`, [b.ten_dang_nhap, hash, b.ho_ten, v.id, b.quan_ly_id || null])).rows[0].id
    })
    res.status(201).json(await layTaiKhoan({ ...req, pham_vi: 'T' }, db, id))
  },
})

const suaSchema = z.object({
  ho_ten: z.string().trim().min(1).max(150).optional(),
  vai_tro: MA_VAI_TRO.optional(),
  quan_ly_id: uuid.nullable().optional(),
  hoat_dong: z.boolean().optional(),
}).strict()

dang({
  method: 'patch', path: '/tai-khoan/:id', quyen: 'tai_khoan.sua', nhom: NHOM,
  tom_tat: 'Sửa họ tên, vai trò, người quản lý, trạng thái hoạt động',
  tham_so: 'Body: ho_ten, vai_tro, quan_ly_id (null = bỏ), hoat_dong',
  ghi_chu: 'Không tự khóa hoặc đổi vai trò của chính mình. Khóa tài khoản thu hồi mọi phiên đăng nhập. Không cho tạo vòng quản lý.',
  xuLy: async (req, res) => {
    const id = layId(req)
    const b = phanTich(suaSchema, req.body)
    if (!Object.keys(b).length) throw loi.yeuCauSai('Không có trường nào để sửa')
    if (id === req.user.id && (b.hoat_dong === false || (b.vai_tro && b.vai_tro !== req.user.vai_tro))) {
      throw loi.duLieuSai('Không thể tự khóa hoặc đổi vai trò của chính mình')
    }
    await db.giaoDich(async c => {
      const cu = (await c.query(
        'SELECT t.id, t.vai_tro_id, t.quan_ly_id, v.cap_quan_ly FROM tai_khoan t JOIN vai_tro v ON v.id = t.vai_tro_id WHERE t.id = $1 FOR UPDATE', [id])).rows[0]
      if (!cu) throw loi.khongThay('Không tìm thấy tài khoản')
      const v = b.vai_tro ? await layVaiTro(c, b.vai_tro) : { id: cu.vai_tro_id, cap_quan_ly: cu.cap_quan_ly }
      const quanLy = b.quan_ly_id === undefined ? cu.quan_ly_id : b.quan_ly_id
      if (b.vai_tro || b.quan_ly_id !== undefined) {
        await kiemTraQuanLy(c, quanLy, v.cap_quan_ly, id)
        const cap = (await c.query(
          `SELECT 1 FROM tai_khoan t JOIN vai_tro r ON r.id = t.vai_tro_id
            WHERE t.quan_ly_id = $1 AND r.cap_quan_ly >= $2 LIMIT 1`, [id, v.cap_quan_ly])).rows[0]
        if (cap) throw loi.duLieuSai('Vai trò mới có cấp thấp hơn hoặc bằng cấp dưới đang quản lý', [{ truong: 'vai_tro', thong_diep: 'Chuyển cấp dưới trước' }])
      }
      const sets = []
      const val = []
      const them = (cot, x) => { val.push(x); sets.push(`${cot} = $${val.length}`) }
      if (b.ho_ten !== undefined) them('ho_ten', b.ho_ten)
      if (b.vai_tro) them('vai_tro_id', v.id)
      if (b.quan_ly_id !== undefined) them('quan_ly_id', b.quan_ly_id)
      if (b.hoat_dong !== undefined) them('hoat_dong', b.hoat_dong)
      val.push(id)
      await c.query(`UPDATE tai_khoan SET ${sets.join(', ')} WHERE id = $${val.length}`, val)
      if (b.hoat_dong === false) {
        await c.query('UPDATE phien_dang_nhap SET thu_hoi_luc = now() WHERE tai_khoan_id = $1 AND thu_hoi_luc IS NULL', [id])
      }
    })
    res.json(await layTaiKhoan({ ...req, pham_vi: 'T' }, db, id))
  },
})

dang({
  method: 'post', path: '/tai-khoan/:id/dat-lai-mat-khau', quyen: 'tai_khoan.dat_lai_mat_khau', nhom: NHOM,
  tom_tat: 'Đặt lại mật khẩu của tài khoản khác; thu hồi mọi phiên đăng nhập của họ',
  tham_so: 'Body: mat_khau_moi',
  ket_qua: '{ da_dat_lai: true }',
  xuLy: async (req, res) => {
    const id = layId(req)
    const b = phanTich(z.object({ mat_khau_moi: z.string().min(1).max(200) }).strict(), req.body)
    const yeu = matKhau.kiemTraDoManh(b.mat_khau_moi)
    if (yeu) throw loi.duLieuSai(yeu, [{ truong: 'body.mat_khau_moi', thong_diep: yeu }])
    const hash = await matKhau.bam(b.mat_khau_moi)
    await db.giaoDich(async c => {
      const r = await c.query('UPDATE tai_khoan SET mat_khau_hash = $1 WHERE id = $2 AND ten_dang_nhap <> \'he_thong\'', [hash, id])
      if (!r.rowCount) throw loi.khongThay('Không tìm thấy tài khoản')
      await c.query('UPDATE phien_dang_nhap SET thu_hoi_luc = now() WHERE tai_khoan_id = $1 AND thu_hoi_luc IS NULL', [id])
    })
    res.json({ da_dat_lai: true })
  },
})

module.exports = { layVaiTro }
