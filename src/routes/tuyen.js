'use strict'
const db = require('../db')
const { loi } = require('../errors')
const { z, phanTich, uuid, kinhDo, viDo, boolLong, layId } = require('../validate')
const { dang } = require('../registry')
const { cotTaoSchema, cotSuaSchema } = require('../services/cot')
const tuyenSv = require('../services/tuyen')
const kml = require('../services/kml')
const excel = require('../services/excel')
const { guiTep, KIEU_XLSX, KIEU_KML } = require('./chung')

const NHOM = 'Tuyến, cột, phiên bản'

// ---- khoi dung chung: gio thiet bi + GPS luc thao tac (III.1, III.4)
const gio = z.string().datetime({ offset: true })
const gps = z.object({ kinh_do: kinhDo, vi_do: viDo, do_chinh_xac_m: z.number().min(0).max(100000).optional() }).strict()
const dauVet = { thoi_gian_thiet_bi: gio.optional(), gps: gps.optional() }

/** % lệch theo hướng; bỏ trống / không gửi → 0 khi tạo, không đổi khi sửa (undefined). */
const phanTramLech = z.preprocess(v => {
  if (v === undefined) return undefined
  if (v === null || v === '') return 0
  if (typeof v === 'string') {
    const n = Number(v.trim().replace(',', '.').replace(/%$/, ''))
    return Number.isFinite(n) ? n : v
  }
  return v
}, z.number().min(0).max(100))
const phanTramLechTuyChon = phanTramLech.optional()
const truongLech = {
  phan_tram_lech_bac: phanTramLechTuyChon,
  phan_tram_lech_nam: phanTramLechTuyChon,
  phan_tram_lech_dong: phanTramLechTuyChon,
  phan_tram_lech_tay: phanTramLechTuyChon,
}

const duongSchema = z.object({
  loai: z.enum(['do_duong', 've_tay']).optional(),
  ten: z.string().trim().max(200).nullable().optional(),
  toa_do: z.array(z.tuple([kinhDo, viDo])).min(2).max(20000),
  mau: z.string().trim().max(9).nullable().optional(),
  do_day: z.number().int().min(1).max(100).nullable().optional(),
}).strict()
const diemTrack = z.object({
  kinh_do: kinhDo, vi_do: viDo, thoi_gian: gio.optional(), do_chinh_xac_m: z.number().min(0).max(100000).optional(),
  nguon: z.enum(['gps', 'network', 'fused']).optional(),
}).strict()

dang({
  method: 'get', path: '/tuyen', quyen: 'tuyen.xem', nhom: NHOM,
  tom_tat: 'Danh sách tuyến trong phạm vi được xem',
  tham_so: 'Query: trang, so_luong, tao_boi (id nhân viên), du_an_id, trang_thai (dang_khao_sat|hoan_thien), q (tên tuyến)',
  ket_qua: 'Phân trang { du_lieu, phan_trang }; mỗi tuyến có so_cot, chieu_dai_tuyen_m, he_so_n, chieu_dai_cap_m, phan_tram_lech_*, phien_ban_hien_tai',
  xuLy: async (req, res) => res.json(await tuyenSv.danhSach(req, req.query)),
})

const tuyenTao = z.object({
  ten_tuyen: z.string().trim().min(1).max(200),
  du_an_id: uuid.nullable().optional(),
  loai_cong_trinh_id: z.number().int().positive().nullable().optional(),
  nguon_tao: z.enum(['android', 'web']).optional(),
  ...truongLech,
  ...dauVet,
}).strict()

dang({
  method: 'post', path: '/tuyen', quyen: 'tuyen.tao', nhom: NHOM,
  tom_tat: 'Tạo tuyến rỗng',
  tham_so: 'Body: ten_tuyen, du_an_id, loai_cong_trinh_id, nguon_tao (android|web), phan_tram_lech_bac|nam|dong|tay (0–100, mặc định 0), thoi_gian_thiet_bi, gps',
  ket_qua: '201 + tuyến',
  ghi_chu: 'Tiền tố "T_" ở đầu tên bị bỏ. Tên không phân biệt hoa thường và phải duy nhất trong cùng dự án (409). Chưa có phiên bản cho đến khi gọi POST /tuyen/:id/luu. % lệch theo hướng không gửi thì = 0.',
  xuLy: async (req, res) => res.status(201).json(await tuyenSv.tao(req, phanTich(tuyenTao, req.body))),
})

// Phai dang truoc /tuyen/:id
dang({
  method: 'post', path: '/tuyen/nhap-kml', quyen: 'tuyen.nhap_kml', nhom: NHOM,
  tom_tat: 'Nhập tệp KML (web hoặc Android) thành các tuyến mới, mỗi tuyến có phiên bản đầu tiên',
  tham_so: 'Body: nội dung KML (Content-Type application/xml, text/xml hoặc text/plain) hoặc JSON { kml }. Query: du_an_id (đặt tuyến vào dự án), khi_trung = loi | doi_ten | bo_qua (mặc định loi), thu = true (chạy thử, không ghi)',
  ket_qua: '{ da_luu, nguon_tep, du_an_moi, tuyen: [{ id, ten_tuyen, so_cot, chieu_dai_tuyen_m, so_canh_bao, canh_bao }], bo_qua, canh_bao_theo_loai }',
  ghi_chu: 'Trọn gói trong một giao dịch: lỗi thì không tuyến nào được tạo. Nhận diện nguồn tệp theo thẻ AC/DAI, LoaiCot/hientrangcot (web) — khác thì coi là Android. Mã ngoài danh mục thành rỗng, giá trị gốc giữ trong thuoc_tinh_khac và được liệt kê trong canh_bao.',
  xuLy: async (req, res) => {
    const q = phanTich(z.object({
      du_an_id: uuid.optional(), khi_trung: z.enum(['loi', 'doi_ten', 'bo_qua']).optional(), thu: boolLong.optional(),
    }).passthrough(), Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : v])), 'query')
    const noiDung = typeof req.body === 'string' ? req.body : (req.body && typeof req.body.kml === 'string' ? req.body.kml : null)
    if (noiDung === null) throw loi.yeuCauSai('Thiếu nội dung KML (gửi XML thô hoặc JSON { kml })')
    const kq = await kml.nhap(req, noiDung, { du_an_id: q.du_an_id, khi_trung: q.khi_trung, thu: q.thu })
    res.status(q.thu ? 200 : 201).json(kq)
  },
})

dang({
  method: 'get', path: '/tuyen/:id', quyen: 'tuyen.xem', nhom: NHOM,
  tom_tat: 'Chi tiết tuyến',
  tham_so: 'Query: kem = cot,duong,track (danh sách phần đi kèm)',
  ghi_chu: 'Tuyến ngoài phạm vi trả 404.',
  xuLy: async (req, res) => res.json(await tuyenSv.chiTiet(req, layId(req), req.query.kem)),
})

const tuyenSua = z.object({
  ten_tuyen: z.string().trim().min(1).max(200).optional(),
  du_an_id: uuid.nullable().optional(),
  loai_cong_trinh_id: z.number().int().positive().nullable().optional(),
  ...truongLech,
  ...dauVet,
}).strict()

dang({
  method: 'patch', path: '/tuyen/:id', quyen: 'tuyen.sua', nhom: NHOM,
  tom_tat: 'Sửa tên, dự án, loại công trình, % lệch theo hướng của tuyến',
  tham_so: 'Body: ten_tuyen, du_an_id, loai_cong_trinh_id, phan_tram_lech_bac|nam|dong|tay',
  ghi_chu: 'Đổi loại công trình tính lại hệ số n và chiều dài cáp = chiều dài tuyến × n ngay (chưa tạo phiên bản). % lệch không gửi thì giữ nguyên.',
  xuLy: async (req, res) => res.json(await tuyenSv.suaThongTin(req, layId(req), phanTich(tuyenSua, req.body))),
})

dang({
  method: 'delete', path: '/tuyen/:id', quyen: 'tuyen.xoa', nhom: NHOM,
  tom_tat: 'Xóa (mềm) tuyến',
  ghi_chu: 'Phiên bản và nhật ký được giữ.',
  xuLy: async (req, res) => res.json(await tuyenSv.xoa(req, layId(req), phanTich(z.object(dauVet).strict(), req.body))),
})

// ------------------------------------------------------------------ luu va phien ban

const luuSchema = z.object({
  ma_yeu_cau: uuid.optional(),
  phien_ban_co_so: z.number().int().min(0).optional(),
  ghi_de: z.boolean().optional(),
  loai_luu: z.enum(['hien_truong', 'chinh_sua_sau']).optional(),
  loai_cong_trinh_id: z.number().int().positive().nullable().optional(),
  ...truongLech,
  cot: z.array(cotTaoSchema).max(5000).optional(),
  duong: z.array(duongSchema).max(200).optional(),
  track: z.array(diemTrack).max(100000).optional(),
  ma_thiet_bi: z.string().trim().min(1).max(100).optional(),
  ghi_chu: z.string().trim().max(500).optional(),
  ...dauVet,
}).strict()

dang({
  method: 'post', path: '/tuyen/:id/luu', quyen: 'tuyen.luu', nhom: NHOM,
  tom_tat: 'Lưu tuyến: ghi cột/đường/track (nếu gửi), tính lại, tạo phiên bản mới và nhật ký',
  tham_so: 'Body: cot[] (thay TOÀN BỘ cột hiện có theo thứ tự gửi), duong[], track[] (các phần không gửi giữ nguyên), loai_cong_trinh_id, ma_yeu_cau (UUID chống lưu trùng khi gửi lại), phien_ban_co_so (số phiên bản máy đang giữ), ghi_de, loai_luu, ma_thiet_bi, thoi_gian_thiet_bi, gps, ghi_chu',
  ket_qua: '201 + { tuyen, phien_ban } (200 và trung_lap = true nếu ma_yeu_cau đã được xử lý)',
  ghi_chu: 'loai_luu mặc định: hien_truong khi tuyến chưa hoàn thiện, chinh_sua_sau khi đã hoàn thiện (III.4). Tuyến đã hoàn thiện không nhận loai_luu = hien_truong. phien_ban_co_so khác phiên bản hiện tại và không ghi_de: 409 XUNG_DOT_PHIEN_BAN. Cột có id đã tồn tại thì cập nhật, cột không còn trong danh sách bị xóa mềm. Giờ máy chủ do CSDL đóng dấu, không nhận từ máy khách. Phiên bản đánh số liên tục, không trùng kể cả khi hai máy lưu cùng lúc.',
  xuLy: async (req, res) => {
    const kq = await tuyenSv.luu(req, layId(req), phanTich(luuSchema, req.body))
    res.status(kq.trung_lap ? 200 : 201).json(kq)
  },
})

const luuKmlSchema = luuSchema.omit({ cot: true, duong: true, track: true }).extend({ kml: z.string().min(1) }).strict()

dang({
  method: 'post', path: '/tuyen/:id/luu-kml', quyen: 'tuyen.luu', nhom: NHOM,
  tom_tat: 'Lưu tuyến từ nội dung KML (dùng cho ứng dụng Android): ghép cột, tính lại, tạo phiên bản mới',
  tham_so: 'Body JSON: kml (chuỗi KML của đúng một tuyến), cùng các trường như POST /tuyen/:id/luu (loai_cong_trinh_id, ma_yeu_cau, phien_ban_co_so, ghi_de, loai_luu, ma_thiet_bi, thoi_gian_thiet_bi, gps, ghi_chu) trừ cot, duong, track',
  ket_qua: '201 + { tuyen, phien_ban, nguon_tep, so_canh_bao, canh_bao } (200 và trung_lap = true nếu ma_yeu_cau đã được xử lý)',
  ghi_chu: 'Cột trong KML được ghép với cột hiện có theo tên rồi theo tọa độ để giữ mã cột; cột không còn trong KML bị xóa mềm. "Đo đường" của tệp Android bị bỏ qua (đường giữ nguyên); track được thay nếu KML có "Current Track". Mã ngoài danh mục thành rỗng và được liệt kê trong canh_bao. Quy tắc loai_luu, XUNG_DOT_PHIEN_BAN và ma_yeu_cau như POST /tuyen/:id/luu.',
  xuLy: async (req, res) => {
    const { kml: noiDung, ...tuyChon } = phanTich(luuKmlSchema, req.body)
    const kq = await kml.luuTuKml(req, layId(req), noiDung, tuyChon)
    res.status(kq.trung_lap ? 200 : 201).json(kq)
  },
})

dang({
  method: 'post', path: '/tuyen/:id/hoan-thien', quyen: 'tuyen.hoan_thien', nhom: NHOM,
  tom_tat: 'Đánh dấu tuyến hoàn thiện (phiên bản hiện tại thành bản hoàn thiện)',
  ghi_chu: 'Phải đã lưu ít nhất một lần (409 nếu chưa). Sau đó các lần lưu là chinh_sua_sau.',
  xuLy: async (req, res) => res.json(await tuyenSv.hoanThien(req, layId(req), phanTich(z.object(dauVet).strict(), req.body))),
})

dang({
  method: 'post', path: '/tuyen/:id/mo-lai', quyen: 'tuyen.hoan_thien', nhom: NHOM,
  tom_tat: 'Mở lại tuyến đã hoàn thiện về trạng thái đang khảo sát',
  xuLy: async (req, res) => res.json(await tuyenSv.moLai(req, layId(req), phanTich(z.object(dauVet).strict(), req.body))),
})

dang({
  method: 'get', path: '/tuyen/:id/phien-ban', quyen: 'phien_ban.xem', nhom: NHOM,
  tom_tat: 'Danh sách phiên bản của tuyến (mới nhất trước)',
  ket_qua: '[{ so_phien_ban, loai_luu, la_ban_hoan_thien, tai_khoan, thoi_gian_thiet_bi, thoi_gian_server, gps, so_cot, chieu_dai_tuyen_m, he_so_n, chieu_dai_cap_m, so_cot_them, so_cot_sua, so_cot_xoa }]',
  xuLy: async (req, res) => res.json(await tuyenSv.dsPhienBan(req, layId(req))),
})

// Phai dang truoc /phien-ban/:so
dang({
  method: 'get', path: '/tuyen/:id/phien-ban/so-sanh', quyen: 'phien_ban.xem', nhom: NHOM,
  tom_tat: 'So sánh hai phiên bản: cột thêm, sửa (kèm tên trường), xóa',
  tham_so: 'Query: tu, den (số phiên bản)',
  xuLy: async (req, res) => {
    const q = phanTich(z.object({ tu: z.coerce.number().int().min(1), den: z.coerce.number().int().min(1) }).passthrough(), req.query, 'query')
    res.json(await tuyenSv.soSanhPhienBan(req, layId(req), q.tu, q.den))
  },
})

dang({
  method: 'get', path: '/tuyen/:id/phien-ban/:so', quyen: 'phien_ban.xem', nhom: NHOM,
  tom_tat: 'Xem chi tiết một phiên bản (hình dạng tuyến và toàn bộ dữ liệu cột lúc lưu)',
  ket_qua: 'Phiên bản kèm hinh_dang { cot, duong, track } và du_lieu_cot',
  xuLy: async (req, res) => {
    const so = Number(req.params.so)
    if (!Number.isInteger(so) || so < 1) throw loi.yeuCauSai('Số phiên bản phải là số nguyên dương')
    res.json(await tuyenSv.chiTietPhienBan(req, layId(req), so))
  },
})

// ------------------------------------------------------------------ cot, track

const cotThem = cotTaoSchema.extend({ vi_tri: z.number().int().min(1).optional(), ...dauVet }).strict()
const cotSua = cotSuaSchema.extend({ ...dauVet }).strict()

dang({
  method: 'post', path: '/tuyen/:id/cot', quyen: 'tuyen.sua', nhom: NHOM,
  tom_tat: 'Thêm một cột (vi_tri để chèn giữa tuyến)',
  tham_so: 'Body: các trường cột (xem mô hình cột), vi_tri (1..n+1, mặc định cuối), thoi_gian_thiet_bi, gps',
  ket_qua: '201 + { cot, tuyen }',
  ghi_chu: 'Thao tác ghi nhật ký (sửa) và tính lại chiều dài ngay; chưa tạo phiên bản cho đến khi lưu. Hiện trạng cột/vật tư/bể cáp tự suy từ mã (R6); chiều cao phải thuộc danh mục.',
  xuLy: async (req, res) => res.status(201).json(await tuyenSv.themCot(req, layId(req), phanTich(cotThem, req.body))),
})

dang({
  method: 'put', path: '/tuyen/:id/cot/thu-tu', quyen: 'tuyen.sua', nhom: NHOM,
  tom_tat: 'Sắp xếp lại thứ tự cột của tuyến',
  tham_so: 'Body: ids (đúng tất cả id cột hiện có, mỗi cột một lần, theo thứ tự mới)',
  xuLy: async (req, res) => {
    const b = phanTich(z.object({ ids: z.array(uuid).min(1).max(5000), ...dauVet }).strict(), req.body)
    if (new Set(b.ids).size !== b.ids.length) throw loi.duLieuSai('Danh sách có id trùng', [{ truong: 'body.ids', thong_diep: 'Trùng id' }])
    const { ids, ...dv } = b
    res.json(await tuyenSv.sapXepCot(req, layId(req), ids, dv))
  },
})

dang({
  method: 'post', path: '/tuyen/:id/track', quyen: 'tuyen.sua', nhom: NHOM,
  tom_tat: 'Thêm điểm track GPS vào cuối',
  tham_so: 'Body: diem[] { kinh_do, vi_do, thoi_gian, do_chinh_xac_m, nguon }',
  ket_qua: '{ so_diem_them, tong_so_diem }',
  xuLy: async (req, res) => {
    const b = phanTich(z.object({ diem: z.array(diemTrack).min(1).max(100000), ...dauVet }).strict(), req.body)
    const { diem, ...dv } = b
    res.status(201).json(await tuyenSv.themTrack(req, layId(req), diem, dv))
  },
})

dang({
  method: 'patch', path: '/cot/:id', quyen: 'tuyen.sua', nhom: NHOM,
  tom_tat: 'Sửa một phần thông tin cột',
  tham_so: 'Body: các trường cột cần đổi, thoi_gian_thiet_bi, gps',
  ket_qua: '{ cot, tuyen }',
  ghi_chu: 'Trường chỉ gửi khi đổi; trường không đổi mà đã không còn trong danh mục (dữ liệu cũ) không bị chặn.',
  xuLy: async (req, res) => res.json(await tuyenSv.suaCot(req, layId(req), phanTich(cotSua, req.body))),
})

dang({
  method: 'delete', path: '/cot/:id', quyen: 'tuyen.sua', nhom: NHOM,
  tom_tat: 'Xóa (mềm) một cột; đánh số lại thứ tự',
  ket_qua: '{ cot_id, da_xoa, tuyen }',
  xuLy: async (req, res) => res.json(await tuyenSv.xoaCot(req, layId(req), phanTich(z.object(dauVet).strict(), req.body))),
})

// ------------------------------------------------------------------ xuat

dang({
  method: 'get', path: '/tuyen/:id/kml', quyen: 'tuyen.xuat_kml', nhom: NHOM,
  tom_tat: 'Xuất tuyến ra tệp KML',
  tham_so: 'Query: dinh_dang = web (mặc định) | android',
  ket_qua: 'Tệp .kml (application/vnd.google-earth.kml+xml)',
  ghi_chu: 'Khác biệt hai định dạng: thẻ AC/UD là Đế U (web) hay Dài (Android); web có thêm AC/DAI; chiều cao "6.5" (web) hay "6.5m" (Android). Nội dung xuất là dữ liệu hiện tại của tuyến, không phải phiên bản đã lưu.',
  xuLy: async (req, res) => {
    const dd = req.query.dinh_dang || 'web'
    if (dd !== 'web' && dd !== 'android') throw loi.yeuCauSai('dinh_dang phải là web hoặc android')
    const id = layId(req)
    const t = await tuyenSv.layTuyen(req, db, id)
    const [cots, duongs, track] = await Promise.all([tuyenSv.layCotHienTai(db, id), tuyenSv.layDuong(db, id), tuyenSv.layTrack(db, id)])
    guiTep(res, { noiDung: kml.xuat(t, cots, duongs, track, dd), tenTep: `T_${excel.tenTep(t.ten_tuyen)}.kml`, kieu: KIEU_KML })
  },
})

dang({
  method: 'get', path: '/tuyen/:id/excel', quyen: 'tuyen.xuat_excel', nhom: NHOM,
  tom_tat: 'Xuất tuyến ra Excel: tổng hợp (loại công trình, hệ số n, chiều dài tuyến, chiều dài cáp) và danh sách cột',
  ket_qua: 'Tệp .xlsx',
  xuLy: async (req, res) => {
    const kq = await excel.xuatTuyen(req, layId(req))
    guiTep(res, { noiDung: kq.buffer, tenTep: kq.ten_tep, kieu: KIEU_XLSX })
  },
})
