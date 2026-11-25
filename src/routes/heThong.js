'use strict'
const db = require('../db')
const { loi } = require('../errors')
const { z, phanTich } = require('../validate')
const { dang } = require('../registry')
const nhatKy = require('../services/nhatKy')
const { idTrongPham } = require('../phamvi')
const { phamVi } = require('../permissions')

const NHOM = 'Hệ thống'

dang({
  method: 'get', path: '/he-thong/thong-ke', quyen: 'he_thong.thong_ke', nhom: NHOM,
  tom_tat: 'Số liệu tổng quan cho trang chủ quản trị',
  ket_qua: '{ tuyen: { tong, dang_khao_sat, hoan_thien, tong_chieu_dai_tuyen_m, tong_chieu_dai_cap_m }, hoat_dong_7_ngay: [{ ngay, so_lan_luu, so_nhan_vien }], nhat_ky_hom_nay, tai_khoan?: { tong, hoat_dong }, thiet_bi?: { tong, hoat_dong } }',
  ghi_chu: 'Số liệu tuyến, lượt lưu và nhật ký tính trong phạm vi của người gọi (nhân viên: mình; quản lý: cả nhánh dưới; quản trị: tất cả). tai_khoan và thiet_bi chỉ có khi người gọi xem được toàn bộ tài khoản (quản trị). Ngày theo giờ Việt Nam.',
  xuLy: async (req, res) => {
    const ids = await idTrongPham(req, req.pham_vi)
    const [tuyen, ngay, nk] = await Promise.all([
      db.query(
        `SELECT count(*)::int AS tong,
                count(*) FILTER (WHERE trang_thai = 'dang_khao_sat')::int AS dang_khao_sat,
                count(*) FILTER (WHERE trang_thai = 'hoan_thien')::int AS hoan_thien,
                COALESCE(sum(chieu_dai_tuyen_m), 0)::float8 AS tong_chieu_dai_tuyen_m,
                COALESCE(sum(chieu_dai_cap_m), 0)::float8 AS tong_chieu_dai_cap_m
           FROM tuyen WHERE xoa_luc IS NULL AND ($1::uuid[] IS NULL OR tao_boi = ANY($1::uuid[]))`, [ids]),
      db.query(
        `WITH hom_nay AS (SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d)
         SELECT to_char(g.d, 'YYYY-MM-DD') AS ngay,
                count(p.id)::int AS so_lan_luu,
                count(DISTINCT p.tai_khoan_id)::int AS so_nhan_vien
           FROM hom_nay h
           CROSS JOIN LATERAL generate_series(h.d - 6, h.d, interval '1 day') AS g(d)
           LEFT JOIN tuyen_phien_ban p
                  ON p.thoi_gian_server >= g.d::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
                 AND p.thoi_gian_server <  (g.d::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
                 AND ($1::uuid[] IS NULL OR p.tai_khoan_id = ANY($1))
          GROUP BY g.d ORDER BY g.d`, [ids]),
      db.query(
        `SELECT count(*)::int AS n FROM nhat_ky_thao_tac
          WHERE thoi_gian_server >= ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
            AND ($1::uuid[] IS NULL OR tai_khoan_id = ANY($1))`, [ids]),
    ])
    const kq = { tuyen: tuyen.rows[0], hoat_dong_7_ngay: ngay.rows, nhat_ky_hom_nay: nk.rows[0].n }
    if (phamVi(req.user.vai_tro, 'tai_khoan.xem') === 'T') {
      const [tk, tb] = await Promise.all([
        db.query(`SELECT count(*)::int AS tong, count(*) FILTER (WHERE hoat_dong)::int AS hoat_dong
                    FROM tai_khoan WHERE ten_dang_nhap <> 'he_thong'`),
        db.query(`SELECT count(*)::int AS tong, count(*) FILTER (WHERE hoat_dong)::int AS hoat_dong FROM thiet_bi`),
      ])
      kq.tai_khoan = tk.rows[0]
      kq.thiet_bi = tb.rows[0]
    }
    res.json(kq)
  },
})

dang({
  method: 'get', path: '/suc-khoe', quyen: 'cong_khai', nhom: NHOM,
  tom_tat: 'Kiểm tra máy chủ và kết nối cơ sở dữ liệu',
  ket_qua: '{ trang_thai: "ok", thoi_gian }',
  xuLy: async (_req, res) => {
    await db.query('SELECT 1')
    res.json({ trang_thai: 'ok', thoi_gian: new Date().toISOString() })
  },
})

dang({
  method: 'get', path: '/he-thong/cau-hinh', quyen: 'he_thong.cau_hinh_xem', nhom: NHOM,
  tom_tat: 'Xem cấu hình hệ thống',
  ket_qua: '[{ khoa, gia_tri, mo_ta, cap_nhat_luc }]',
  xuLy: async (_req, res) => res.json((await db.query('SELECT khoa, gia_tri, mo_ta, cap_nhat_luc FROM cau_hinh_he_thong ORDER BY khoa')).rows),
})

const KHOA_SUA_DUOC = {
  'nhat_ky.luu_tru_ngay': z.number().int().min(1).max(3650),
}

dang({
  method: 'put', path: '/he-thong/cau-hinh/:khoa', quyen: 'he_thong.cau_hinh_sua', nhom: NHOM,
  tom_tat: 'Sửa một cấu hình hệ thống',
  tham_so: 'Body: { gia_tri }. Khoá sửa được: nhat_ky.luu_tru_ngay (số ngày giữ nhật ký, 1..3650)',
  ghi_chu: 'Các khoá khác chỉ đọc. Số ngày mới áp dụng ở lần dọn nhật ký kế tiếp.',
  xuLy: async (req, res) => {
    const khoa = req.params.khoa
    const sch = KHOA_SUA_DUOC[khoa]
    if (!sch) throw loi.khongThay('Cấu hình không tồn tại hoặc không được sửa')
    const b = phanTich(z.object({ gia_tri: sch }).strict(), req.body)
    const r = await db.query(
      'UPDATE cau_hinh_he_thong SET gia_tri = $1::jsonb, cap_nhat_luc = now() WHERE khoa = $2 RETURNING khoa, gia_tri, mo_ta, cap_nhat_luc',
      [JSON.stringify(b.gia_tri), khoa])
    if (!r.rows[0]) throw loi.khongThay('Cấu hình không tồn tại')
    res.json(r.rows[0])
  },
})

dang({
  method: 'post', path: '/he-thong/don-nhat-ky', quyen: 'he_thong.don_nhat_ky', nhom: NHOM,
  tom_tat: 'Xóa nhật ký quá hạn lưu trữ ngay (III.7)',
  ket_qua: '{ so_dong_da_xoa, luu_tru_ngay }',
  ghi_chu: 'Chỉ xóa nhat_ky_thao_tac; các phiên bản tuyến giữ nguyên. Tác vụ này cũng chạy tự động mỗi ngày khi DON_NHAT_KY_TU_DONG=1.',
  xuLy: async (_req, res) => res.json(await db.giaoDich(c => nhatKy.donQuaHan(c))),
})
