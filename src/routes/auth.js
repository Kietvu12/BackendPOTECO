'use strict'
const db = require('../db')
const config = require('../config')
const { loi } = require('../errors')
const { z, phanTich } = require('../validate')
const { dang } = require('../registry')
const { phamVi, quyenCuaVaiTro } = require('../permissions')
const matKhau = require('../auth/matkhau')
const token = require('../auth/token')

const NHOM = 'Xác thực'

// ------------------------------------------------------------ gioi han dang nhap sai
// Trong bo nho: du cho mot may chu. Nhieu may chu can chuyen sang kho dung chung (Redis...).
const sai = new Map() // khoa -> { so, khoaDen }
const khoaGioiHan = (tenDangNhap, ip) => `${tenDangNhap.toLowerCase()}|${ip}`

function kiemTraKhoa(khoa) {
  const e = sai.get(khoa)
  if (e && e.khoaDen && e.khoaDen > Date.now()) throw loi.quaNhieuLan()
  if (e && e.khoaDen && e.khoaDen <= Date.now()) sai.delete(khoa)
}
function ghiSai(khoa) {
  const e = sai.get(khoa) || { so: 0, khoaDen: 0 }
  e.so += 1
  if (e.so >= config.dangNhapSaiToiDa) e.khoaDen = Date.now() + config.dangNhapKhoaPhut * 60 * 1000
  sai.set(khoa, e)
  if (sai.size > 10000) { // chong day bo nho
    for (const [k, v] of sai) if (!v.khoaDen || v.khoaDen < Date.now()) sai.delete(k)
  }
}
function xoaSai() { sai.clear() }

let hashGia = null
async function hashGiaDeCanBangThoiGian() {
  if (!hashGia) hashGia = await matKhau.bam('khong-ai-dung-mat-khau-nay-1')
  return hashGia
}

// ------------------------------------------------------------ thiet bi

/** Tim hoac dang ky thiet bi cho chinh nguoi dung. Thiet bi chi thuoc ve mot tai khoan. */
async function dungThietBi(c, user, maThietBi, tenThietBi) {
  const ton = (await c.query(
    'SELECT id, tai_khoan_id, hoat_dong, het_han_luc FROM thiet_bi WHERE ma_thiet_bi = $1 FOR UPDATE', [maThietBi])).rows[0]
  if (ton) {
    if (ton.tai_khoan_id !== user.id) throw loi.khongCoQuyen('Thiết bị đang gắn với tài khoản khác. Liên hệ quản trị để chuyển thiết bị')
    if (!ton.hoat_dong || (ton.het_han_luc && ton.het_han_luc < new Date())) throw loi.khongCoQuyen('Thiết bị đã bị khóa hoặc hết hạn')
    return ton.id
  }
  if (!phamVi(user.vai_tro, 'thiet_bi.dang_ky')) throw loi.khongCoQuyen('Vai trò này không được đăng ký thiết bị')
  return (await c.query(
    'INSERT INTO thiet_bi (tai_khoan_id, ma_thiet_bi, ten) VALUES ($1,$2,$3) RETURNING id',
    [user.id, maThietBi, tenThietBi || null])).rows[0].id
}

async function phatToken(c, user, thietBiId) {
  const rf = token.taoRefresh()
  await c.query(
    `INSERT INTO phien_dang_nhap (tai_khoan_id, thiet_bi_id, ma_bam, het_han_luc)
     VALUES ($1,$2,$3, now() + make_interval(days => $4))`,
    [user.id, thietBiId, rf.maBam, config.refreshTtlNgay])
  return {
    access_token: token.taoAccess({ id: user.id, vai_tro: user.vai_tro }, thietBiId),
    token_type: 'Bearer',
    het_han_giay: config.jwtTtlGiay,
    refresh_token: rf.token,
    refresh_het_han_ngay: config.refreshTtlNgay,
  }
}

const hoSo = (u) => ({
  id: u.id, ten_dang_nhap: u.ten_dang_nhap, ho_ten: u.ho_ten, vai_tro: u.vai_tro, vai_tro_ten: u.vai_tro_ten,
  quan_ly_id: u.quan_ly_id || null,
})

const TRUY_VAN_USER = `
  SELECT t.id, t.ten_dang_nhap, t.mat_khau_hash, t.ho_ten, t.hoat_dong, t.quan_ly_id,
         v.ma AS vai_tro, v.ten AS vai_tro_ten
    FROM tai_khoan t JOIN vai_tro v ON v.id = t.vai_tro_id`

// ------------------------------------------------------------ route

const dangNhapSchema = z.object({
  ten_dang_nhap: z.string().trim().min(1).max(60),
  mat_khau: z.string().min(1).max(200),
  ma_thiet_bi: z.string().trim().min(1).max(100).optional(),
  ten_thiet_bi: z.string().trim().max(150).optional(),
}).strict()

dang({
  method: 'post', path: '/auth/dang-nhap', quyen: 'cong_khai', nhom: NHOM,
  tom_tat: 'Đăng nhập, nhận access token và refresh token',
  tham_so: 'Body: ten_dang_nhap, mat_khau, ma_thiet_bi (Android, tuỳ chọn), ten_thiet_bi (tuỳ chọn)',
  ket_qua: 'access_token, refresh_token, het_han_giay, tai_khoan, quyen (map quyền -> phạm vi), thiet_bi_id',
  ghi_chu: 'Sai quá DANG_NHAP_SAI_TOI_DA lần với cùng tên đăng nhập + IP bị khoá DANG_NHAP_KHOA_PHUT phút (429). Gửi ma_thiet_bi lần đầu sẽ đăng ký thiết bị cho tài khoản (nếu vai trò được phép); thiết bị thuộc tài khoản khác bị từ chối (403).',
  xuLy: async (req, res) => {
    const b = phanTich(dangNhapSchema, req.body)
    const khoa = khoaGioiHan(b.ten_dang_nhap, req.ip)
    kiemTraKhoa(khoa)
    const u = (await db.query(`${TRUY_VAN_USER} WHERE lower(t.ten_dang_nhap) = lower($1)`, [b.ten_dang_nhap])).rows[0]
    const dung = await matKhau.kiemTra(b.mat_khau, u ? u.mat_khau_hash : await hashGiaDeCanBangThoiGian())
    if (!u || !dung || !u.hoat_dong) {
      ghiSai(khoa)
      throw loi.sai()
    }
    sai.delete(khoa)
    const kq = await db.giaoDich(async c => {
      const tb = b.ma_thiet_bi ? await dungThietBi(c, u, b.ma_thiet_bi, b.ten_thiet_bi) : null
      return { ...(await phatToken(c, u, tb)), thiet_bi_id: tb }
    })
    res.json({ ...kq, tai_khoan: hoSo(u), quyen: quyenCuaVaiTro(u.vai_tro) })
  },
})

const lamMoiSchema = z.object({ refresh_token: z.string().min(10).max(200) }).strict()

dang({
  method: 'post', path: '/auth/lam-moi', quyen: 'cong_khai', nhom: NHOM,
  tom_tat: 'Đổi refresh token lấy cặp token mới (xoay vòng)',
  tham_so: 'Body: refresh_token',
  ket_qua: 'access_token, refresh_token mới',
  ghi_chu: 'Refresh token dùng một lần. Dùng lại token đã đổi bị coi là bị lộ: mọi phiên của tài khoản bị thu hồi.',
  xuLy: async (req, res) => {
    const b = phanTich(lamMoiSchema, req.body)
    const maBam = token.bamRefresh(b.refresh_token)
    const kq = await db.giaoDich(async c => {
      const p = (await c.query(
        'SELECT id, tai_khoan_id, thiet_bi_id, het_han_luc, thu_hoi_luc FROM phien_dang_nhap WHERE ma_bam = $1 FOR UPDATE', [maBam])).rows[0]
      if (!p) throw loi.chuaDangNhap('Refresh token không hợp lệ')
      if (p.thu_hoi_luc) {
        await c.query('UPDATE phien_dang_nhap SET thu_hoi_luc = now() WHERE tai_khoan_id = $1 AND thu_hoi_luc IS NULL', [p.tai_khoan_id])
        return { thuHoiTatCa: true }
      }
      if (p.het_han_luc < new Date()) throw loi.chuaDangNhap('Refresh token đã hết hạn')
      const u = (await c.query(`${TRUY_VAN_USER} WHERE t.id = $1`, [p.tai_khoan_id])).rows[0]
      if (!u || !u.hoat_dong) throw loi.chuaDangNhap('Tài khoản không tồn tại hoặc đã bị khóa')
      if (p.thiet_bi_id) {
        const tb = (await c.query('SELECT hoat_dong, het_han_luc FROM thiet_bi WHERE id = $1', [p.thiet_bi_id])).rows[0]
        if (!tb || !tb.hoat_dong || (tb.het_han_luc && tb.het_han_luc < new Date())) throw loi.chuaDangNhap('Thiết bị đã bị khóa hoặc hết hạn')
      }
      await c.query('UPDATE phien_dang_nhap SET thu_hoi_luc = now() WHERE id = $1', [p.id])
      return { ...(await phatToken(c, u, p.thiet_bi_id)), thiet_bi_id: p.thiet_bi_id }
    })
    if (kq.thuHoiTatCa) throw loi.chuaDangNhap('Refresh token đã được sử dụng. Mọi phiên đã bị thu hồi, hãy đăng nhập lại')
    res.json(kq)
  },
})

const dangXuatSchema = z.object({
  refresh_token: z.string().min(10).max(200).optional(),
  tat_ca: z.boolean().optional(),
}).strict()

dang({
  method: 'post', path: '/auth/dang-xuat', quyen: 'dang_nhap', nhom: NHOM,
  tom_tat: 'Đăng xuất: thu hồi refresh token',
  tham_so: 'Body: refresh_token (thu hồi token đó) hoặc tat_ca = true (mọi thiết bị)',
  ket_qua: '{ so_phien_thu_hoi }',
  ghi_chu: 'Access token còn hiệu lực đến khi hết hạn (JWT_TTL_GIAY); ứng dụng cần bỏ token khỏi bộ nhớ.',
  xuLy: async (req, res) => {
    const b = phanTich(dangXuatSchema, req.body)
    let r
    if (b.tat_ca) {
      r = await db.query('UPDATE phien_dang_nhap SET thu_hoi_luc = now() WHERE tai_khoan_id = $1 AND thu_hoi_luc IS NULL', [req.user.id])
    } else if (b.refresh_token) {
      r = await db.query(
        'UPDATE phien_dang_nhap SET thu_hoi_luc = now() WHERE ma_bam = $1 AND tai_khoan_id = $2 AND thu_hoi_luc IS NULL',
        [token.bamRefresh(b.refresh_token), req.user.id])
    } else {
      throw loi.duLieuSai('Cần refresh_token hoặc tat_ca = true')
    }
    res.json({ so_phien_thu_hoi: r.rowCount })
  },
})

dang({
  method: 'get', path: '/auth/toi', quyen: 'dang_nhap', nhom: NHOM,
  tom_tat: 'Thông tin tài khoản đang đăng nhập và các quyền của vai trò',
  ket_qua: 'tai_khoan, quyen (map quyền -> T/C/B), thiet_bi_id',
  xuLy: async (req, res) => {
    res.json({ tai_khoan: hoSo(req.user), quyen: quyenCuaVaiTro(req.user.vai_tro), thiet_bi_id: req.thietBiId })
  },
})

const doiMatKhauSchema = z.object({
  mat_khau_cu: z.string().min(1).max(200),
  mat_khau_moi: z.string().min(1).max(200),
}).strict()

dang({
  method: 'post', path: '/auth/doi-mat-khau', quyen: 'dang_nhap', nhom: NHOM,
  tom_tat: 'Đổi mật khẩu của chính mình; thu hồi mọi refresh token',
  tham_so: 'Body: mat_khau_cu, mat_khau_moi (>= 8 ký tự, có chữ và số)',
  ket_qua: '{ da_doi: true }',
  xuLy: async (req, res) => {
    const b = phanTich(doiMatKhauSchema, req.body)
    const u = (await db.query('SELECT mat_khau_hash FROM tai_khoan WHERE id = $1', [req.user.id])).rows[0]
    if (!(await matKhau.kiemTra(b.mat_khau_cu, u.mat_khau_hash))) throw loi.sai('Mật khẩu cũ không đúng')
    const yeu = matKhau.kiemTraDoManh(b.mat_khau_moi)
    if (yeu) throw loi.duLieuSai(yeu, [{ truong: 'body.mat_khau_moi', thong_diep: yeu }])
    const hash = await matKhau.bam(b.mat_khau_moi)
    await db.giaoDich(async c => {
      await c.query('UPDATE tai_khoan SET mat_khau_hash = $1 WHERE id = $2', [hash, req.user.id])
      await c.query('UPDATE phien_dang_nhap SET thu_hoi_luc = now() WHERE tai_khoan_id = $1 AND thu_hoi_luc IS NULL', [req.user.id])
    })
    res.json({ da_doi: true })
  },
})

module.exports = { xoaGioiHanDangNhap: xoaSai, dungThietBi }
