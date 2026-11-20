'use strict'

/**
 * Ghi mot dong vao nhat_ky_thao_tac. Luon goi trong cung giao dich voi thao tac
 * duoc ghi, de nhat ky va du lieu khong bao gio lech nhau.
 * thoi_gian_server do CSDL tu dien (now()).
 */
async function ghi(client, d) {
  const gps = d.gps || {}
  const kq = await client.query(
    `INSERT INTO nhat_ky_thao_tac
       (tai_khoan_id, thiet_bi_id, tuyen_id, phien_ban_id, hanh_dong, loai_luu,
        thoi_gian_thiet_bi, gps_kinh_do, gps_vi_do, gps_do_chinh_xac_m, nguon_diem, chi_tiet)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
     RETURNING id, thoi_gian_server`,
    [
      d.tai_khoan_id, d.thiet_bi_id || null, d.tuyen_id || null, d.phien_ban_id || null,
      d.hanh_dong, d.loai_luu || null, d.thoi_gian_thiet_bi || null,
      gps.kinh_do ?? null, gps.vi_do ?? null, gps.do_chinh_xac_m ?? null,
      d.nguon_diem || null, JSON.stringify(d.chi_tiet || {}),
    ])
  return kq.rows[0]
}

/** Xoa nhat ky cu hon so ngay cau hinh (nhat_ky.luu_tru_ngay). Tra ve so dong da xoa. */
async function donQuaHan(client) {
  const cfg = await client.query(
    "SELECT gia_tri FROM cau_hinh_he_thong WHERE khoa = 'nhat_ky.luu_tru_ngay'")
  const ngay = cfg.rows[0] ? Number(cfg.rows[0].gia_tri) : NaN
  if (!Number.isInteger(ngay) || ngay < 1) {
    throw new Error('Cau hinh nhat_ky.luu_tru_ngay khong hop le')
  }
  const kq = await client.query(
    `DELETE FROM nhat_ky_thao_tac
      WHERE thoi_gian_server < now() - make_interval(days => $1)`, [ngay])
  return { so_dong_da_xoa: kq.rowCount, luu_tru_ngay: ngay }
}

module.exports = { ghi, donQuaHan }
