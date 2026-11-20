'use strict'
const db = require('../db')
const { loi } = require('../errors')
const { z, phanTich } = require('../validate')
const { dang } = require('../registry')
const danhMuc = require('../services/danhMuc')

const NHOM = 'Danh mục'

dang({
  method: 'get', path: '/danh-muc', quyen: 'danh_muc.xem', nhom: NHOM,
  tom_tat: 'Toàn bộ danh mục cho ứng dụng (loại cột, vật tư, bể cáp, phụ kiện, chiều cao, giá trị đơn giản, loại công trình)',
  tham_so: 'Query: chi_hoat_dong=1 chỉ lấy mục đang dùng',
  ket_qua: '{ loai_cot, vat_tu, be_cap, phu_kien, chieu_cao, gia_tri: { <nhom>: [...] }, loai_cong_trinh }',
  ghi_chu: 'Bộ nhớ đệm phía máy chủ 60 giây (danh mục sửa hiếm).',
  xuLy: async (req, res) => {
    const { duLieu } = await danhMuc.lay()
    if (req.query.chi_hoat_dong !== '1') return res.json(duLieu)
    const loc = (ds) => ds.filter(x => x.hoat_dong)
    res.json({
      loai_cot: loc(duLieu.loai_cot), vat_tu: loc(duLieu.vat_tu), be_cap: loc(duLieu.be_cap), phu_kien: loc(duLieu.phu_kien),
      chieu_cao: loc(duLieu.chieu_cao),
      gia_tri: Object.fromEntries(Object.entries(duLieu.gia_tri).map(([k, v]) => [k, loc(v)])),
      loai_cong_trinh: loc(duLieu.loai_cong_trinh),
    })
  },
})

// ------------------------------------------------------------ loai cong trinh (IV.2)

const heSoN = z.number().positive().max(999.999).refine(v => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, 'Tối đa 3 chữ số thập phân')
const loaiCongTrinhTao = z.object({
  ma: z.string().trim().regex(/^[A-Za-z0-9_.-]{1,40}$/, '1-40 ký tự gồm chữ, số, . _ -'),
  ten: z.string().trim().min(1).max(150),
  he_so_n: heSoN,
}).strict()
const loaiCongTrinhSua = z.object({
  ten: z.string().trim().min(1).max(150).optional(),
  he_so_n: heSoN.optional(),
  hoat_dong: z.boolean().optional(),
}).strict()

dang({
  method: 'get', path: '/danh-muc/loai-cong-trinh', quyen: 'danh_muc.xem', nhom: NHOM,
  tom_tat: 'Danh sách loại công trình và hệ số n',
  xuLy: async (_req, res) => res.json((await danhMuc.lay()).duLieu.loai_cong_trinh),
})

dang({
  method: 'post', path: '/danh-muc/loai-cong-trinh', quyen: 'danh_muc.sua_loai_cong_trinh', nhom: NHOM,
  tom_tat: 'Thêm loại công trình với hệ số n',
  tham_so: 'Body: ma, ten, he_so_n (> 0)',
  ket_qua: '201 + loại công trình',
  xuLy: async (req, res) => {
    const b = phanTich(loaiCongTrinhTao, req.body)
    const r = (await db.query(
      `INSERT INTO dm_loai_cong_trinh (ma, ten, he_so_n, cap_nhat_boi) VALUES ($1,$2,$3,$4)
       RETURNING id, ma, ten, he_so_n, hoat_dong, cap_nhat_boi, cap_nhat_luc`, [b.ma, b.ten, b.he_so_n, req.user.id])).rows[0]
    danhMuc.lamMoi()
    res.status(201).json(r)
  },
})

dang({
  method: 'patch', path: '/danh-muc/loai-cong-trinh/:id', quyen: 'danh_muc.sua_loai_cong_trinh', nhom: NHOM,
  tom_tat: 'Sửa tên, hệ số n hoặc tắt loại công trình',
  tham_so: 'Body: ten, he_so_n, hoat_dong',
  ghi_chu: 'Đổi hệ số n KHÔNG tự tính lại các tuyến đã lưu: chiều dài cáp của chúng giữ theo hệ số lúc lưu; tuyến nhận hệ số mới ở lần lưu kế tiếp. Loại đã tắt không chọn được cho tuyến mới nhưng tuyến đang dùng vẫn giữ.',
  xuLy: async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1 || id > 32767) throw loi.yeuCauSai('Tham số id phải là số nguyên dương')
    const b = phanTich(loaiCongTrinhSua, req.body)
    if (!Object.keys(b).length) throw loi.yeuCauSai('Không có trường nào để sửa')
    const sets = []
    const val = []
    for (const k of ['ten', 'he_so_n', 'hoat_dong']) if (b[k] !== undefined) { val.push(b[k]); sets.push(`${k} = $${val.length}`) }
    val.push(req.user.id); sets.push(`cap_nhat_boi = $${val.length}`)
    val.push(id)
    const r = await db.query(
      `UPDATE dm_loai_cong_trinh SET ${sets.join(', ')} WHERE id = $${val.length}
       RETURNING id, ma, ten, he_so_n, hoat_dong, cap_nhat_boi, cap_nhat_luc`, val)
    if (!r.rows[0]) throw loi.khongThay('Không tìm thấy loại công trình')
    danhMuc.lamMoi()
    res.json(r.rows[0])
  },
})

// ------------------------------------------------------------ cac danh muc con lai

const ma30 = z.string().trim().regex(/^[^\s].{0,29}$/, '1-30 ký tự')
const tuyChon = {
  ten: z.string().trim().max(150).nullable().optional(),
  icon_key: z.string().trim().max(60).nullable().optional(),
  ghi_chu: z.string().trim().max(1000).nullable().optional(),
  thu_tu: z.number().int().min(0).max(32000).optional(),
}
const htHai = z.enum(['tm', 'cs'])

/** loai (duong dan) -> bang, khoa, truong tao, truong sua. Chi cac cot nay moi duoc ghi (khong noi chuoi tu nguoi dung). */
const DANH_MUC = {
  'loai-cot': { bang: 'dm_loai_cot', khoa: 'ma', tao: { ma: ma30, hien_trang: htHai, ...tuyChon }, sua: ['ten', 'icon_key', 'ghi_chu', 'thu_tu', 'hoat_dong'] },
  'vat-tu': { bang: 'dm_vat_tu', khoa: 'ma', tao: { ma: ma30, hien_trang_ap_dung: z.enum(['tm', 'cs', 'ca_hai']), ...tuyChon }, sua: ['ten', 'icon_key', 'ghi_chu', 'thu_tu', 'hoat_dong'] },
  'be-cap': { bang: 'dm_be_cap', khoa: 'ma', tao: { ma: ma30, hien_trang: htHai, ...tuyChon }, sua: ['ten', 'icon_key', 'ghi_chu', 'thu_tu', 'hoat_dong'] },
  'phu-kien': { bang: 'dm_phu_kien_cot', khoa: 'ma', tao: { ma: ma30, ...tuyChon }, sua: ['ten', 'icon_key', 'ghi_chu', 'thu_tu', 'hoat_dong'] },
  'chieu-cao': {
    bang: 'dm_chieu_cao_cot', khoa: 'gia_tri_m',
    tao: { gia_tri_m: z.number().positive().max(99.9), ten: z.string().trim().min(1).max(10), thu_tu: z.number().int().min(0).max(32000).optional() },
    sua: ['ten', 'thu_tu', 'hoat_dong'],
  },
}

function cauHinh(req) {
  const c = DANH_MUC[req.params.loai]
  if (!c) throw loi.khongThay('Loại danh mục không tồn tại')
  return c
}

dang({
  method: 'post', path: '/danh-muc/:loai', quyen: 'danh_muc.sua', nhom: NHOM,
  tom_tat: 'Thêm mục danh mục. :loai = loai-cot | vat-tu | be-cap | phu-kien | chieu-cao | gia-tri',
  tham_so: 'Body theo loại. loai-cot: ma, hien_trang (tm|cs), ten...; vat-tu: ma, hien_trang_ap_dung (tm|cs|ca_hai); be-cap: ma, hien_trang; phu-kien: ma; chieu-cao: gia_tri_m, ten; gia-tri: nhom, ma, ten',
  ghi_chu: 'Không xoá cứng: tắt bằng PATCH hoat_dong=false để dữ liệu cũ vẫn đọc được.',
  xuLy: async (req, res) => {
    if (req.params.loai === 'gia-tri') {
      const b = phanTich(z.object({
        nhom: z.string().trim().regex(/^[a-z0-9_]{1,40}$/), ma: z.string().trim().min(1).max(60),
        ten: z.string().trim().min(1).max(120), thu_tu: z.number().int().min(0).max(32000).optional(),
      }).strict(), req.body)
      const r = (await db.query(
        'INSERT INTO dm_gia_tri (nhom, ma, ten, thu_tu) VALUES ($1,$2,$3,$4) RETURNING nhom, ma, ten, thu_tu, hoat_dong',
        [b.nhom, b.ma, b.ten, b.thu_tu || 0])).rows[0]
      danhMuc.lamMoi()
      return res.status(201).json(r)
    }
    const c = cauHinh(req)
    const b = phanTich(z.object(c.tao).strict(), req.body)
    const cot = Object.keys(b)
    const r = (await db.query(
      `INSERT INTO ${c.bang} (${cot.join(', ')}) VALUES (${cot.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      cot.map(k => b[k]))).rows[0]
    danhMuc.lamMoi()
    res.status(201).json(r)
  },
})

dang({
  method: 'patch', path: '/danh-muc/gia-tri/:nhom/:ma', quyen: 'danh_muc.sua', nhom: NHOM,
  tom_tat: 'Sửa hoặc tắt giá trị đơn giản (ODF, splitter, treo/neo, UDJ, gông, chủng loại cáp, treo/hầm, đế U, dài)',
  tham_so: 'Body: ten, thu_tu, hoat_dong',
  xuLy: async (req, res) => {
    const b = phanTich(z.object({
      ten: z.string().trim().min(1).max(120).optional(), thu_tu: z.number().int().min(0).max(32000).optional(), hoat_dong: z.boolean().optional(),
    }).strict(), req.body)
    if (!Object.keys(b).length) throw loi.yeuCauSai('Không có trường nào để sửa')
    const cot = Object.keys(b)
    const r = await db.query(
      `UPDATE dm_gia_tri SET ${cot.map((k, i) => `${k} = $${i + 1}`).join(', ')}
        WHERE nhom = $${cot.length + 1} AND ma = $${cot.length + 2} RETURNING nhom, ma, ten, thu_tu, hoat_dong`,
      [...cot.map(k => b[k]), req.params.nhom, req.params.ma])
    if (!r.rows[0]) throw loi.khongThay('Không tìm thấy giá trị')
    danhMuc.lamMoi()
    res.json(r.rows[0])
  },
})

dang({
  method: 'patch', path: '/danh-muc/:loai/:ma', quyen: 'danh_muc.sua', nhom: NHOM,
  tom_tat: 'Sửa hoặc tắt mục danh mục. :loai = loai-cot | vat-tu | be-cap | phu-kien | chieu-cao; :ma là mã (chiều cao: số mét)',
  tham_so: 'Body: ten, icon_key, ghi_chu, thu_tu, hoat_dong (chiều cao chỉ có ten, thu_tu, hoat_dong)',
  ghi_chu: 'Không đổi mã và hiện trạng của mục đã có.',
  xuLy: async (req, res) => {
    const c = cauHinh(req)
    const sch = {}
    for (const k of c.sua) sch[k] = k === 'hoat_dong' ? z.boolean().optional() : (tuyChon[k] || z.string().trim().min(1).max(10).optional())
    const b = phanTich(z.object(sch).strict(), req.body)
    if (!Object.keys(b).length) throw loi.yeuCauSai('Không có trường nào để sửa')
    let khoa = req.params.ma
    if (c.khoa === 'gia_tri_m') {
      khoa = Number(khoa)
      if (!Number.isFinite(khoa)) throw loi.yeuCauSai('Chiều cao phải là số')
    }
    const cot = Object.keys(b)
    const r = await db.query(
      `UPDATE ${c.bang} SET ${cot.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE ${c.khoa} = $${cot.length + 1} RETURNING *`,
      [...cot.map(k => b[k]), khoa])
    if (!r.rows[0]) throw loi.khongThay('Không tìm thấy mục danh mục')
    danhMuc.lamMoi()
    res.json(r.rows[0])
  },
})
