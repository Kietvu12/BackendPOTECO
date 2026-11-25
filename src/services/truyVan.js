'use strict'
const db = require('../db')
const { loi } = require('../errors')
const { z, phanTich, uuid, ngay, kinhDo, viDo, phanTrangTuQuery, boc } = require('../validate')
const { idTrongPham } = require('../phamvi')
const nhatKy = require('./nhatKy')
const tuyenSv = require('./tuyen')

/**
 * Cac truy van doc cho nhat ky, lich su theo ngay va bao cao.
 * Ngay (YYYY-MM-DD) luon hieu theo gio Viet Nam; moc [tu, den) duoc tinh ben tham so
 * (khong boc cot trong ham) de van dung duoc chi muc theo thoi gian.
 */

const GIOI_HAN_XUAT = 50000

const HANH_DONG = ['tao', 'luu', 'sua', 'gui', 'dong_bo']
const LOAI_LUU = ['hien_truong', 'chinh_sua_sau']

const LOC_NGAY = z.object({
  tu_ngay: ngay.optional(),
  den_ngay: ngay.optional(),
})

const nhatKySchema = LOC_NGAY.extend({
  tai_khoan_id: uuid.optional(),
  tuyen_id: uuid.optional(),
  hanh_dong: z.enum(HANH_DONG).optional(),
  loai_luu: z.enum(LOAI_LUU).optional(),
  nguon_diem: z.enum(['gps', 'cham_ban_do', 'keo_tha', 'chen_giua', 'nhap_kml']).optional(),
}).passthrough()

function kiemTraKhoang(f) {
  if (f.tu_ngay && f.den_ngay && f.tu_ngay > f.den_ngay) {
    throw loi.duLieuSai('Khoảng ngày không hợp lệ', [{ truong: 'query.tu_ngay', thong_diep: 'tu_ngay phải <= den_ngay' }])
  }
}

/** Nguoi duoc xem phai nam trong pham vi; tra ve danh sach id (null = tat ca). */
async function phamViNguoi(req, taiKhoanId) {
  const ids = await idTrongPham(req, req.pham_vi)
  if (taiKhoanId && ids !== null && !ids.includes(taiKhoanId)) {
    throw loi.khongCoQuyen('Tài khoản nằm ngoài phạm vi được xem')
  }
  return ids
}

// --------------------------------------------------------------- nhat ky

const NHAT_KY_DIEU_KIEN = (cot) => `
      ($1::uuid[] IS NULL OR n.tai_khoan_id = ANY($1))
  AND ($2::uuid IS NULL OR n.tai_khoan_id = $2)
  AND ($3::uuid IS NULL OR n.tuyen_id = $3)
  AND ($4::text IS NULL OR n.hanh_dong = $4)
  AND ($5::text IS NULL OR n.loai_luu = $5)
  AND ($6::text IS NULL OR n.nguon_diem = $6)
  AND ($7::date IS NULL OR n.${cot} >= ($7::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
  AND ($8::date IS NULL OR n.${cot} <  (($8::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))`

const NHAT_KY_COT = `
  n.id, n.tai_khoan_id, tk.ten_dang_nhap, tk.ho_ten, n.thiet_bi_id, tb.ma_thiet_bi,
  n.tuyen_id, t.ten_tuyen, n.phien_ban_id, pb.so_phien_ban, n.hanh_dong, n.loai_luu,
  n.thoi_gian_thiet_bi, n.thoi_gian_server, n.gps_kinh_do, n.gps_vi_do, n.gps_do_chinh_xac_m,
  n.nguon_diem, n.chi_tiet`
const NHAT_KY_TU = `
  FROM nhat_ky_thao_tac n
  JOIN tai_khoan tk ON tk.id = n.tai_khoan_id
  LEFT JOIN thiet_bi tb ON tb.id = n.thiet_bi_id
  LEFT JOIN tuyen t ON t.id = n.tuyen_id
  LEFT JOIN tuyen_phien_ban pb ON pb.id = n.phien_ban_id`

async function thamSoNhatKy(req, query) {
  const f = phanTich(nhatKySchema, query, 'query')
  kiemTraKhoang(f)
  const ids = await phamViNguoi(req, f.tai_khoan_id)
  return [ids, f.tai_khoan_id || null, f.tuyen_id || null, f.hanh_dong || null, f.loai_luu || null,
    f.nguon_diem || null, f.tu_ngay || null, f.den_ngay || null]
}

async function danhSachNhatKy(req, query) {
  const p = phanTrangTuQuery(query)
  const tham = await thamSoNhatKy(req, query)
  const dk = NHAT_KY_DIEU_KIEN('thoi_gian_server')
  const tong = (await db.query(`SELECT count(*)::int AS n FROM nhat_ky_thao_tac n WHERE ${dk}`, tham)).rows[0].n
  const rows = (await db.query(
    `SELECT ${NHAT_KY_COT} ${NHAT_KY_TU} WHERE ${dk}
      ORDER BY n.thoi_gian_server DESC, n.id DESC LIMIT $9 OFFSET $10`,
    [...tham, p.so_luong, p.offset])).rows
  return boc(rows, p, tong)
}

async function nhatKyDeXuat(req, query) {
  const tham = await thamSoNhatKy(req, query)
  const dk = NHAT_KY_DIEU_KIEN('thoi_gian_server')
  const rows = (await db.query(
    `SELECT ${NHAT_KY_COT} ${NHAT_KY_TU} WHERE ${dk}
      ORDER BY n.thoi_gian_server DESC, n.id DESC LIMIT $9`, [...tham, GIOI_HAN_XUAT + 1])).rows
  const cat = rows.length > GIOI_HAN_XUAT
  return { rows: cat ? rows.slice(0, GIOI_HAN_XUAT) : rows, bi_cat: cat }
}

const suKienSchema = z.object({
  hanh_dong: z.enum(['gui', 'dong_bo']),
  tuyen_id: uuid.optional(),
  thoi_gian_thiet_bi: z.string().datetime({ offset: true }).optional(),
  gps: z.object({ kinh_do: kinhDo, vi_do: viDo, do_chinh_xac_m: z.number().min(0).optional() }).optional(),
  chi_tiet: z.record(z.string(), z.unknown()).optional(),
}).strict()

/** Ung dung gui su kien "gui" / "dong_bo" cua chinh nguoi dung (III.1). */
async function ghiSuKien(req, body) {
  const b = phanTich(suKienSchema, body)
  return db.giaoDich(async c => {
    if (b.tuyen_id) await tuyenSv.layTuyen({ ...req, pham_vi: 'B' }, c, b.tuyen_id)
    const r = await nhatKy.ghi(c, {
      tai_khoan_id: req.user.id, thiet_bi_id: req.thietBiId, tuyen_id: b.tuyen_id,
      hanh_dong: b.hanh_dong, thoi_gian_thiet_bi: b.thoi_gian_thiet_bi, gps: b.gps,
      chi_tiet: b.chi_tiet,
    })
    return { id: r.id, thoi_gian_server: r.thoi_gian_server }
  })
}

// --------------------------------------------------------------- lich su theo ngay

const lichSuSchema = z.object({
  ngay,
  tai_khoan_id: uuid.optional(),
}).passthrough()

/**
 * III.5: voi mot ngay, moi nhan vien da luu nhung tuyen nao, tuyen cuoi cung trong ngay la tuyen nao.
 * Du lieu lay tu phien ban (khong bi don theo han luu tru nhat ky).
 */
async function lichSuTheoNgay(req, query) {
  const f = phanTich(lichSuSchema, query, 'query')
  const ids = await phamViNguoi(req, f.tai_khoan_id)
  const rows = (await db.query(
    `WITH pb AS (
       SELECT p.tai_khoan_id, p.tuyen_id, p.so_phien_ban, p.loai_luu, p.thoi_gian_server,
              p.thoi_gian_thiet_bi, p.gps_kinh_do, p.gps_vi_do, p.gps_do_chinh_xac_m
         FROM tuyen_phien_ban p
        WHERE p.thoi_gian_server >= ($1::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
          AND p.thoi_gian_server <  (($1::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
          AND ($2::uuid[] IS NULL OR p.tai_khoan_id = ANY($2))
          AND ($3::uuid IS NULL OR p.tai_khoan_id = $3)),
     cuoi AS (
       SELECT DISTINCT ON (tai_khoan_id) tai_khoan_id, tuyen_id
         FROM pb ORDER BY tai_khoan_id, thoi_gian_server DESC, so_phien_ban DESC),
     gop AS (
       SELECT DISTINCT ON (tai_khoan_id, tuyen_id)
              tai_khoan_id, tuyen_id, so_phien_ban AS phien_ban_cuoi, loai_luu AS loai_luu_cuoi,
              thoi_gian_server AS luu_luc_cuoi, thoi_gian_thiet_bi AS luu_luc_thiet_bi_cuoi,
              gps_kinh_do, gps_vi_do, gps_do_chinh_xac_m
         FROM pb ORDER BY tai_khoan_id, tuyen_id, thoi_gian_server DESC, so_phien_ban DESC),
     dem AS (
       SELECT tai_khoan_id, tuyen_id, count(*)::int AS so_lan_luu,
              count(*) FILTER (WHERE loai_luu = 'hien_truong')::int AS so_lan_hien_truong,
              count(*) FILTER (WHERE loai_luu = 'chinh_sua_sau')::int AS so_lan_chinh_sua_sau
         FROM pb GROUP BY tai_khoan_id, tuyen_id)
     SELECT g.tai_khoan_id, tk.ten_dang_nhap, tk.ho_ten, g.tuyen_id, t.ten_tuyen, t.xoa_luc IS NOT NULL AS tuyen_da_xoa,
            d.so_lan_luu, d.so_lan_hien_truong, d.so_lan_chinh_sua_sau,
            g.phien_ban_cuoi, g.loai_luu_cuoi, g.luu_luc_cuoi, g.luu_luc_thiet_bi_cuoi,
            g.gps_kinh_do, g.gps_vi_do, g.gps_do_chinh_xac_m,
            (c.tuyen_id = g.tuyen_id) AS la_tuyen_cuoi_trong_ngay
       FROM gop g
       JOIN dem d USING (tai_khoan_id, tuyen_id)
       JOIN cuoi c USING (tai_khoan_id)
       JOIN tai_khoan tk ON tk.id = g.tai_khoan_id
       JOIN tuyen t ON t.id = g.tuyen_id
      ORDER BY tk.ho_ten, g.luu_luc_cuoi DESC`, [f.ngay, ids, f.tai_khoan_id || null])).rows

  const theoNguoi = new Map()
  for (const r of rows) {
    if (!theoNguoi.has(r.tai_khoan_id)) {
      theoNguoi.set(r.tai_khoan_id, {
        tai_khoan_id: r.tai_khoan_id, ten_dang_nhap: r.ten_dang_nhap, ho_ten: r.ho_ten,
        tuyen_cuoi_trong_ngay: null, tuyen: [],
      })
    }
    const o = theoNguoi.get(r.tai_khoan_id)
    const { tai_khoan_id, ten_dang_nhap, ho_ten, ...tuyen } = r
    o.tuyen.push(tuyen)
    if (r.la_tuyen_cuoi_trong_ngay) o.tuyen_cuoi_trong_ngay = { tuyen_id: r.tuyen_id, ten_tuyen: r.ten_tuyen }
  }
  return { ngay: f.ngay, mui_gio: 'Asia/Ho_Chi_Minh', nhan_vien: [...theoNguoi.values()] }
}

// --------------------------------------------------------------- bao cao

const hoanThienSchema = LOC_NGAY.extend({
  tai_khoan_id: uuid.optional(),
}).passthrough()

const HOAN_THIEN_TU = `
  FROM tuyen t
  JOIN tai_khoan tk ON tk.id = t.tao_boi
  LEFT JOIN LATERAL (
        SELECT min(p.thoi_gian_server) AS luu_dau_luc,
               count(*)::int AS so_phien_ban,
               count(*) FILTER (WHERE p.loai_luu = 'chinh_sua_sau')::int AS so_lan_chinh_sua_sau
          FROM tuyen_phien_ban p WHERE p.tuyen_id = t.id) pb ON true
  WHERE t.xoa_luc IS NULL AND t.trang_thai = 'hoan_thien'
    AND ($1::uuid[] IS NULL OR t.tao_boi = ANY($1::uuid[]))
    AND ($2::uuid IS NULL OR t.tao_boi = $2)
    AND ($3::date IS NULL OR t.hoan_thien_luc >= ($3::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
    AND ($4::date IS NULL OR t.hoan_thien_luc <  (($4::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))`

/** III.6: tuyen da hoan thien, thoi gian bat dau - hoan thien (ke toan xem toan bo). */
async function baoCaoHoanThien(req, query) {
  const p = phanTrangTuQuery(query)
  const f = phanTich(hoanThienSchema, query, 'query')
  kiemTraKhoang(f)
  const ids = await phamViNguoi(req, f.tai_khoan_id)
  const tham = [ids, f.tai_khoan_id || null, f.tu_ngay || null, f.den_ngay || null]
  const tong = (await db.query(`SELECT count(*)::int AS n ${HOAN_THIEN_TU}`, tham)).rows[0].n
  const rows = (await db.query(
    `SELECT t.id AS tuyen_id, t.ten_tuyen, t.tao_boi AS tai_khoan_id, tk.ten_dang_nhap, tk.ho_ten,
            t.tao_luc, pb.luu_dau_luc, t.hoan_thien_luc, t.phien_ban_hien_tai,
            pb.so_phien_ban, pb.so_lan_chinh_sua_sau,
            round(extract(epoch FROM (t.hoan_thien_luc - t.tao_luc)) / 60)::int AS tong_phut_tu_luc_tao,
            t.so_cot, t.chieu_dai_tuyen_m, t.chieu_dai_cap_m
       ${HOAN_THIEN_TU}
      ORDER BY t.hoan_thien_luc DESC, t.id LIMIT $5 OFFSET $6`, [...tham, p.so_luong, p.offset])).rows
  return boc(rows, p, tong)
}

/** Dong thoi gian cua mot tuyen: phien ban (ben vung) + nhat ky (co the da bi don theo han luu tru). */
async function trackLogTuyen(req, tuyenId) {
  const t = await tuyenSv.layTuyen(req, db, tuyenId)
  const phienBan = (await db.query(
    `SELECT p.so_phien_ban, p.loai_luu, p.la_ban_hoan_thien, p.tai_khoan_id, tk.ho_ten,
            p.thoi_gian_thiet_bi, p.thoi_gian_server, p.gps_kinh_do, p.gps_vi_do, p.gps_do_chinh_xac_m,
            p.so_cot, p.so_cot_them, p.so_cot_sua, p.so_cot_xoa, p.chieu_dai_tuyen_m, p.chieu_dai_cap_m
       FROM tuyen_phien_ban p JOIN tai_khoan tk ON tk.id = p.tai_khoan_id
      WHERE p.tuyen_id = $1 ORDER BY p.so_phien_ban`, [tuyenId])).rows
  const nk = (await db.query(
    `SELECT n.id, n.tai_khoan_id, tk.ho_ten, n.hanh_dong, n.loai_luu, n.thoi_gian_thiet_bi, n.thoi_gian_server,
            n.gps_kinh_do, n.gps_vi_do, n.nguon_diem, n.chi_tiet
       FROM nhat_ky_thao_tac n JOIN tai_khoan tk ON tk.id = n.tai_khoan_id
      WHERE n.tuyen_id = $1 ORDER BY n.thoi_gian_server, n.id LIMIT 5000`, [tuyenId])).rows
  const luuDau = phienBan[0] ? phienBan[0].thoi_gian_server : null
  const hoanThien = t.hoan_thien_luc
  return {
    tuyen: {
      id: t.id, ten_tuyen: t.ten_tuyen, trang_thai: t.trang_thai, tao_luc: t.tao_luc,
      luu_dau_luc: luuDau, hoan_thien_luc: hoanThien,
      tong_phut_tu_luc_tao: hoanThien ? Math.round((new Date(hoanThien) - new Date(t.tao_luc)) / 60000) : null,
    },
    phien_ban: phienBan,
    nhat_ky: nk,
    ghi_chu: 'Nhật ký chỉ được giữ theo cấu hình lưu trữ (mặc định 30 ngày); danh sách phiên bản được giữ lâu dài.',
  }
}

const khoiLuongSchema = z.object({
  du_an_id: uuid.optional(),
  loai_cong_trinh_id: z.coerce.number().int().positive().optional(),
  tai_khoan_id: uuid.optional(),
  trang_thai: z.enum(['dang_khao_sat', 'hoan_thien']).optional(),
}).passthrough()

const KHOI_LUONG_TU = `
  FROM tuyen t
  JOIN tai_khoan tk ON tk.id = t.tao_boi
  LEFT JOIN dm_loai_cong_trinh l ON l.id = t.loai_cong_trinh_id
  WHERE t.xoa_luc IS NULL
    AND ($1::uuid[] IS NULL OR t.tao_boi = ANY($1::uuid[]))
    AND ($2::uuid IS NULL OR t.tao_boi = $2)
    AND ($3::uuid IS NULL OR t.du_an_id = $3)
    AND ($4::int IS NULL OR t.loai_cong_trinh_id = $4)
    AND ($5::text IS NULL OR t.trang_thai = $5)`

async function thamSoKhoiLuong(req, query) {
  const f = phanTich(khoiLuongSchema, query, 'query')
  const ids = await phamViNguoi(req, f.tai_khoan_id)
  return [ids, f.tai_khoan_id || null, f.du_an_id || null, f.loai_cong_trinh_id || null, f.trang_thai || null]
}

/** IV.3, IV.5: chieu dai tuyen, he so n, chieu dai cap theo tuyen + tong. */
async function baoCaoKhoiLuongCap(req, query) {
  const p = phanTrangTuQuery(query)
  const tham = await thamSoKhoiLuong(req, query)
  const tong = (await db.query(
    `SELECT count(*)::int AS so_tuyen, coalesce(sum(t.so_cot), 0)::int AS so_cot,
            coalesce(sum(t.chieu_dai_tuyen_m), 0)::float8 AS chieu_dai_tuyen_m,
            coalesce(sum(t.chieu_dai_cap_m), 0)::float8 AS chieu_dai_cap_m,
            count(*) FILTER (WHERE t.chieu_dai_cap_m IS NULL)::int AS so_tuyen_chua_co_chieu_dai_cap
       ${KHOI_LUONG_TU}`, tham)).rows[0]
  const rows = (await db.query(
    `SELECT t.id AS tuyen_id, t.ten_tuyen, t.du_an_id, t.tao_boi AS tai_khoan_id, tk.ho_ten,
            t.trang_thai, t.loai_cong_trinh_id, l.ten AS loai_cong_trinh_ten, t.he_so_n,
            t.so_cot, t.chieu_dai_tuyen_m, t.chieu_dai_cap_m
       ${KHOI_LUONG_TU}
      ORDER BY t.ten_tuyen, t.id LIMIT $6 OFFSET $7`, [...tham, p.so_luong, p.offset])).rows
  const kq = boc(rows, p, tong.so_tuyen)
  kq.tong = tong
  return kq
}

async function khoiLuongDeXuat(req, query) {
  const tham = await thamSoKhoiLuong(req, query)
  const rows = (await db.query(
    `SELECT t.id AS tuyen_id, t.ten_tuyen, tk.ho_ten, t.trang_thai, l.ten AS loai_cong_trinh_ten, t.he_so_n,
            t.so_cot, t.chieu_dai_tuyen_m, t.chieu_dai_cap_m
       ${KHOI_LUONG_TU}
      ORDER BY t.ten_tuyen, t.id LIMIT $6`, [...tham, GIOI_HAN_XUAT + 1])).rows
  const cat = rows.length > GIOI_HAN_XUAT
  return { rows: cat ? rows.slice(0, GIOI_HAN_XUAT) : rows, bi_cat: cat }
}

module.exports = {
  GIOI_HAN_XUAT,
  danhSachNhatKy, nhatKyDeXuat, ghiSuKien,
  lichSuTheoNgay,
  baoCaoHoanThien, trackLogTuyen,
  baoCaoKhoiLuongCap, khoiLuongDeXuat,
}
