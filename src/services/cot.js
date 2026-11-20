'use strict'
const { z, kinhDo, viDo, chuoiTuyChon, boolLong } = require('../validate')

/** Cac truong nguoi dung duoc sua cua mot cot (cot DB cung ten). */
const TRUONG_CHUOI = [
  'ten_cot', 'ky_hieu', 'dia_diem', 'ly_trinh',
  'hien_trang_cot', 'ma_loai_cot', 'hien_trang_vat_tu', 'ma_vat_tu',
  'chung_loai_odf', 'chung_loai_splitter', 'hien_trang_be_cap', 'ma_be_cap', 'ma_phu_kien',
  'adss_treo_neo', 'adss_udj', 'adss_gong', 'adss_chung_loai',
  'ac_treo_ham', 'ac_de_u', 'ac_dai', 'ac_chung_loai', 'nguon_diem',
]
const TRUONG_BOOL = ['hien_ly_trinh', 'nhan_doi_phu_kien', 'dat_bien_bao']
const TRUONG_SO = ['so_thu_tu', 'kinh_do', 'vi_do', 'cao_do_m', 'chieu_cao_m']
const TRUONG_SUA = [...TRUONG_CHUOI, ...TRUONG_BOOL, ...TRUONG_SO, 'thuoc_tinh_khac']

/** truong -> nhom trong dm_gia_tri */
const NHOM_GIA_TRI = {
  chung_loai_odf: 'chung_loai_odf',
  chung_loai_splitter: 'chung_loai_splitter',
  adss_treo_neo: 'treo_neo',
  adss_udj: 'udj',
  adss_gong: 'gong',
  adss_chung_loai: 'chung_loai_cap',
  ac_treo_ham: 'treo_ham',
  ac_de_u: 'de_u',
  ac_dai: 'dai',
  ac_chung_loai: 'chung_loai_cap',
}

const hienTrang = z.enum(['tm', 'cs'])
const nguonDiem = z.enum(['gps', 'cham_ban_do', 'keo_tha', 'chen_giua', 'nhap_kml'])

/** "6.5m", "6,5", 6.5 -> 6.5 ; khong doc duoc -> NaN (zod se bao loi) */
const soMet = z.preprocess(v => {
  if (v === undefined || v === null || v === '') return v === '' ? null : v
  if (typeof v === 'string') {
    const n = Number(v.trim().replace(/\s*m$/i, '').replace(',', '.'))
    return Number.isFinite(n) ? n : v
  }
  return v
}, z.number().positive().max(100).nullable().optional())

const hienTrangTuyChon = z.preprocess(
  v => (v === '' ? null : v),
  hienTrang.nullable().optional())

const cotCoBan = {
  id: z.string().uuid().optional(),
  ten_cot: z.string().trim().min(1, 'Tên cột bắt buộc').max(120),
  ky_hieu: chuoiTuyChon(60),
  so_thu_tu: z.number().int().min(0).max(1000000).nullable().optional(),
  dia_diem: chuoiTuyChon(2000),
  kinh_do: kinhDo,
  vi_do: viDo,
  cao_do_m: z.number().min(-1000).max(9000).nullable().optional(),
  ly_trinh: chuoiTuyChon(60),
  hien_ly_trinh: boolLong.optional(),
  nhan_doi_phu_kien: boolLong.optional(),
  dat_bien_bao: boolLong.optional(),
  hien_trang_cot: hienTrangTuyChon,
  ma_loai_cot: chuoiTuyChon(30),
  chieu_cao_m: soMet,
  hien_trang_vat_tu: hienTrangTuyChon,
  ma_vat_tu: chuoiTuyChon(30),
  chung_loai_odf: chuoiTuyChon(60),
  chung_loai_splitter: chuoiTuyChon(60),
  hien_trang_be_cap: hienTrangTuyChon,
  ma_be_cap: chuoiTuyChon(30),
  ma_phu_kien: chuoiTuyChon(30),
  adss_treo_neo: chuoiTuyChon(60),
  adss_udj: chuoiTuyChon(60),
  adss_gong: chuoiTuyChon(60),
  adss_chung_loai: chuoiTuyChon(60),
  ac_treo_ham: chuoiTuyChon(60),
  ac_de_u: chuoiTuyChon(60),
  ac_dai: chuoiTuyChon(60),
  ac_chung_loai: chuoiTuyChon(60),
  nguon_diem: z.preprocess(v => (v === '' ? null : v), nguonDiem.nullable().optional()),
  thuoc_tinh_khac: z.record(z.string(), z.unknown()).optional(),
  // Truong chi doc co trong du lieu GET cot: nhan va bo qua, de ung dung gui lai nguyen doi tuong da doc.
  // Thu tu cot luon theo vi tri trong mang gui len.
  thu_tu: z.unknown().optional(),
  tao_luc: z.unknown().optional(),
  cap_nhat_luc: z.unknown().optional(),
  xoa_luc: z.unknown().optional(),
  tao_boi: z.unknown().optional(),
}

const cotTaoSchema = z.object(cotCoBan).strict()
const cotSuaSchema = z.object(cotCoBan).partial().strict()

const lam = (x, k) => Math.round(x * 10 ** k) / 10 ** k

/** Chuan hoa so: kinh/vi do 7 so le, cao do 2, chieu cao 1 (khop kieu numeric trong CSDL). */
function chuanHoaSo(c) {
  const o = { ...c }
  if (typeof o.kinh_do === 'number') o.kinh_do = lam(o.kinh_do, 7)
  if (typeof o.vi_do === 'number') o.vi_do = lam(o.vi_do, 7)
  if (typeof o.cao_do_m === 'number') o.cao_do_m = lam(o.cao_do_m, 2)
  if (typeof o.chieu_cao_m === 'number') o.chieu_cao_m = lam(o.chieu_cao_m, 1)
  return o
}

/**
 * Kiem tra cot theo danh muc (R6, R7). `cu` la ban ghi hien tai (neu co): cac
 * truong KHONG thay doi so voi `cu` duoc mien kiem tra "dang hoat dong" va
 * "thuoc danh muc nhom" de du lieu cu khong bi chan khi luu lai.
 * Tra ve { cot, loi } - cot da dien san hien trang suy tu ma.
 */
function kiemTraCot(cotVao, cat, cu) {
  const cot = { ...cotVao }
  const loi = []
  const khac = (t) => !cu || (cu[t] ?? null) !== (cot[t] ?? null)
  const them = (truong, thong_diep) => loi.push({ truong, thong_diep })

  // loai cot
  if (cot.ma_loai_cot) {
    const d = cat.tim.loai_cot.get(cot.ma_loai_cot)
    if (!d) them('ma_loai_cot', `Mã loại cột không có trong danh mục: ${cot.ma_loai_cot}`)
    else {
      if (khac('ma_loai_cot') && !d.hoat_dong) them('ma_loai_cot', `Mã loại cột đã ngừng dùng: ${cot.ma_loai_cot}`)
      if (!cot.hien_trang_cot) cot.hien_trang_cot = d.hien_trang
      else if (cot.hien_trang_cot !== d.hien_trang) {
        them('hien_trang_cot', `Loại cột ${d.ma} thuộc hiện trạng "${d.hien_trang}", không khớp "${cot.hien_trang_cot}"`)
      }
    }
  }
  // vat tu
  if (cot.ma_vat_tu) {
    const d = cat.tim.vat_tu.get(cot.ma_vat_tu)
    if (!d) them('ma_vat_tu', `Mã vật tư không có trong danh mục: ${cot.ma_vat_tu}`)
    else {
      if (khac('ma_vat_tu') && !d.hoat_dong) them('ma_vat_tu', `Mã vật tư đã ngừng dùng: ${cot.ma_vat_tu}`)
      if (d.hien_trang_ap_dung !== 'ca_hai') {
        if (!cot.hien_trang_vat_tu) cot.hien_trang_vat_tu = d.hien_trang_ap_dung
        else if (cot.hien_trang_vat_tu !== d.hien_trang_ap_dung) {
          them('hien_trang_vat_tu', `Vật tư ${d.ma} thuộc hiện trạng "${d.hien_trang_ap_dung}", không khớp "${cot.hien_trang_vat_tu}"`)
        }
      }
    }
  }
  // be cap
  if (cot.ma_be_cap) {
    const d = cat.tim.be_cap.get(cot.ma_be_cap)
    if (!d) them('ma_be_cap', `Mã bể cáp không có trong danh mục: ${cot.ma_be_cap}`)
    else {
      if (khac('ma_be_cap') && !d.hoat_dong) them('ma_be_cap', `Mã bể cáp đã ngừng dùng: ${cot.ma_be_cap}`)
      if (!cot.hien_trang_be_cap) cot.hien_trang_be_cap = d.hien_trang
      else if (cot.hien_trang_be_cap !== d.hien_trang) {
        them('hien_trang_be_cap', `Bể cáp ${d.ma} thuộc hiện trạng "${d.hien_trang}", không khớp "${cot.hien_trang_be_cap}"`)
      }
    }
  }
  // phu kien cot
  if (cot.ma_phu_kien) {
    const d = cat.tim.phu_kien.get(cot.ma_phu_kien)
    if (!d) them('ma_phu_kien', `Mã phụ kiện không có trong danh mục: ${cot.ma_phu_kien}`)
    else if (khac('ma_phu_kien') && !d.hoat_dong) them('ma_phu_kien', `Mã phụ kiện đã ngừng dùng: ${cot.ma_phu_kien}`)
  }
  // chieu cao
  if (cot.chieu_cao_m !== null && cot.chieu_cao_m !== undefined) {
    const d = cat.tim.chieu_cao.get(cot.chieu_cao_m)
    if (!d) them('chieu_cao_m', `Chiều cao ${cot.chieu_cao_m} m không có trong danh mục`)
    else if (khac('chieu_cao_m') && !d.hoat_dong) them('chieu_cao_m', `Chiều cao ${cot.chieu_cao_m} m đã ngừng dùng`)
  }
  // danh muc gia tri don gian
  for (const [truong, nhom] of Object.entries(NHOM_GIA_TRI)) {
    const v = cot[truong]
    if (v === null || v === undefined || !khac(truong)) continue
    const d = cat.tim.gia_tri[nhom] && cat.tim.gia_tri[nhom].get(v)
    if (!d) them(truong, `Giá trị "${v}" không thuộc danh mục ${nhom}`)
    else if (!d.hoat_dong) them(truong, `Giá trị "${v}" của ${nhom} đã ngừng dùng`)
  }
  return { cot, loi }
}

/** Danh sach truong khac nhau giua hai ban ghi cot (de dem so cot sua). */
function truongKhac(a, b) {
  const ds = []
  for (const t of TRUONG_SUA) {
    const x = a[t] === undefined ? null : a[t]
    const y = b[t] === undefined ? null : b[t]
    const bang = (t === 'thuoc_tinh_khac')
      ? JSON.stringify(x || {}) === JSON.stringify(y || {})
      : x === y
    if (!bang) ds.push(t)
  }
  return ds
}

/** Ban ghi cot trong CSDL -> doi tuong trong anh chup phien ban. */
function chupCot(row) {
  const o = { id: row.id, thu_tu: row.thu_tu }
  for (const t of TRUONG_SUA) o[t] = row[t] === undefined ? null : row[t]
  return o
}

module.exports = {
  TRUONG_SUA, NHOM_GIA_TRI, cotTaoSchema, cotSuaSchema,
  chuanHoaSo, kiemTraCot, truongKhac, chupCot,
}
