'use strict'
/**
 * Ma tran phan quyen. Day la nguon su that duy nhat: middleware doc tu day,
 * tai lieu "Ma tran phan quyen" cung duoc sinh tu day (npm run xuat-api).
 *
 * Pham vi (gia tri trong ma tran):
 *   T = toan he thong
 *   C = cay: ban than va toan bo cap duoi (di theo tai_khoan.quan_ly_id)
 *   B = chi ban than (du lieu do chinh nguoi dung tao ra / thuoc ve minh)
 *   (khong co) = khong duoc phep
 *
 * Vai tro va pham vi la GIA DINH (bien ban muc 6 cau 10), can nghiep vu xac nhan.
 */

const VAI_TRO = [
  { ma: 'nhan_vien', ten: 'Nhân viên khảo sát' },
  { ma: 'quan_ly_cap_1', ten: 'Quản lý cấp 1' },
  { ma: 'quan_ly_cap_2', ten: 'Quản lý cấp 2' },
  { ma: 'ke_toan', ten: 'Kế toán' },
  { ma: 'quan_tri', ten: 'Quản trị hệ thống' },
]

const nv = 'nhan_vien', q1 = 'quan_ly_cap_1', q2 = 'quan_ly_cap_2', kt = 'ke_toan', qt = 'quan_tri'
const m = (o) => o

const QUYEN = {
  // ---- Tai khoan, thiet bi ----
  'tai_khoan.xem': { nhom: 'Tài khoản', mo_ta: 'Xem danh sách và thông tin tài khoản', ma_tran: m({ [nv]: 'B', [q1]: 'C', [q2]: 'C', [kt]: 'B', [qt]: 'T' }) },
  'tai_khoan.tao': { nhom: 'Tài khoản', mo_ta: 'Tạo tài khoản', ma_tran: m({ [qt]: 'T' }) },
  'tai_khoan.sua': { nhom: 'Tài khoản', mo_ta: 'Sửa vai trò, người quản lý, trạng thái hoạt động', ma_tran: m({ [qt]: 'T' }) },
  'tai_khoan.dat_lai_mat_khau': { nhom: 'Tài khoản', mo_ta: 'Đặt lại mật khẩu của người khác', ma_tran: m({ [qt]: 'T' }) },
  'vai_tro.xem': { nhom: 'Tài khoản', mo_ta: 'Xem danh sách vai trò', ma_tran: m({ [qt]: 'T' }) },
  'thiet_bi.xem': { nhom: 'Thiết bị', mo_ta: 'Xem thiết bị đã kích hoạt', ma_tran: m({ [nv]: 'B', [q1]: 'B', [q2]: 'B', [kt]: 'B', [qt]: 'T' }) },
  'thiet_bi.dang_ky': { nhom: 'Thiết bị', mo_ta: 'Đăng ký (kích hoạt) thiết bị Android cho chính mình', ma_tran: m({ [nv]: 'B', [q1]: 'B', [q2]: 'B', [qt]: 'T' }) },
  'thiet_bi.quan_ly': { nhom: 'Thiết bị', mo_ta: 'Khóa, gia hạn, chuyển thiết bị cho tài khoản khác', ma_tran: m({ [qt]: 'T' }) },

  // ---- Danh muc ----
  'danh_muc.xem': { nhom: 'Danh mục', mo_ta: 'Xem danh mục (loại cột, vật tư, bể cáp, loại công trình...)', ma_tran: m({ [nv]: 'T', [q1]: 'T', [q2]: 'T', [kt]: 'T', [qt]: 'T' }) },
  'danh_muc.sua_loai_cong_trinh': { nhom: 'Danh mục', mo_ta: 'Thiết lập loại công trình và hệ số n (IV.2)', ma_tran: m({ [q2]: 'T', [qt]: 'T' }) },
  'danh_muc.sua': { nhom: 'Danh mục', mo_ta: 'Thêm, sửa, tắt các danh mục khác', ma_tran: m({ [qt]: 'T' }) },

  // ---- Du an ----
  'du_an.xem': { nhom: 'Dự án', mo_ta: 'Xem dự án', ma_tran: m({ [nv]: 'B', [q1]: 'C', [q2]: 'C', [qt]: 'T' }) },
  'du_an.tao': { nhom: 'Dự án', mo_ta: 'Tạo dự án', ma_tran: m({ [nv]: 'B', [q1]: 'B', [q2]: 'B', [qt]: 'T' }) },
  'du_an.sua': { nhom: 'Dự án', mo_ta: 'Đổi tên, di chuyển dự án', ma_tran: m({ [nv]: 'B', [q1]: 'C', [q2]: 'C', [qt]: 'T' }) },
  'du_an.xoa': { nhom: 'Dự án', mo_ta: 'Xóa (mềm) dự án', ma_tran: m({ [q1]: 'C', [q2]: 'C', [qt]: 'T' }) },

  // ---- Tuyen ----
  'tuyen.xem': { nhom: 'Tuyến', mo_ta: 'Xem tuyến, cột, đường, track', ma_tran: m({ [nv]: 'B', [q1]: 'C', [q2]: 'C', [qt]: 'T' }) },
  'tuyen.tao': { nhom: 'Tuyến', mo_ta: 'Tạo tuyến mới', ma_tran: m({ [nv]: 'B', [q1]: 'B', [q2]: 'B', [qt]: 'T' }) },
  'tuyen.sua': { nhom: 'Tuyến', mo_ta: 'Sửa thông tin tuyến, thêm/sửa/xóa/sắp xếp cột, thêm track', ma_tran: m({ [nv]: 'B', [q1]: 'C', [q2]: 'C', [qt]: 'T' }) },
  'tuyen.luu': { nhom: 'Tuyến', mo_ta: 'Lưu tuyến: tạo phiên bản và nhật ký', ma_tran: m({ [nv]: 'B', [q1]: 'C', [q2]: 'C', [qt]: 'T' }) },
  'tuyen.hoan_thien': { nhom: 'Tuyến', mo_ta: 'Đánh dấu hoàn thiện / mở lại tuyến', ma_tran: m({ [nv]: 'B', [q1]: 'C', [q2]: 'C', [qt]: 'T' }) },
  'tuyen.xoa': { nhom: 'Tuyến', mo_ta: 'Xóa (mềm) tuyến', ma_tran: m({ [q1]: 'C', [q2]: 'C', [qt]: 'T' }) },
  'tuyen.nhap_kml': { nhom: 'Tuyến', mo_ta: 'Nhập tệp KML (tuyến do người nhập sở hữu)', ma_tran: m({ [nv]: 'B', [q1]: 'B', [q2]: 'B', [qt]: 'T' }) },
  'tuyen.xuat_kml': { nhom: 'Tuyến', mo_ta: 'Xuất tuyến ra KML', ma_tran: m({ [nv]: 'B', [q1]: 'C', [q2]: 'C', [qt]: 'T' }) },
  'tuyen.xuat_excel': { nhom: 'Tuyến', mo_ta: 'Xuất tuyến ra Excel (IV.5)', ma_tran: m({ [nv]: 'B', [q1]: 'C', [q2]: 'C', [qt]: 'T' }) },
  'phien_ban.xem': { nhom: 'Tuyến', mo_ta: 'Xem và so sánh các phiên bản tuyến (III.3)', ma_tran: m({ [nv]: 'B', [q1]: 'C', [q2]: 'C', [qt]: 'T' }) },

  // ---- Nhat ky, lich su ----
  'nhat_ky.xem': { nhom: 'Nhật ký và lịch sử', mo_ta: 'Xem nhật ký thao tác (III.1)', ma_tran: m({ [nv]: 'B', [q1]: 'C', [q2]: 'C', [qt]: 'T' }) },
  'nhat_ky.ghi': { nhom: 'Nhật ký và lịch sử', mo_ta: 'Ứng dụng gửi sự kiện gửi / đồng bộ của chính mình', ma_tran: m({ [nv]: 'B', [q1]: 'B', [q2]: 'B', [qt]: 'B' }) },
  'nhat_ky.xuat_excel': { nhom: 'Nhật ký và lịch sử', mo_ta: 'Xuất nhật ký hoạt động ra Excel (III.7)', ma_tran: m({ [q1]: 'C', [q2]: 'C', [qt]: 'T' }) },
  'lich_su.xem': { nhom: 'Nhật ký và lịch sử', mo_ta: 'Tra cứu theo nhân viên và ngày (III.5)', ma_tran: m({ [nv]: 'B', [q1]: 'C', [q2]: 'C', [qt]: 'T' }) },

  // ---- Bao cao ----
  'bao_cao.hoan_thien_tuyen': { nhom: 'Báo cáo', mo_ta: 'Track log thời gian hoàn thiện tuyến (III.6)', ma_tran: m({ [nv]: 'B', [q1]: 'C', [q2]: 'C', [kt]: 'T', [qt]: 'T' }) },
  'bao_cao.khoi_luong_cap': { nhom: 'Báo cáo', mo_ta: 'Khối lượng cáp theo tuyến (IV.3, IV.5)', ma_tran: m({ [nv]: 'B', [q1]: 'C', [q2]: 'C', [kt]: 'T', [qt]: 'T' }) },

  // ---- He thong ----
  'he_thong.thong_ke': { nhom: 'Hệ thống', mo_ta: 'Xem số liệu tổng quan trên trang chủ quản trị (trong phạm vi của mình)', ma_tran: m({ [nv]: 'B', [q1]: 'C', [q2]: 'C', [qt]: 'T' }) },
  'he_thong.cau_hinh_xem': { nhom: 'Hệ thống', mo_ta: 'Xem cấu hình hệ thống', ma_tran: m({ [qt]: 'T' }) },
  'he_thong.cau_hinh_sua': { nhom: 'Hệ thống', mo_ta: 'Sửa cấu hình hệ thống', ma_tran: m({ [qt]: 'T' }) },
  'he_thong.don_nhat_ky': { nhom: 'Hệ thống', mo_ta: 'Chạy dọn nhật ký quá hạn ngay', ma_tran: m({ [qt]: 'T' }) },
}

const PHAM_VI_HOP_LE = new Set(['T', 'C', 'B'])
for (const [ten, q] of Object.entries(QUYEN)) {
  for (const [vt, pv] of Object.entries(q.ma_tran)) {
    if (!PHAM_VI_HOP_LE.has(pv)) throw new Error(`Pham vi sai o ${ten}/${vt}: ${pv}`)
    if (!VAI_TRO.some(v => v.ma === vt)) throw new Error(`Vai tro khong ton tai o ${ten}: ${vt}`)
  }
}

/** Pham vi cua vai tro doi voi quyen: 'T' | 'C' | 'B' | null */
function phamVi(vaiTroMa, quyen) {
  const q = QUYEN[quyen]
  if (!q) throw new Error(`Quyen khong ton tai: ${quyen}`)
  return q.ma_tran[vaiTroMa] || null
}

/** Tat ca quyen cua mot vai tro: { 'tuyen.xem': 'B', ... } */
function quyenCuaVaiTro(vaiTroMa) {
  const kq = {}
  for (const [ten, q] of Object.entries(QUYEN)) {
    if (q.ma_tran[vaiTroMa]) kq[ten] = q.ma_tran[vaiTroMa]
  }
  return kq
}

module.exports = { VAI_TRO, QUYEN, phamVi, quyenCuaVaiTro }
