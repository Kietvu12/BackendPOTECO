'use strict'
const db = require('../db')
const { loi } = require('../errors')
const danhMuc = require('./danhMuc')
const nhatKy = require('./nhatKy')
const cotSv = require('./cot')
const { idTrongPham, trongPham } = require('../phamvi')
const { phanTrangTuQuery, boc } = require('../validate')

const { TRUONG_SUA } = cotSv
const TRUONG_BOOL_MAC_DINH = { hien_ly_trinh: false, nhan_doi_phu_kien: false, dat_bien_bao: false }
const TRUONG_LECH = ['phan_tram_lech_bac', 'phan_tram_lech_nam', 'phan_tram_lech_dong', 'phan_tram_lech_tay']

/** Chuẩn hóa % lệch: thiếu / null → 0 (API luôn trả số). */
function chuanHoaLech (t) {
  if (!t) return t
  for (const k of TRUONG_LECH) {
    const n = Number(t[k])
    t[k] = Number.isFinite(n) ? n : 0
  }
  return t
}

// ---------------------------------------------------------------- truy cap

/** Lay tuyen chua xoa. Ngoai pham vi -> 404 (khong lo su ton tai). khoa = SELECT ... FOR UPDATE. */
async function layTuyen(req, q, id, khoa = false) {
  const kq = await q.query(
    `SELECT * FROM tuyen WHERE id = $1 AND xoa_luc IS NULL ${khoa ? 'FOR UPDATE' : ''}`, [id])
  const t = kq.rows[0]
  if (!t) throw loi.khongThay('Không tìm thấy tuyến')
  const ids = await idTrongPham(req, req.pham_vi, q)
  if (!trongPham(ids, t.tao_boi)) throw loi.khongThay('Không tìm thấy tuyến')
  return t
}

async function kiemTraDuAn(req, q, duAnId) {
  const kq = await q.query('SELECT id, tao_boi FROM du_an WHERE id = $1 AND xoa_luc IS NULL', [duAnId])
  const d = kq.rows[0]
  const ids = await idTrongPham(req, req.pham_vi, q)
  if (!d || !trongPham(ids, d.tao_boi)) throw loi.duLieuSai('Dự án không tồn tại hoặc ngoài phạm vi', [{ truong: 'du_an_id', thong_diep: 'Dự án không hợp lệ' }])
}

async function kiemTraLoaiCongTrinh(q, id, cu) {
  const kq = await q.query('SELECT id, hoat_dong FROM dm_loai_cong_trinh WHERE id = $1', [id])
  const d = kq.rows[0]
  if (!d) throw loi.duLieuSai('Loại công trình không tồn tại', [{ truong: 'loai_cong_trinh_id', thong_diep: 'Không tồn tại' }])
  if (!d.hoat_dong && cu !== id) throw loi.duLieuSai('Loại công trình đã ngừng dùng', [{ truong: 'loai_cong_trinh_id', thong_diep: 'Đã ngừng dùng' }])
}

async function tinhLai(q, tuyenId) {
  await q.query('SELECT fn_tinh_lai_tuyen($1)', [tuyenId])
  return (await q.query('SELECT * FROM tuyen WHERE id = $1', [tuyenId])).rows[0]
}

async function danhSoLai(q, tuyenId) {
  await q.query(
    `WITH d AS (
       SELECT id, row_number() OVER (ORDER BY thu_tu, tao_luc, id) AS n
         FROM cot WHERE tuyen_id = $1 AND xoa_luc IS NULL)
     UPDATE cot SET thu_tu = d.n FROM d WHERE cot.id = d.id AND cot.thu_tu <> d.n`, [tuyenId])
}

async function layCotHienTai(q, tuyenId) {
  return (await q.query(
    'SELECT * FROM cot WHERE tuyen_id = $1 AND xoa_luc IS NULL ORDER BY thu_tu, tao_luc, id', [tuyenId])).rows
}

async function layDuong(q, tuyenId) {
  return (await q.query(
    `SELECT id, loai, ten, toa_do, mau, do_day FROM duong
      WHERE tuyen_id = $1 AND xoa_luc IS NULL ORDER BY tao_luc, id`, [tuyenId])).rows
}

async function layTrack(q, tuyenId) {
  return (await q.query(
    `SELECT thu_tu, kinh_do, vi_do, thoi_gian, do_chinh_xac_m, nguon FROM track_diem
      WHERE tuyen_id = $1 ORDER BY thu_tu`, [tuyenId])).rows
}

// ---------------------------------------------------------------- doc

async function danhSach(req, query) {
  const p = phanTrangTuQuery(query)
  const ids = await idTrongPham(req, req.pham_vi)
  if (query.tao_boi) {
    if (ids !== null && !ids.includes(query.tao_boi)) throw loi.khongCoQuyen('Người tạo nằm ngoài phạm vi được xem')
  }
  const tham = [
    ids,
    query.tao_boi || null,
    query.du_an_id || null,
    query.trang_thai || null,
    query.q ? `%${String(query.q).replace(/[%_\\]/g, m => '\\' + m)}%` : null,
  ]
  // Bắt buộc ép $1::uuid[] ở cả IS NULL và ANY — nếu chỉ cast một chỗ, pg có thể
  // suy text[] và so khớp uuid thất bại / trả rỗng tùy phiên bản.
  const dieuKien = `t.xoa_luc IS NULL
      AND ($1::uuid[] IS NULL OR t.tao_boi = ANY($1::uuid[]))
      AND ($2::uuid IS NULL OR t.tao_boi = $2)
      AND ($3::uuid IS NULL OR t.du_an_id = $3)
      AND ($4::text IS NULL OR t.trang_thai = $4)
      AND ($5::text IS NULL OR t.ten_tuyen ILIKE $5)`
  const tong = (await db.query(`SELECT count(*)::int AS n FROM tuyen t WHERE ${dieuKien}`, tham)).rows[0].n
  const rows = (await db.query(
    `SELECT t.id, t.du_an_id, t.ten_tuyen, t.loai_cong_trinh_id, t.so_cot, t.chieu_dai_tuyen_m,
            t.he_so_n, t.chieu_dai_cap_m,
            COALESCE(t.phan_tram_lech_bac, 0) AS phan_tram_lech_bac,
            COALESCE(t.phan_tram_lech_nam, 0) AS phan_tram_lech_nam,
            COALESCE(t.phan_tram_lech_dong, 0) AS phan_tram_lech_dong,
            COALESCE(t.phan_tram_lech_tay, 0) AS phan_tram_lech_tay,
            t.trang_thai, t.hoan_thien_luc, t.phien_ban_hien_tai,
            t.nguon_tao, t.tao_boi, tk.ho_ten AS tao_boi_ho_ten, t.tao_luc, t.cap_nhat_luc
       FROM tuyen t JOIN tai_khoan tk ON tk.id = t.tao_boi
      WHERE ${dieuKien}
      ORDER BY t.cap_nhat_luc DESC, t.id
      LIMIT $6 OFFSET $7`, [...tham, p.so_luong, p.offset])).rows
  return boc(rows.map(chuanHoaLech), p, tong)
}

async function chiTiet(req, id, kem) {
  const t = await layTuyen(req, db, id)
  const kq = (await db.query(
    `SELECT t.*, tk.ho_ten AS tao_boi_ho_ten, l.ten AS loai_cong_trinh_ten
       FROM tuyen t JOIN tai_khoan tk ON tk.id = t.tao_boi
       LEFT JOIN dm_loai_cong_trinh l ON l.id = t.loai_cong_trinh_id
      WHERE t.id = $1`, [t.id])).rows[0]
  const tap = new Set(String(kem || '').split(',').map(s => s.trim()).filter(Boolean))
  for (const k of tap) {
    if (!['cot', 'duong', 'track'].includes(k)) throw loi.yeuCauSai(`Giá trị kem không hợp lệ: ${k}`)
  }
  if (tap.has('cot')) kq.cot = (await layCotHienTai(db, t.id)).map(cotRaDoiTuong)
  if (tap.has('duong')) kq.duong = await layDuong(db, t.id)
  if (tap.has('track')) kq.track = await layTrack(db, t.id)
  return chuanHoaLech(kq)
}

function cotRaDoiTuong(r) {
  const { tuyen_id, ...con } = r
  return con
}

// ---------------------------------------------------------------- tao, sua, xoa tuyen

async function tao(req, body) {
  return db.giaoDich(async c => {
    if (body.du_an_id) await kiemTraDuAn(req, c, body.du_an_id)
    if (body.loai_cong_trinh_id) await kiemTraLoaiCongTrinh(c, body.loai_cong_trinh_id)
    const ten = body.ten_tuyen.replace(/^T_/i, '')
    const lech = TRUONG_LECH.map(k => (body[k] !== undefined ? body[k] : 0))
    const kq = await c.query(
      `INSERT INTO tuyen (ten_tuyen, du_an_id, loai_cong_trinh_id, nguon_tao, tao_boi,
          phan_tram_lech_bac, phan_tram_lech_nam, phan_tram_lech_dong, phan_tram_lech_tay)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [ten, body.du_an_id || null, body.loai_cong_trinh_id || null, body.nguon_tao || 'android', req.user.id, ...lech])
    const id = kq.rows[0].id
    const t = chuanHoaLech(await tinhLai(c, id))
    await nhatKy.ghi(c, {
      tai_khoan_id: req.user.id, thiet_bi_id: req.thietBiId, tuyen_id: id, hanh_dong: 'tao',
      thoi_gian_thiet_bi: body.thoi_gian_thiet_bi, gps: body.gps,
      chi_tiet: {
        ten_tuyen: ten, loai_cong_trinh_id: body.loai_cong_trinh_id || null,
        phan_tram_lech_bac: lech[0], phan_tram_lech_nam: lech[1],
        phan_tram_lech_dong: lech[2], phan_tram_lech_tay: lech[3],
      },
    })
    return t
  })
}

async function suaThongTin(req, id, body) {
  return db.giaoDich(async c => {
    const t = await layTuyen(req, c, id, true)
    const sets = []
    const val = []
    const doi = []
    const them = (cot, v) => { val.push(v); sets.push(`${cot} = $${val.length}`); doi.push(cot) }
    if (body.ten_tuyen !== undefined) them('ten_tuyen', body.ten_tuyen.replace(/^T_/i, ''))
    if (body.du_an_id !== undefined) {
      if (body.du_an_id !== null) await kiemTraDuAn(req, c, body.du_an_id)
      them('du_an_id', body.du_an_id)
    }
    if (body.loai_cong_trinh_id !== undefined) {
      if (body.loai_cong_trinh_id !== null) await kiemTraLoaiCongTrinh(c, body.loai_cong_trinh_id, t.loai_cong_trinh_id)
      them('loai_cong_trinh_id', body.loai_cong_trinh_id)
    }
    for (const k of TRUONG_LECH) {
      if (body[k] !== undefined) them(k, body[k])
    }
    if (!sets.length) throw loi.yeuCauSai('Không có trường nào để sửa')
    val.push(id)
    await c.query(`UPDATE tuyen SET ${sets.join(', ')} WHERE id = $${val.length}`, val)
    const moi = chuanHoaLech(await tinhLai(c, id))
    await nhatKy.ghi(c, {
      tai_khoan_id: req.user.id, thiet_bi_id: req.thietBiId, tuyen_id: id, hanh_dong: 'sua',
      thoi_gian_thiet_bi: body.thoi_gian_thiet_bi, gps: body.gps,
      chi_tiet: { su_kien: 'sua_thong_tin', truong: doi },
    })
    return moi
  })
}

async function xoa(req, id, body = {}) {
  return db.giaoDich(async c => {
    await layTuyen(req, c, id, true)
    await c.query('UPDATE tuyen SET xoa_luc = now() WHERE id = $1', [id])
    await nhatKy.ghi(c, {
      tai_khoan_id: req.user.id, thiet_bi_id: req.thietBiId, tuyen_id: id, hanh_dong: 'sua',
      thoi_gian_thiet_bi: body.thoi_gian_thiet_bi, chi_tiet: { su_kien: 'xoa_tuyen' },
    })
    return { id, da_xoa: true }
  })
}

// ---------------------------------------------------------------- cot: dong bo toan bo

function giaTriCot(cot, goc) {
  // Thay the toan bo: truong khong gui -> null/false. Rieng thuoc_tinh_khac giu nguyen neu khong gui.
  const o = {}
  for (const t of TRUONG_SUA) {
    if (t === 'thuoc_tinh_khac') o[t] = cot.thuoc_tinh_khac !== undefined ? cot.thuoc_tinh_khac : (goc ? goc.thuoc_tinh_khac : {})
    else if (t in TRUONG_BOOL_MAC_DINH) o[t] = cot[t] !== undefined && cot[t] !== null ? cot[t] : TRUONG_BOOL_MAC_DINH[t]
    else o[t] = cot[t] !== undefined ? cot[t] : null
  }
  return o
}

function thamSoCot(g) {
  return TRUONG_SUA.map(t => (t === 'thuoc_tinh_khac' ? JSON.stringify(g[t] || {}) : g[t]))
}

const CAU_LENH_INSERT_COT = (() => {
  const cols = TRUONG_SUA.join(', ')
  const ph = TRUONG_SUA.map((t, i) => (t === 'thuoc_tinh_khac' ? `$${i + 5}::jsonb` : `$${i + 5}`)).join(', ')
  return `INSERT INTO cot (id, tuyen_id, thu_tu, tao_boi, ${cols})
          VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, ${ph}) RETURNING id`
})()

const CAU_LENH_UPDATE_COT = (() => {
  const sets = TRUONG_SUA.map((t, i) => (t === 'thuoc_tinh_khac' ? `${t} = $${i + 3}::jsonb` : `${t} = $${i + 3}`)).join(', ')
  return `UPDATE cot SET thu_tu = $2, xoa_luc = NULL, ${sets} WHERE id = $1`
})()

async function dongBoCot(c, req, tuyenId, cotVao, cat) {
  const tatCa = (await c.query('SELECT * FROM cot WHERE tuyen_id = $1', [tuyenId])).rows
  const theoId = new Map(tatCa.map(r => [r.id, r]))

  const daThay = new Set()
  const idNgoai = cotVao.map(x => x.id).filter(Boolean)
  for (const id of idNgoai) {
    if (daThay.has(id)) throw loi.duLieuSai('Mã cột bị trùng trong danh sách gửi lên', [{ truong: 'cot', thong_diep: `id trùng: ${id}` }])
    daThay.add(id)
  }
  if (idNgoai.length) {
    const lac = (await c.query(
      'SELECT id FROM cot WHERE id = ANY($1::uuid[]) AND tuyen_id <> $2', [idNgoai, tuyenId])).rows
    if (lac.length) throw loi.trung('Có mã cột đã thuộc tuyến khác', { id: lac.map(r => r.id) })
  }

  const loiTong = []
  const chuan = cotVao.map((raw, i) => {
    const goc = raw.id ? theoId.get(raw.id) : undefined
    const gocSong = goc && !goc.xoa_luc ? goc : undefined
    const { cot, loi: l } = cotSv.kiemTraCot(cotSv.chuanHoaSo(raw), cat, gocSong)
    for (const x of l) loiTong.push({ truong: `cot[${i}].${x.truong}`, thong_diep: x.thong_diep })
    return { raw, goc, gocSong, gt: giaTriCot(cot, goc) }
  })
  if (loiTong.length) throw loi.duLieuSai('Dữ liệu cột không hợp lệ', loiTong)

  const giuLai = new Set()
  for (let i = 0; i < chuan.length; i++) {
    const { raw, goc, gocSong, gt } = chuan[i]
    const thuTu = i + 1
    if (gocSong) {
      giuLai.add(gocSong.id)
      if (gocSong.thu_tu !== thuTu || cotSv.truongKhac(gocSong, gt).length) {
        await c.query(CAU_LENH_UPDATE_COT, [gocSong.id, thuTu, ...thamSoCot(gt)])
      }
    } else if (goc) { // cot da xoa mem, khoi phuc
      giuLai.add(goc.id)
      await c.query(CAU_LENH_UPDATE_COT, [goc.id, thuTu, ...thamSoCot(gt)])
    } else {
      const kq = await c.query(CAU_LENH_INSERT_COT, [raw.id || null, tuyenId, thuTu, req.user.id, ...thamSoCot(gt)])
      giuLai.add(kq.rows[0].id)
    }
  }
  const xoaIds = tatCa.filter(r => !r.xoa_luc && !giuLai.has(r.id)).map(r => r.id)
  if (xoaIds.length) {
    await c.query('UPDATE cot SET xoa_luc = now() WHERE id = ANY($1::uuid[])', [xoaIds])
  }
}

async function thayDuong(c, tuyenId, ds) {
  await c.query('DELETE FROM duong WHERE tuyen_id = $1', [tuyenId])
  for (const d of ds) {
    await c.query(
      `INSERT INTO duong (tuyen_id, loai, ten, toa_do, mau, do_day)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
      [tuyenId, d.loai || 'do_duong', d.ten || null, JSON.stringify(d.toa_do), d.mau || null, d.do_day || null])
  }
}

async function ghiTrack(c, tuyenId, diem, batDau) {
  if (!diem.length) return
  const cot = (f) => diem.map(f)
  await c.query(
    `INSERT INTO track_diem (tuyen_id, thu_tu, kinh_do, vi_do, thoi_gian, do_chinh_xac_m, nguon)
     SELECT $1, t.ord, t.kd, t.vd, t.tg, t.dc, t.ng
       FROM unnest($2::int[], $3::numeric[], $4::numeric[], $5::timestamptz[], $6::real[], $7::text[])
            AS t(ord, kd, vd, tg, dc, ng)`,
    [tuyenId,
      cot((_, i) => batDau + i),
      cot(p => Math.round(p.kinh_do * 1e7) / 1e7),
      cot(p => Math.round(p.vi_do * 1e7) / 1e7),
      cot(p => p.thoi_gian || null),
      cot(p => p.do_chinh_xac_m ?? null),
      cot(p => p.nguon || null)])
}

async function thayTrack(c, tuyenId, diem) {
  await c.query('DELETE FROM track_diem WHERE tuyen_id = $1', [tuyenId])
  await ghiTrack(c, tuyenId, diem, 1)
}

// ---------------------------------------------------------------- phien ban

async function chupAnh(c, tuyenId) {
  const cots = await layCotHienTai(c, tuyenId)
  const duong = await layDuong(c, tuyenId)
  const track = await layTrack(c, tuyenId)
  return {
    hinh_dang: {
      cot: cots.map(r => ({ id: r.id, thu_tu: r.thu_tu, kinh_do: r.kinh_do, vi_do: r.vi_do })),
      duong: duong.map(d => ({ id: d.id, loai: d.loai, ten: d.ten, toa_do: d.toa_do, mau: d.mau, do_day: d.do_day })),
      track: track.map(p => [p.kinh_do, p.vi_do]),
    },
    du_lieu_cot: cots.map(cotSv.chupCot),
  }
}

/** So sanh hai anh chup du_lieu_cot theo id. */
function soSanhAnh(truoc, sau) {
  const a = new Map((truoc || []).map(x => [x.id, x]))
  const b = new Map((sau || []).map(x => [x.id, x]))
  const them = [], xoa = [], sua = []
  for (const [id, x] of b) {
    if (!a.has(id)) { them.push({ id, ten_cot: x.ten_cot }); continue }
    const y = a.get(id)
    const truong = cotSv.truongKhac(y, x)
    if (y.thu_tu !== x.thu_tu) truong.push('thu_tu')
    if (truong.length) sua.push({ id, ten_cot: x.ten_cot, truong })
  }
  for (const [id, y] of a) if (!b.has(id)) xoa.push({ id, ten_cot: y.ten_cot })
  return { them, sua, xoa }
}

function thongKeNguonDiem(cots) {
  const kq = {}
  for (const x of cots) if (x.nguon_diem) kq[x.nguon_diem] = (kq[x.nguon_diem] || 0) + 1
  return kq
}

async function thietBiTuMa(c, req, ma) {
  if (!ma) return req.thietBiId
  const kq = await c.query(
    'SELECT id FROM thiet_bi WHERE ma_thiet_bi = $1 AND tai_khoan_id = $2 AND hoat_dong', [ma, req.user.id])
  if (!kq.rows[0]) throw loi.duLieuSai('Thiết bị chưa đăng ký cho tài khoản này', [{ truong: 'ma_thiet_bi', thong_diep: 'Chưa đăng ký' }])
  return kq.rows[0].id
}

const COT_PHIEN_BAN = `id, tuyen_id, so_phien_ban, loai_luu, la_ban_hoan_thien, tai_khoan_id, thiet_bi_id,
  thoi_gian_thiet_bi, thoi_gian_server, gps_kinh_do, gps_vi_do, gps_do_chinh_xac_m, so_cot,
  chieu_dai_tuyen_m, loai_cong_trinh_id, he_so_n, chieu_dai_cap_m,
  phan_tram_lech_bac, phan_tram_lech_nam, phan_tram_lech_dong, phan_tram_lech_tay,
  so_cot_them, so_cot_sua, so_cot_xoa`

async function luu(req, tuyenId, body) {
  return db.giaoDich(async c => {
    const t0 = await layTuyen(req, c, tuyenId, true) // khoa dong tuyen: hai lan luu dong thoi se xep hang

    if (body.ma_yeu_cau) {
      const da = await c.query(
        `SELECT ${COT_PHIEN_BAN} FROM tuyen_phien_ban WHERE tuyen_id = $1 AND ma_yeu_cau = $2`,
        [tuyenId, body.ma_yeu_cau])
      if (da.rows[0]) return { trung_lap: true, tuyen: t0, phien_ban: da.rows[0] }
    }
    if (body.loai_luu === 'hien_truong' && t0.trang_thai === 'hoan_thien') {
      throw loi.duLieuSai('Tuyến đã hoàn thiện: chỉ được lưu dạng chỉnh sửa sau', [{ truong: 'loai_luu', thong_diep: 'Dùng chinh_sua_sau hoặc mở lại tuyến' }])
    }
    if (body.phien_ban_co_so !== undefined && !body.ghi_de && body.phien_ban_co_so !== t0.phien_ban_hien_tai) {
      throw loi.xungDotPhienBan(t0.phien_ban_hien_tai)
    }

    if (body.loai_cong_trinh_id !== undefined) {
      if (body.loai_cong_trinh_id !== null) await kiemTraLoaiCongTrinh(c, body.loai_cong_trinh_id, t0.loai_cong_trinh_id)
      await c.query('UPDATE tuyen SET loai_cong_trinh_id = $1 WHERE id = $2', [body.loai_cong_trinh_id, tuyenId])
    }
    const lechSets = []
    const lechVal = []
    for (const k of TRUONG_LECH) {
      if (body[k] !== undefined) {
        lechVal.push(body[k])
        lechSets.push(`${k} = $${lechVal.length}`)
      }
    }
    if (lechSets.length) {
      lechVal.push(tuyenId)
      await c.query(`UPDATE tuyen SET ${lechSets.join(', ')} WHERE id = $${lechVal.length}`, lechVal)
    }
    const cat = await danhMuc.lay(c)
    if (body.cot) await dongBoCot(c, req, tuyenId, body.cot, cat)
    if (body.duong) await thayDuong(c, tuyenId, body.duong)
    if (body.track) await thayTrack(c, tuyenId, body.track)

    return { trung_lap: false, ...(await chotPhienBan(c, req, t0, body)) }
  })
}

/**
 * Tinh lai tuyen, chup anh, tao phien ban moi va ghi nhat ky. Goi trong giao dich
 * sau khi tuyen da bi khoa (t0 la dong tuyen luc bat dau). Dung chung cho luu va nhap KML.
 * opts: loai_luu, ma_thiet_bi, thoi_gian_thiet_bi, gps, ma_yeu_cau, ghi_de, ghi_chu,
 *       hanh_dong (mac dinh luu/sua theo loai_luu), chi_tiet_them
 */
async function chotPhienBan(c, req, t0, opts) {
  const tuyenId = t0.id
  const t = await tinhLai(c, tuyenId)
  const anh = await chupAnh(c, tuyenId)

  const truoc = t0.phien_ban_hien_tai > 0
    ? (await c.query('SELECT du_lieu_cot FROM tuyen_phien_ban WHERE tuyen_id = $1 AND so_phien_ban = $2',
      [tuyenId, t0.phien_ban_hien_tai])).rows[0]
    : null
  const ss = soSanhAnh(truoc ? truoc.du_lieu_cot : [], anh.du_lieu_cot)

  const loaiLuu = opts.loai_luu || (t0.trang_thai === 'hoan_thien' ? 'chinh_sua_sau' : 'hien_truong')
  const thietBiId = await thietBiTuMa(c, req, opts.ma_thiet_bi)
  const soMoi = t0.phien_ban_hien_tai + 1
  const gps = opts.gps || {}
  const tLech = chuanHoaLech({ ...t })
  const pb = (await c.query(
    `INSERT INTO tuyen_phien_ban
       (tuyen_id, so_phien_ban, loai_luu, tai_khoan_id, thiet_bi_id, thoi_gian_thiet_bi,
        gps_kinh_do, gps_vi_do, gps_do_chinh_xac_m, so_cot, chieu_dai_tuyen_m, loai_cong_trinh_id,
        he_so_n, chieu_dai_cap_m,
        phan_tram_lech_bac, phan_tram_lech_nam, phan_tram_lech_dong, phan_tram_lech_tay,
        so_cot_them, so_cot_sua, so_cot_xoa, hinh_dang, du_lieu_cot, ma_yeu_cau)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23::jsonb,$24)
     RETURNING ${COT_PHIEN_BAN}`,
    [tuyenId, soMoi, loaiLuu, req.user.id, thietBiId, opts.thoi_gian_thiet_bi || null,
      gps.kinh_do ?? null, gps.vi_do ?? null, gps.do_chinh_xac_m ?? null,
      t.so_cot, t.chieu_dai_tuyen_m, t.loai_cong_trinh_id, t.he_so_n, t.chieu_dai_cap_m,
      tLech.phan_tram_lech_bac, tLech.phan_tram_lech_nam, tLech.phan_tram_lech_dong, tLech.phan_tram_lech_tay,
      ss.them.length, ss.sua.length, ss.xoa.length,
      JSON.stringify(anh.hinh_dang), JSON.stringify(anh.du_lieu_cot), opts.ma_yeu_cau || null])).rows[0]

  await c.query('UPDATE tuyen SET phien_ban_hien_tai = $1 WHERE id = $2', [soMoi, tuyenId])
  await nhatKy.ghi(c, {
    tai_khoan_id: req.user.id, thiet_bi_id: thietBiId, tuyen_id: tuyenId, phien_ban_id: pb.id,
    hanh_dong: opts.hanh_dong || (loaiLuu === 'hien_truong' ? 'luu' : 'sua'), loai_luu: loaiLuu,
    thoi_gian_thiet_bi: opts.thoi_gian_thiet_bi, gps: opts.gps,
    chi_tiet: {
      so_phien_ban: soMoi, so_cot: t.so_cot,
      so_cot_them: ss.them.length, so_cot_sua: ss.sua.length, so_cot_xoa: ss.xoa.length,
      chieu_dai_tuyen_m: t.chieu_dai_tuyen_m, chieu_dai_cap_m: t.chieu_dai_cap_m,
      phan_tram_lech_bac: tLech.phan_tram_lech_bac, phan_tram_lech_nam: tLech.phan_tram_lech_nam,
      phan_tram_lech_dong: tLech.phan_tram_lech_dong, phan_tram_lech_tay: tLech.phan_tram_lech_tay,
      nguon_diem: thongKeNguonDiem(anh.du_lieu_cot), ghi_de: !!opts.ghi_de,
      ghi_chu: opts.ghi_chu || undefined,
      ...(opts.chi_tiet_them || {}),
    },
  })
  return { tuyen: { ...tLech, phien_ban_hien_tai: soMoi }, phien_ban: chuanHoaLech(pb) }
}

async function hoanThien(req, id, body = {}) {
  return db.giaoDich(async c => {
    const t = await layTuyen(req, c, id, true)
    if (t.trang_thai === 'hoan_thien') throw loi.trung('Tuyến đã hoàn thiện')
    if (t.phien_ban_hien_tai < 1) throw loi.trung('Tuyến chưa được lưu lần nào, hãy lưu trước khi hoàn thiện')
    await c.query(
      "UPDATE tuyen SET trang_thai = 'hoan_thien', hoan_thien_luc = now() WHERE id = $1", [id])
    await c.query(
      'UPDATE tuyen_phien_ban SET la_ban_hoan_thien = true WHERE tuyen_id = $1 AND so_phien_ban = $2',
      [id, t.phien_ban_hien_tai])
    await nhatKy.ghi(c, {
      tai_khoan_id: req.user.id, thiet_bi_id: req.thietBiId, tuyen_id: id, hanh_dong: 'luu',
      loai_luu: 'hien_truong', thoi_gian_thiet_bi: body.thoi_gian_thiet_bi, gps: body.gps,
      chi_tiet: { su_kien: 'hoan_thien', so_phien_ban: t.phien_ban_hien_tai },
    })
    return (await c.query('SELECT * FROM tuyen WHERE id = $1', [id])).rows[0]
  })
}

async function moLai(req, id, body = {}) {
  return db.giaoDich(async c => {
    const t = await layTuyen(req, c, id, true)
    if (t.trang_thai !== 'hoan_thien') throw loi.trung('Tuyến chưa hoàn thiện')
    await c.query(
      "UPDATE tuyen SET trang_thai = 'dang_khao_sat', hoan_thien_luc = NULL WHERE id = $1", [id])
    await nhatKy.ghi(c, {
      tai_khoan_id: req.user.id, thiet_bi_id: req.thietBiId, tuyen_id: id, hanh_dong: 'sua',
      thoi_gian_thiet_bi: body.thoi_gian_thiet_bi, gps: body.gps,
      chi_tiet: { su_kien: 'mo_lai', hoan_thien_luc_cu: t.hoan_thien_luc },
    })
    return (await c.query('SELECT * FROM tuyen WHERE id = $1', [id])).rows[0]
  })
}

async function dsPhienBan(req, tuyenId) {
  await layTuyen(req, db, tuyenId)
  return (await db.query(
    `SELECT p.id, p.tuyen_id, p.so_phien_ban, p.loai_luu, p.la_ban_hoan_thien, p.tai_khoan_id,
            tk.ho_ten AS tai_khoan_ho_ten, p.thiet_bi_id, p.thoi_gian_thiet_bi, p.thoi_gian_server,
            p.gps_kinh_do, p.gps_vi_do, p.gps_do_chinh_xac_m, p.so_cot, p.chieu_dai_tuyen_m,
            p.loai_cong_trinh_id, p.he_so_n, p.chieu_dai_cap_m,
            p.phan_tram_lech_bac, p.phan_tram_lech_nam, p.phan_tram_lech_dong, p.phan_tram_lech_tay,
            p.so_cot_them, p.so_cot_sua, p.so_cot_xoa
       FROM tuyen_phien_ban p JOIN tai_khoan tk ON tk.id = p.tai_khoan_id
      WHERE p.tuyen_id = $1 ORDER BY p.so_phien_ban DESC`, [tuyenId])).rows.map(chuanHoaLech)
}

async function chiTietPhienBan(req, tuyenId, so) {
  await layTuyen(req, db, tuyenId)
  const r = (await db.query(
    `SELECT p.*, tk.ho_ten AS tai_khoan_ho_ten FROM tuyen_phien_ban p
       JOIN tai_khoan tk ON tk.id = p.tai_khoan_id
      WHERE p.tuyen_id = $1 AND p.so_phien_ban = $2`, [tuyenId, so])).rows[0]
  if (!r) throw loi.khongThay('Không tìm thấy phiên bản')
  return r
}

async function soSanhPhienBan(req, tuyenId, tu, den) {
  await layTuyen(req, db, tuyenId)
  const kq = await db.query(
    `SELECT so_phien_ban, du_lieu_cot, thoi_gian_server, loai_luu FROM tuyen_phien_ban
      WHERE tuyen_id = $1 AND so_phien_ban = ANY($2::int[])`, [tuyenId, [tu, den]])
  const a = kq.rows.find(r => r.so_phien_ban === tu)
  const b = kq.rows.find(r => r.so_phien_ban === den)
  if (!a || !b) throw loi.khongThay('Không tìm thấy phiên bản để so sánh')
  return {
    tu: { so_phien_ban: tu, thoi_gian_server: a.thoi_gian_server, loai_luu: a.loai_luu },
    den: { so_phien_ban: den, thoi_gian_server: b.thoi_gian_server, loai_luu: b.loai_luu },
    ...soSanhAnh(a.du_lieu_cot, b.du_lieu_cot),
  }
}

// ---------------------------------------------------------------- cot: thao tac don le

async function themCot(req, tuyenId, body) {
  return db.giaoDich(async c => {
    await layTuyen(req, c, tuyenId, true)
    const cat = await danhMuc.lay(c)
    const { vi_tri, thoi_gian_thiet_bi, gps, ...duLieu } = body
    const { cot, loi: l } = cotSv.kiemTraCot(cotSv.chuanHoaSo(duLieu), cat, undefined)
    if (l.length) throw loi.duLieuSai('Dữ liệu cột không hợp lệ', l.map(x => ({ truong: x.truong, thong_diep: x.thong_diep })))
    const n = (await c.query('SELECT count(*)::int AS n FROM cot WHERE tuyen_id = $1 AND xoa_luc IS NULL', [tuyenId])).rows[0].n
    const vt = vi_tri === undefined ? n + 1 : vi_tri
    if (vt < 1 || vt > n + 1) throw loi.duLieuSai('Vị trí chèn không hợp lệ', [{ truong: 'vi_tri', thong_diep: `Phải trong 1..${n + 1}` }])
    if (cot.id) {
      const trung = await c.query('SELECT 1 FROM cot WHERE id = $1', [cot.id])
      if (trung.rows[0]) throw loi.trung('Mã cột đã tồn tại')
    }
    await c.query(
      'UPDATE cot SET thu_tu = thu_tu + 1 WHERE tuyen_id = $1 AND xoa_luc IS NULL AND thu_tu >= $2', [tuyenId, vt])
    const gt = giaTriCot(cot, undefined)
    const id = (await c.query(CAU_LENH_INSERT_COT, [cot.id || null, tuyenId, vt, req.user.id, ...thamSoCot(gt)])).rows[0].id
    const moi = await tinhLai(c, tuyenId)
    await nhatKy.ghi(c, {
      tai_khoan_id: req.user.id, thiet_bi_id: req.thietBiId, tuyen_id: tuyenId, hanh_dong: 'sua',
      thoi_gian_thiet_bi, gps, nguon_diem: gt.nguon_diem,
      chi_tiet: { su_kien: 'them_cot', cot_id: id, vi_tri: vt },
    })
    const hang = (await c.query('SELECT * FROM cot WHERE id = $1', [id])).rows[0]
    return { cot: cotRaDoiTuong(hang), tuyen: moi }
  })
}

async function layCotVaKhoaTuyen(req, c, cotId) {
  const r = (await c.query(
    `SELECT c.tuyen_id FROM cot c JOIN tuyen t ON t.id = c.tuyen_id
      WHERE c.id = $1 AND c.xoa_luc IS NULL AND t.xoa_luc IS NULL`, [cotId])).rows[0]
  if (!r) throw loi.khongThay('Không tìm thấy cột')
  await layTuyen(req, c, r.tuyen_id, true)
  const cot = (await c.query('SELECT * FROM cot WHERE id = $1 AND xoa_luc IS NULL', [cotId])).rows[0]
  if (!cot) throw loi.khongThay('Không tìm thấy cột')
  return cot
}

async function suaCot(req, cotId, patch) {
  return db.giaoDich(async c => {
    const cu = await layCotVaKhoaTuyen(req, c, cotId)
    const cat = await danhMuc.lay(c)
    const { thoi_gian_thiet_bi, gps, id: _bo, ...thayDoi } = patch
    const gop = cotSv.chuanHoaSo({ ...cotSv.chupCot(cu), ...thayDoi })
    const { cot, loi: l } = cotSv.kiemTraCot(gop, cat, cu)
    if (l.length) throw loi.duLieuSai('Dữ liệu cột không hợp lệ', l.map(x => ({ truong: x.truong, thong_diep: x.thong_diep })))
    const gt = giaTriCot(cot, cu)
    const doi = cotSv.truongKhac(cu, gt)
    if (doi.length) await c.query(CAU_LENH_UPDATE_COT, [cu.id, cu.thu_tu, ...thamSoCot(gt)])
    const moi = await tinhLai(c, cu.tuyen_id)
    await nhatKy.ghi(c, {
      tai_khoan_id: req.user.id, thiet_bi_id: req.thietBiId, tuyen_id: cu.tuyen_id, hanh_dong: 'sua',
      thoi_gian_thiet_bi, gps, nguon_diem: gt.nguon_diem,
      chi_tiet: { su_kien: 'sua_cot', cot_id: cu.id, truong: doi },
    })
    const hang = (await c.query('SELECT * FROM cot WHERE id = $1', [cu.id])).rows[0]
    return { cot: cotRaDoiTuong(hang), tuyen: moi }
  })
}

async function xoaCot(req, cotId, body = {}) {
  return db.giaoDich(async c => {
    const cu = await layCotVaKhoaTuyen(req, c, cotId)
    await c.query('UPDATE cot SET xoa_luc = now() WHERE id = $1', [cotId])
    await danhSoLai(c, cu.tuyen_id)
    const moi = await tinhLai(c, cu.tuyen_id)
    await nhatKy.ghi(c, {
      tai_khoan_id: req.user.id, thiet_bi_id: req.thietBiId, tuyen_id: cu.tuyen_id, hanh_dong: 'sua',
      thoi_gian_thiet_bi: body.thoi_gian_thiet_bi, gps: body.gps,
      chi_tiet: { su_kien: 'xoa_cot', cot_id: cotId, ten_cot: cu.ten_cot },
    })
    return { cot_id: cotId, da_xoa: true, tuyen: moi }
  })
}

async function sapXepCot(req, tuyenId, ids, body = {}) {
  return db.giaoDich(async c => {
    await layTuyen(req, c, tuyenId, true)
    const hien = (await c.query('SELECT id FROM cot WHERE tuyen_id = $1 AND xoa_luc IS NULL', [tuyenId])).rows.map(r => r.id)
    const a = [...hien].sort().join(',')
    const b = [...ids].sort().join(',')
    if (hien.length !== ids.length || a !== b) {
      throw loi.duLieuSai('Danh sách phải gồm đúng tất cả cột hiện có của tuyến, mỗi cột một lần',
        [{ truong: 'ids', thong_diep: `Tuyến có ${hien.length} cột, nhận ${ids.length}` }])
    }
    await c.query(
      `UPDATE cot SET thu_tu = u.n
         FROM unnest($2::uuid[]) WITH ORDINALITY AS u(id, n)
        WHERE cot.id = u.id AND cot.tuyen_id = $1`, [tuyenId, ids])
    const moi = await tinhLai(c, tuyenId)
    await nhatKy.ghi(c, {
      tai_khoan_id: req.user.id, thiet_bi_id: req.thietBiId, tuyen_id: tuyenId, hanh_dong: 'sua',
      thoi_gian_thiet_bi: body.thoi_gian_thiet_bi, gps: body.gps,
      chi_tiet: { su_kien: 'sap_xep_cot', so_cot: ids.length },
    })
    return moi
  })
}

async function themTrack(req, tuyenId, diem, body = {}) {
  return db.giaoDich(async c => {
    await layTuyen(req, c, tuyenId, true)
    const max = (await c.query('SELECT coalesce(max(thu_tu), 0)::int AS m FROM track_diem WHERE tuyen_id = $1', [tuyenId])).rows[0].m
    await ghiTrack(c, tuyenId, diem, max + 1)
    await nhatKy.ghi(c, {
      tai_khoan_id: req.user.id, thiet_bi_id: req.thietBiId, tuyen_id: tuyenId, hanh_dong: 'sua',
      thoi_gian_thiet_bi: body.thoi_gian_thiet_bi,
      chi_tiet: { su_kien: 'them_track', so_diem: diem.length },
    })
    return { so_diem_them: diem.length, tong_so_diem: max + diem.length }
  })
}

module.exports = {
  layTuyen, layCotHienTai, layDuong, layTrack, tinhLai, danhSoLai, kiemTraDuAn, kiemTraLoaiCongTrinh,
  danhSach, chiTiet, tao, suaThongTin, xoa, luu, chotPhienBan, hoanThien, moLai,
  dsPhienBan, chiTietPhienBan, soSanhPhienBan, soSanhAnh, chupAnh,
  themCot, suaCot, xoaCot, sapXepCot, themTrack,
  dongBoCot, thayDuong, thayTrack, ghiTrack, cotRaDoiTuong, giaTriCot, thamSoCot,
  CAU_LENH_INSERT_COT, CAU_LENH_UPDATE_COT, thietBiTuMa,
}
