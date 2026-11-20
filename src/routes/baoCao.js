'use strict'
const { dang } = require('../registry')
const { layId } = require('../validate')
const truyVan = require('../services/truyVan')
const excel = require('../services/excel')
const { guiTep, KIEU_XLSX } = require('./chung')

const NHOM = 'Báo cáo'

dang({
  method: 'get', path: '/bao-cao/hoan-thien-tuyen', quyen: 'bao_cao.hoan_thien_tuyen', nhom: NHOM,
  tom_tat: 'Track log thời gian hoàn thiện tuyến (III.6): tuyến, người làm, lúc tạo, lúc lưu đầu, lúc hoàn thiện',
  tham_so: 'Query: trang, so_luong, tai_khoan_id, tu_ngay, den_ngay (lọc theo ngày hoàn thiện, giờ Việt Nam)',
  ket_qua: 'Phân trang; mỗi dòng có tao_luc, luu_dau_luc, hoan_thien_luc, tong_phut_tu_luc_tao, so_phien_ban, so_lan_chinh_sua_sau, chieu_dai_cap_m',
  ghi_chu: 'Kế toán xem toàn bộ tuyến đã hoàn thiện; quản lý theo cấp; nhân viên chỉ tuyến của mình.',
  xuLy: async (req, res) => res.json(await truyVan.baoCaoHoanThien(req, req.query)),
})

dang({
  method: 'get', path: '/bao-cao/hoan-thien-tuyen/:id/track-log', quyen: 'bao_cao.hoan_thien_tuyen', nhom: NHOM,
  tom_tat: 'Dòng thời gian của một tuyến: các phiên bản (giờ, người, GPS) và nhật ký thao tác',
  ket_qua: '{ tuyen, phien_ban[], nhat_ky[], ghi_chu }',
  ghi_chu: 'phien_ban được giữ lâu dài; nhat_ky chỉ còn trong thời hạn lưu trữ.',
  xuLy: async (req, res) => res.json(await truyVan.trackLogTuyen(req, layId(req))),
})

dang({
  method: 'get', path: '/bao-cao/khoi-luong-cap', quyen: 'bao_cao.khoi_luong_cap', nhom: NHOM,
  tom_tat: 'Khối lượng cáp theo tuyến (IV.3): chiều dài tuyến, hệ số n, chiều dài cáp = chiều dài tuyến × n, kèm tổng',
  tham_so: 'Query: trang, so_luong, du_an_id, loai_cong_trinh_id, tai_khoan_id, trang_thai',
  ket_qua: 'Phân trang + tong { so_tuyen, so_cot, chieu_dai_tuyen_m, chieu_dai_cap_m, so_tuyen_chua_co_chieu_dai_cap }',
  ghi_chu: 'Tuyến chưa chọn loại công trình có chiều dài cáp rỗng (không tính vào tổng).',
  xuLy: async (req, res) => res.json(await truyVan.baoCaoKhoiLuongCap(req, req.query)),
})

dang({
  method: 'get', path: '/bao-cao/khoi-luong-cap/excel', quyen: 'bao_cao.khoi_luong_cap', nhom: NHOM,
  tom_tat: 'Xuất báo cáo khối lượng cáp ra Excel (IV.5)',
  tham_so: 'Cùng bộ lọc với báo cáo (không phân trang)',
  ket_qua: 'Tệp .xlsx có dòng tổng',
  xuLy: async (req, res) => {
    const { rows, bi_cat } = await truyVan.khoiLuongDeXuat(req, req.query)
    const kq = await excel.xuatKhoiLuongCap(rows, bi_cat)
    guiTep(res, { noiDung: kq.buffer, tenTep: kq.ten_tep, kieu: KIEU_XLSX })
  },
})
