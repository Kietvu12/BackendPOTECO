'use strict'
const { dang } = require('../registry')
const truyVan = require('../services/truyVan')
const excel = require('../services/excel')
const { guiTep, KIEU_XLSX } = require('./chung')

const NHOM = 'Nhật ký và lịch sử'

dang({
  method: 'get', path: '/nhat-ky', quyen: 'nhat_ky.xem', nhom: NHOM,
  tom_tat: 'Nhật ký thao tác theo tài khoản (III.1): ai làm gì, giờ thiết bị, giờ máy chủ, GPS, nguồn điểm',
  tham_so: 'Query: trang, so_luong, tai_khoan_id, tuyen_id, hanh_dong (tao|luu|sua|gui|dong_bo), loai_luu (hien_truong|chinh_sua_sau), nguon_diem, tu_ngay, den_ngay (YYYY-MM-DD, giờ Việt Nam)',
  ket_qua: 'Phân trang; mỗi dòng có thoi_gian_thiet_bi, thoi_gian_server, gps_*, nguon_diem, chi_tiet',
  ghi_chu: 'Chỉ thấy nhật ký của tài khoản trong phạm vi (nhân viên: mình; quản lý: cả nhánh dưới; quản trị: tất cả). Nhật ký quá hạn lưu trữ (mặc định 30 ngày) bị xóa.',
  xuLy: async (req, res) => res.json(await truyVan.danhSachNhatKy(req, req.query)),
})

// Phai dang truoc cac route /nhat-ky/:...
dang({
  method: 'get', path: '/nhat-ky/excel', quyen: 'nhat_ky.xuat_excel', nhom: NHOM,
  tom_tat: 'Xuất nhật ký hoạt động ra Excel (III.7)',
  tham_so: 'Cùng bộ lọc với GET /nhat-ky (không phân trang)',
  ket_qua: 'Tệp .xlsx; tối đa 50.000 dòng, nếu bị cắt có thêm trang "Lưu ý"',
  xuLy: async (req, res) => {
    const { rows, bi_cat } = await truyVan.nhatKyDeXuat(req, req.query)
    const kq = await excel.xuatNhatKy(rows, bi_cat)
    guiTep(res, { noiDung: kq.buffer, tenTep: kq.ten_tep, kieu: KIEU_XLSX })
  },
})

dang({
  method: 'post', path: '/nhat-ky', quyen: 'nhat_ky.ghi', nhom: NHOM,
  tom_tat: 'Ứng dụng ghi sự kiện "gửi" hoặc "đồng bộ" của chính mình',
  tham_so: 'Body: hanh_dong (gui|dong_bo), tuyen_id (tuỳ chọn), thoi_gian_thiet_bi, gps, chi_tiet',
  ket_qua: '201 + { id, thoi_gian_server }',
  ghi_chu: 'Các hành động tao, luu, sua do máy chủ tự ghi khi thao tác thành công nên không nhận từ máy khách.',
  xuLy: async (req, res) => res.status(201).json(await truyVan.ghiSuKien(req, req.body)),
})

dang({
  method: 'get', path: '/lich-su', quyen: 'lich_su.xem', nhom: NHOM,
  tom_tat: 'Tra cứu theo ngày (III.5): mỗi nhân viên đã lưu những tuyến nào và tuyến cuối cùng trong ngày',
  tham_so: 'Query: ngay (YYYY-MM-DD, bắt buộc, giờ Việt Nam), tai_khoan_id (tuỳ chọn)',
  ket_qua: '{ ngay, nhan_vien: [{ tai_khoan_id, ho_ten, tuyen_cuoi_trong_ngay, tuyen: [{ ten_tuyen, so_lan_luu, phien_ban_cuoi, loai_luu_cuoi, luu_luc_cuoi, gps_*, la_tuyen_cuoi_trong_ngay }] }] }',
  ghi_chu: 'Lấy từ phiên bản tuyến (không phụ thuộc hạn lưu trữ nhật ký). Phạm vi theo cấp quản lý.',
  xuLy: async (req, res) => res.json(await truyVan.lichSuTheoNgay(req, req.query)),
})
