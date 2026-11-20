'use strict'
const ExcelJS = require('exceljs')
const db = require('../db')
const danhMuc = require('./danhMuc')
const tuyenSv = require('./tuyen')

/**
 * Xuat Excel (III.7, IV.5). Gia tri chuoi luon duoc ghi la van ban (khong phai cong thuc),
 * nen noi dung do nguoi dung nhap vao nhu "=SUM(...)" khong bi Excel thuc thi.
 */

const KIEU_DAU = {
  font: { bold: true, name: 'Arial', size: 10, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } },
  alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
}

function taoSheet(wb, ten, cacCot, rows) {
  const ws = wb.addWorksheet(ten, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = cacCot.map(c => ({ header: c.tieu_de, key: c.khoa, width: c.rong || 16, style: c.dinh_dang ? { numFmt: c.dinh_dang } : {} }))
  const dau = ws.getRow(1)
  dau.eachCell(cell => { cell.font = KIEU_DAU.font; cell.fill = KIEU_DAU.fill; cell.alignment = KIEU_DAU.alignment })
  dau.height = 28
  for (const r of rows) ws.addRow(r)
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cacCot.length } }
  return ws
}

async function ghiBuffer(wb) {
  wb.created = new Date()
  return Buffer.from(await wb.xlsx.writeBuffer())
}

const dinhDangGio = (d) => (d ? new Date(d) : null)
const HIEN_TRANG = { tm: 'Trồng mới', cs: 'Có sẵn' }
const LOAI_LUU = { hien_truong: 'Lưu hiện trường', chinh_sua_sau: 'Chỉnh sửa sau' }
const HANH_DONG = { tao: 'Tạo', luu: 'Lưu', sua: 'Sửa', gui: 'Gửi', dong_bo: 'Đồng bộ' }
const NGUON_DIEM = { gps: 'GPS', cham_ban_do: 'Chạm bản đồ', keo_tha: 'Kéo thả', chen_giua: 'Chèn giữa', nhap_kml: 'Nhập KML' }
const TRANG_THAI = { dang_khao_sat: 'Đang khảo sát', hoan_thien: 'Hoàn thiện' }

/** IV.5: mot tuyen = tong hop + danh sach cot. */
async function xuatTuyen(req, tuyenId) {
  const t = await tuyenSv.chiTiet(req, tuyenId, 'cot')
  const cat = await danhMuc.lay()
  const tenLoai = (ma) => (ma && cat.tim.loai_cot.get(ma) && cat.tim.loai_cot.get(ma).ten) || ''
  const wb = new ExcelJS.Workbook()
  wb.creator = 'POTECO'

  const tong = [
    ['Tên tuyến', t.ten_tuyen],
    ['Người tạo', t.tao_boi_ho_ten],
    ['Trạng thái', TRANG_THAI[t.trang_thai] || t.trang_thai],
    ['Loại công trình', t.loai_cong_trinh_ten || ''],
    ['Hệ số n', t.he_so_n],
    ['Số cột', t.so_cot],
    ['Chiều dài tuyến (m)', t.chieu_dai_tuyen_m],
    ['Chiều dài cáp (m) = chiều dài tuyến × n', t.chieu_dai_cap_m],
    ['Phiên bản hiện tại', t.phien_ban_hien_tai],
    ['Hoàn thiện lúc', dinhDangGio(t.hoan_thien_luc)],
  ]
  const ws = wb.addWorksheet('Tổng hợp')
  ws.columns = [{ width: 42 }, { width: 36 }]
  for (const [k, v] of tong) {
    const r = ws.addRow([k, v === undefined ? null : v])
    r.getCell(1).font = { bold: true }
    if (v instanceof Date) r.getCell(2).numFmt = 'dd/mm/yyyy hh:mm'
  }
  ws.getCell('B7').numFmt = '#,##0.00'
  ws.getCell('B8').numFmt = '#,##0.00'

  taoSheet(wb, 'Cột', [
    { tieu_de: 'STT', khoa: 'thu_tu', rong: 6 },
    { tieu_de: 'Tên cột', khoa: 'ten_cot', rong: 18 },
    { tieu_de: 'Địa điểm', khoa: 'dia_diem', rong: 30 },
    { tieu_de: 'Kinh độ', khoa: 'kinh_do', rong: 13, dinh_dang: '0.0000000' },
    { tieu_de: 'Vĩ độ', khoa: 'vi_do', rong: 13, dinh_dang: '0.0000000' },
    { tieu_de: 'Lý trình', khoa: 'ly_trinh', rong: 12 },
    { tieu_de: 'Hiện trạng cột', khoa: 'hien_trang_cot', rong: 12 },
    { tieu_de: 'Loại cột', khoa: 'ma_loai_cot', rong: 14 },
    { tieu_de: 'Tên loại cột', khoa: 'ten_loai_cot', rong: 22 },
    { tieu_de: 'Chiều cao (m)', khoa: 'chieu_cao_m', rong: 10, dinh_dang: '0.0' },
    { tieu_de: 'Hiện trạng vật tư', khoa: 'hien_trang_vat_tu', rong: 12 },
    { tieu_de: 'Vật tư', khoa: 'ma_vat_tu', rong: 14 },
    { tieu_de: 'Chủng loại ODF', khoa: 'chung_loai_odf', rong: 14 },
    { tieu_de: 'Chủng loại Splitter', khoa: 'chung_loai_splitter', rong: 14 },
    { tieu_de: 'Hiện trạng bể cáp', khoa: 'hien_trang_be_cap', rong: 12 },
    { tieu_de: 'Bể cáp', khoa: 'ma_be_cap', rong: 14 },
    { tieu_de: 'Phụ kiện', khoa: 'ma_phu_kien', rong: 14 },
    { tieu_de: 'ADSS treo/neo', khoa: 'adss_treo_neo', rong: 14 },
    { tieu_de: 'ADSS UDJ', khoa: 'adss_udj', rong: 14 },
    { tieu_de: 'ADSS gông', khoa: 'adss_gong', rong: 14 },
    { tieu_de: 'ADSS chủng loại', khoa: 'adss_chung_loai', rong: 14 },
    { tieu_de: 'AC treo/hầm', khoa: 'ac_treo_ham', rong: 14 },
    { tieu_de: 'AC đế U', khoa: 'ac_de_u', rong: 12 },
    { tieu_de: 'AC dài', khoa: 'ac_dai', rong: 12 },
    { tieu_de: 'AC chủng loại', khoa: 'ac_chung_loai', rong: 14 },
    { tieu_de: 'Đặt biển báo', khoa: 'dat_bien_bao', rong: 10 },
    { tieu_de: 'Nhân đôi phụ kiện', khoa: 'nhan_doi_phu_kien', rong: 10 },
    { tieu_de: 'Nguồn điểm', khoa: 'nguon_diem', rong: 14 },
  ], t.cot.map(c => ({
    ...c,
    ten_loai_cot: tenLoai(c.ma_loai_cot),
    hien_trang_cot: HIEN_TRANG[c.hien_trang_cot] || '',
    hien_trang_vat_tu: HIEN_TRANG[c.hien_trang_vat_tu] || '',
    hien_trang_be_cap: HIEN_TRANG[c.hien_trang_be_cap] || '',
    dat_bien_bao: c.dat_bien_bao ? 'Có' : '',
    nhan_doi_phu_kien: c.nhan_doi_phu_kien ? 'Có' : '',
    nguon_diem: NGUON_DIEM[c.nguon_diem] || '',
  })))
  return { buffer: await ghiBuffer(wb), ten_tep: `tuyen_${tenTep(t.ten_tuyen)}.xlsx` }
}

/** III.7: nhat ky hoat dong. */
async function xuatNhatKy(rows, biCat) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'POTECO'
  taoSheet(wb, 'Nhật ký thao tác', [
    { tieu_de: 'Thời gian máy chủ', khoa: 'thoi_gian_server', rong: 20, dinh_dang: 'dd/mm/yyyy hh:mm:ss' },
    { tieu_de: 'Thời gian thiết bị', khoa: 'thoi_gian_thiet_bi', rong: 20, dinh_dang: 'dd/mm/yyyy hh:mm:ss' },
    { tieu_de: 'Tài khoản', khoa: 'ten_dang_nhap', rong: 16 },
    { tieu_de: 'Họ tên', khoa: 'ho_ten', rong: 24 },
    { tieu_de: 'Hành động', khoa: 'hanh_dong', rong: 12 },
    { tieu_de: 'Loại lưu', khoa: 'loai_luu', rong: 16 },
    { tieu_de: 'Tuyến', khoa: 'ten_tuyen', rong: 28 },
    { tieu_de: 'Phiên bản', khoa: 'so_phien_ban', rong: 10 },
    { tieu_de: 'Thiết bị', khoa: 'ma_thiet_bi', rong: 20 },
    { tieu_de: 'GPS kinh độ', khoa: 'gps_kinh_do', rong: 13, dinh_dang: '0.0000000' },
    { tieu_de: 'GPS vĩ độ', khoa: 'gps_vi_do', rong: 13, dinh_dang: '0.0000000' },
    { tieu_de: 'Sai số GPS (m)', khoa: 'gps_do_chinh_xac_m', rong: 10 },
    { tieu_de: 'Nguồn điểm', khoa: 'nguon_diem', rong: 14 },
    { tieu_de: 'Chi tiết', khoa: 'chi_tiet', rong: 60 },
  ], rows.map(r => ({
    ...r,
    thoi_gian_server: dinhDangGio(r.thoi_gian_server),
    thoi_gian_thiet_bi: dinhDangGio(r.thoi_gian_thiet_bi),
    hanh_dong: HANH_DONG[r.hanh_dong] || r.hanh_dong,
    loai_luu: LOAI_LUU[r.loai_luu] || '',
    nguon_diem: NGUON_DIEM[r.nguon_diem] || '',
    chi_tiet: JSON.stringify(r.chi_tiet || {}),
  })))
  if (biCat) {
    wb.addWorksheet('Lưu ý').addRow([`Dữ liệu bị cắt ở ${rows.length} dòng đầu. Hãy thu hẹp khoảng ngày.`])
  }
  return { buffer: await ghiBuffer(wb), ten_tep: 'nhat_ky_thao_tac.xlsx' }
}

/** IV.3, IV.5: khoi luong cap theo tuyen, co dong tong. */
async function xuatKhoiLuongCap(rows, biCat) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'POTECO'
  const ws = taoSheet(wb, 'Khối lượng cáp', [
    { tieu_de: 'Tuyến', khoa: 'ten_tuyen', rong: 30 },
    { tieu_de: 'Người tạo', khoa: 'ho_ten', rong: 24 },
    { tieu_de: 'Trạng thái', khoa: 'trang_thai', rong: 14 },
    { tieu_de: 'Loại công trình', khoa: 'loai_cong_trinh_ten', rong: 26 },
    { tieu_de: 'Hệ số n', khoa: 'he_so_n', rong: 10, dinh_dang: '0.###' },
    { tieu_de: 'Số cột', khoa: 'so_cot', rong: 10 },
    { tieu_de: 'Chiều dài tuyến (m)', khoa: 'chieu_dai_tuyen_m', rong: 18, dinh_dang: '#,##0.00' },
    { tieu_de: 'Chiều dài cáp (m)', khoa: 'chieu_dai_cap_m', rong: 18, dinh_dang: '#,##0.00' },
  ], rows.map(r => ({ ...r, trang_thai: TRANG_THAI[r.trang_thai] || r.trang_thai })))
  const tong = rows.reduce((a, r) => ({
    so_cot: a.so_cot + (r.so_cot || 0),
    tuyen: a.tuyen + (r.chieu_dai_tuyen_m || 0),
    cap: a.cap + (r.chieu_dai_cap_m || 0),
  }), { so_cot: 0, tuyen: 0, cap: 0 })
  const dong = ws.addRow({
    ten_tuyen: `Tổng (${rows.length} tuyến)`, so_cot: tong.so_cot,
    chieu_dai_tuyen_m: Math.round(tong.tuyen * 100) / 100, chieu_dai_cap_m: Math.round(tong.cap * 100) / 100,
  })
  dong.font = { bold: true }
  if (biCat) wb.addWorksheet('Lưu ý').addRow([`Dữ liệu bị cắt ở ${rows.length} dòng đầu. Hãy thu hẹp bộ lọc.`])
  return { buffer: await ghiBuffer(wb), ten_tep: 'khoi_luong_cap.xlsx' }
}

/** Ten tep an toan (bo ky tu dac biet, giu chu co dau). */
function tenTep(s) {
  return String(s || 'tuyen').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 80) || 'tuyen'
}

module.exports = { xuatTuyen, xuatNhatKy, xuatKhoiLuongCap, tenTep }
