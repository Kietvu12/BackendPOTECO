'use strict'
const db = require('../db')
const { loi } = require('../errors')
const { z, phanTich, uuid, phanTrangTuQuery, boc, layId } = require('../validate')
const { dang } = require('../registry')
const { idTrongPham, trongPham } = require('../phamvi')

const NHOM = 'Dự án'

const COT = `d.id, d.cha_id, d.ten, d.tao_boi, tk.ho_ten AS tao_boi_ho_ten, d.tao_luc, d.cap_nhat_luc,
  (SELECT count(*)::int FROM tuyen t WHERE t.du_an_id = d.id AND t.xoa_luc IS NULL) AS so_tuyen,
  (SELECT count(*)::int FROM du_an c WHERE c.cha_id = d.id AND c.xoa_luc IS NULL) AS so_du_an_con`
const TU = 'FROM du_an d JOIN tai_khoan tk ON tk.id = d.tao_boi'

async function layDuAn(req, q, id, khoa = false) {
  const d = (await q.query(`SELECT id, cha_id, ten, tao_boi FROM du_an WHERE id = $1 AND xoa_luc IS NULL ${khoa ? 'FOR UPDATE' : ''}`, [id])).rows[0]
  const ids = await idTrongPham(req, req.pham_vi, q)
  if (!d || !trongPham(ids, d.tao_boi)) throw loi.khongThay('Không tìm thấy dự án')
  return d
}

async function chiTiet(id) {
  return (await db.query(`SELECT ${COT} ${TU} WHERE d.id = $1`, [id])).rows[0]
}

dang({
  method: 'get', path: '/du-an', quyen: 'du_an.xem', nhom: NHOM,
  tom_tat: 'Danh sách dự án trong phạm vi được xem',
  tham_so: 'Query: trang, so_luong, cha_id (dự án cha) hoặc goc=1 (chỉ dự án gốc), q (tên)',
  ghi_chu: 'Kế toán không có quyền xem dự án; xem khối lượng qua báo cáo.',
  xuLy: async (req, res) => {
    const p = phanTrangTuQuery(req.query)
    const f = phanTich(z.object({ cha_id: uuid.optional(), goc: z.enum(['0', '1']).optional(), q: z.string().trim().max(100).optional() }).passthrough(), req.query, 'query')
    const ids = await idTrongPham(req, req.pham_vi)
    const tham = [ids, f.cha_id || null, f.goc === '1', f.q ? `%${f.q.replace(/[%_\\]/g, m => '\\' + m)}%` : null]
    const dk = `d.xoa_luc IS NULL AND ($1::uuid[] IS NULL OR d.tao_boi = ANY($1::uuid[]))
      AND ($2::uuid IS NULL OR d.cha_id = $2) AND (NOT $3::boolean OR d.cha_id IS NULL) AND ($4::text IS NULL OR d.ten ILIKE $4)`
    const tong = (await db.query(`SELECT count(*)::int AS n FROM du_an d WHERE ${dk}`, tham)).rows[0].n
    const rows = (await db.query(`SELECT ${COT} ${TU} WHERE ${dk} ORDER BY d.ten, d.id LIMIT $5 OFFSET $6`, [...tham, p.so_luong, p.offset])).rows
    res.json(boc(rows, p, tong))
  },
})

dang({
  method: 'get', path: '/du-an/:id', quyen: 'du_an.xem', nhom: NHOM,
  tom_tat: 'Chi tiết dự án', ghi_chu: 'Ngoài phạm vi trả 404.',
  xuLy: async (req, res) => {
    const id = layId(req)
    await layDuAn(req, db, id)
    res.json(await chiTiet(id))
  },
})

const tenDuAn = z.string().trim().min(1).max(200)

dang({
  method: 'post', path: '/du-an', quyen: 'du_an.tao', nhom: NHOM,
  tom_tat: 'Tạo dự án (thư mục chứa tuyến, có thể lồng nhau)',
  tham_so: 'Body: ten, cha_id (tuỳ chọn)',
  ket_qua: '201 + dự án',
  xuLy: async (req, res) => {
    const b = phanTich(z.object({ ten: tenDuAn, cha_id: uuid.nullable().optional() }).strict(), req.body)
    const id = await db.giaoDich(async c => {
      if (b.cha_id) await layDuAn(req, c, b.cha_id)
      return (await c.query('INSERT INTO du_an (cha_id, ten, tao_boi) VALUES ($1,$2,$3) RETURNING id', [b.cha_id || null, b.ten, req.user.id])).rows[0].id
    })
    res.status(201).json(await chiTiet(id))
  },
})

dang({
  method: 'patch', path: '/du-an/:id', quyen: 'du_an.sua', nhom: NHOM,
  tom_tat: 'Đổi tên hoặc di chuyển dự án',
  tham_so: 'Body: ten, cha_id (null = chuyển ra gốc)',
  ghi_chu: 'Không cho chuyển dự án vào chính nó hoặc dự án con của nó.',
  xuLy: async (req, res) => {
    const id = layId(req)
    const b = phanTich(z.object({ ten: tenDuAn.optional(), cha_id: uuid.nullable().optional() }).strict(), req.body)
    if (!Object.keys(b).length) throw loi.yeuCauSai('Không có trường nào để sửa')
    await db.giaoDich(async c => {
      await layDuAn(req, c, id, true)
      if (b.cha_id) {
        await layDuAn(req, c, b.cha_id)
        const vong = (await c.query(
          `WITH RECURSIVE con AS (
             SELECT id FROM du_an WHERE id = $1
             UNION SELECT d.id FROM du_an d JOIN con ON d.cha_id = con.id)
           SELECT 1 FROM con WHERE id = $2`, [id, b.cha_id])).rows[0]
        if (vong) throw loi.duLieuSai('Không thể chuyển dự án vào chính nó hoặc dự án con của nó', [{ truong: 'cha_id', thong_diep: 'Tạo vòng' }])
      }
      const sets = []
      const val = []
      if (b.ten !== undefined) { val.push(b.ten); sets.push(`ten = $${val.length}`) }
      if (b.cha_id !== undefined) { val.push(b.cha_id); sets.push(`cha_id = $${val.length}`) }
      val.push(id)
      await c.query(`UPDATE du_an SET ${sets.join(', ')} WHERE id = $${val.length}`, val)
    })
    res.json(await chiTiet(id))
  },
})

dang({
  method: 'delete', path: '/du-an/:id', quyen: 'du_an.xoa', nhom: NHOM,
  tom_tat: 'Xóa (mềm) dự án',
  ghi_chu: 'Từ chối (409) nếu dự án còn tuyến hoặc dự án con chưa xóa.',
  ket_qua: '{ id, da_xoa: true }',
  xuLy: async (req, res) => {
    const id = layId(req)
    await db.giaoDich(async c => {
      await layDuAn(req, c, id, true)
      const con = (await c.query(
        `SELECT (SELECT count(*) FROM tuyen WHERE du_an_id = $1 AND xoa_luc IS NULL)::int AS tuyen,
                (SELECT count(*) FROM du_an WHERE cha_id = $1 AND xoa_luc IS NULL)::int AS du_an`, [id])).rows[0]
      if (con.tuyen || con.du_an) throw loi.trung('Dự án còn tuyến hoặc dự án con', con)
      await c.query('UPDATE du_an SET xoa_luc = now() WHERE id = $1', [id])
    })
    res.json({ id, da_xoa: true })
  },
})
