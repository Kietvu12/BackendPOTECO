'use strict'

/**
 * Loi nghiep vu co ma ro rang. Dinh dang tra ve:
 *   { loi: { ma, thong_diep, chi_tiet? } }
 */
class AppError extends Error {
  constructor(status, ma, thongDiep, chiTiet) {
    super(thongDiep)
    this.status = status
    this.ma = ma
    this.chiTiet = chiTiet
  }
}

const loi = {
  chuaDangNhap: (m = 'Chưa đăng nhập hoặc phiên đã hết hạn') => new AppError(401, 'CHUA_DANG_NHAP', m),
  sai: (m = 'Sai tên đăng nhập hoặc mật khẩu') => new AppError(401, 'SAI_THONG_TIN_DANG_NHAP', m),
  khongCoQuyen: (m = 'Không có quyền thực hiện thao tác này') => new AppError(403, 'KHONG_CO_QUYEN', m),
  khongThay: (m = 'Không tìm thấy dữ liệu') => new AppError(404, 'KHONG_TIM_THAY', m),
  trung: (m, chiTiet) => new AppError(409, 'XUNG_DOT', m, chiTiet),
  xungDotPhienBan: (hienTai) =>
    new AppError(409, 'XUNG_DOT_PHIEN_BAN',
      `Tuyến đã có phiên bản mới hơn (${hienTai}). Tải lại dữ liệu hoặc gửi ghi_de = true`,
      { phien_ban_hien_tai: hienTai }),
  duLieuSai: (m, chiTiet) => new AppError(422, 'DU_LIEU_KHONG_HOP_LE', m, chiTiet),
  yeuCauSai: (m, chiTiet) => new AppError(400, 'YEU_CAU_KHONG_HOP_LE', m, chiTiet),
  quaNhieuLan: (m = 'Thử quá nhiều lần, vui lòng đợi rồi thử lại') => new AppError(429, 'QUA_NHIEU_LAN_THU', m),
}

module.exports = { AppError, loi }
