'use strict'
const db = require('../db')

/**
 * Bo nho dem danh muc (doc nhieu, sua rat it). Het han sau 60 giay hoac
 * khi co thao tac sua danh muc (lamMoi).
 */
const TTL_MS = 60 * 1000
let cache = null
let hetHan = 0

async function tai(q = db) {
  // Tren mot client giao dich, cac truy van phai chay lan luot (pg khong cho chay chong len nhau).
  const chay = q === db
    ? (ds) => Promise.all(ds.map(f => f()))
    : async (ds) => { const kq = []; for (const x of ds) kq.push(await x()); return kq }
  const [loaiCot, vatTu, beCap, phuKien, chieuCao, giaTri, loaiCongTrinh] = await chay([
    () => q.query('SELECT ma, hien_trang, ten, icon_key, thu_tu, hoat_dong, ghi_chu FROM dm_loai_cot ORDER BY thu_tu, ma'),
    () => q.query('SELECT ma, hien_trang_ap_dung, ten, icon_key, thu_tu, hoat_dong, ghi_chu FROM dm_vat_tu ORDER BY thu_tu, ma'),
    () => q.query('SELECT ma, hien_trang, ten, icon_key, thu_tu, hoat_dong, ghi_chu FROM dm_be_cap ORDER BY thu_tu, ma'),
    () => q.query('SELECT ma, ten, icon_key, thu_tu, hoat_dong, ghi_chu FROM dm_phu_kien_cot ORDER BY thu_tu, ma'),
    () => q.query('SELECT gia_tri_m, ten, thu_tu, hoat_dong FROM dm_chieu_cao_cot ORDER BY thu_tu, gia_tri_m'),
    () => q.query('SELECT nhom, ma, ten, thu_tu, hoat_dong FROM dm_gia_tri ORDER BY nhom, thu_tu, ma'),
    () => q.query('SELECT id, ma, ten, he_so_n, hoat_dong, cap_nhat_boi, cap_nhat_luc FROM dm_loai_cong_trinh ORDER BY ma'),
  ])
  const nhomGiaTri = {}
  for (const r of giaTri.rows) (nhomGiaTri[r.nhom] = nhomGiaTri[r.nhom] || []).push(r)
  const duLieu = {
    loai_cot: loaiCot.rows,
    vat_tu: vatTu.rows,
    be_cap: beCap.rows,
    phu_kien: phuKien.rows,
    chieu_cao: chieuCao.rows,
    gia_tri: nhomGiaTri,
    loai_cong_trinh: loaiCongTrinh.rows,
  }
  const tra = (rows, key) => new Map(rows.map(r => [r[key], r]))
  const tim = {
    loai_cot: tra(duLieu.loai_cot, 'ma'),
    vat_tu: tra(duLieu.vat_tu, 'ma'),
    be_cap: tra(duLieu.be_cap, 'ma'),
    phu_kien: tra(duLieu.phu_kien, 'ma'),
    chieu_cao: tra(duLieu.chieu_cao, 'gia_tri_m'),
    gia_tri: Object.fromEntries(Object.entries(nhomGiaTri).map(([n, rows]) => [n, tra(rows, 'ma')])),
  }
  return { duLieu, tim }
}

async function lay(q) {
  if (q && q !== db) return tai(q) // trong giao dich: doc truc tiep de thay thay doi chua commit
  if (!cache || Date.now() > hetHan) {
    cache = await tai()
    hetHan = Date.now() + TTL_MS
  }
  return cache
}

function lamMoi() {
  cache = null
  hetHan = 0
}

module.exports = { lay, lamMoi }
