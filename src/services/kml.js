'use strict'
const { XMLParser } = require('fast-xml-parser')
const db = require('../db')
const { loi } = require('../errors')
const danhMuc = require('./danhMuc')
const cotSv = require('./cot')
const tuyenSv = require('./tuyen')
/**
 * Doc va ghi KML. Quy tac (tai lieu muc 3.3 R6, R7, R9 va muc 2.5):
 *  - Tep co the tu web hoac Android. Nhan dien: co the AC/DAI hoac LoaiCot/hientrangcot => web.
 *  - web: AC/UD = De U, AC/DAI = Dai.  Android: AC/UD = Dai, De U khong co (D2, D3).
 *  - Android khong ghi hien trang: suy tu ma (R6).
 *  - Gong khong thuoc danh muc gong => NULL, giu gia tri goc trong thuoc_tinh_khac (D1).
 *  - "Do duong" cua tep Android la duong sinh ra tu cac cot, bo qua (D12).
 */

const GIOI_HAN_CANH_BAO_CHI_TIET = 50

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: false,
  isArray: (name) => ['Folder', 'Placemark', 'gx:coord'].includes(name),
})

const mang = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v])

/** Gia tri chu cua mot nut (nut co thuoc tinh co dang { '#text': ... }). */
function chu(v) {
  if (v === undefined || v === null) return ''
  if (typeof v === 'object') return v['#text'] === undefined ? '' : String(v['#text']).trim()
  return String(v).trim()
}
const co = (obj, khoa) => !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, khoa)
const rongThanhNull = (s) => (s === '' || s === undefined ? null : s)

function layTuyenTen(ten) {
  return ten.replace(/^T_/i, '').trim()
}

function phanTichXml(xml) {
  if (typeof xml !== 'string' || !xml.trim()) throw loi.yeuCauSai('Nội dung KML trống')
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw loi.yeuCauSai('Tệp KML không được chứa DOCTYPE hoặc ENTITY')
  let goc
  try {
    goc = parser.parse(xml)
  } catch (e) {
    throw loi.yeuCauSai('Tệp KML không phải XML hợp lệ', [{ thong_diep: e.message }])
  }
  if (!goc || !goc.kml) throw loi.yeuCauSai('Tệp không có thẻ <kml>')
  return goc.kml
}

function docToaDoDiem(pm) {
  const s = chu(pm.Point && pm.Point.coordinates)
  const [kd, vd] = s.split(',').map(x => Number(x))
  if (!Number.isFinite(kd) || !Number.isFinite(vd) || Math.abs(kd) > 180 || Math.abs(vd) > 90) return null
  return { kinh_do: kd, vi_do: vd }
}

function docDuong(pm) {
  const s = chu(pm.LineString && pm.LineString.coordinates)
  const ds = []
  for (const p of s.split(/\s+/).filter(Boolean)) {
    const [kd, vd] = p.split(',').map(Number)
    if (Number.isFinite(kd) && Number.isFinite(vd) && Math.abs(kd) <= 180 && Math.abs(vd) <= 90) ds.push([kd, vd])
  }
  return ds
}

function docTrack(pm) {
  const diem = []
  for (const c of mang(pm['gx:Track'] && pm['gx:Track']['gx:coord'])) {
    const [kd, vd] = chu(c).split(/\s+/).map(Number)
    if (Number.isFinite(kd) && Number.isFinite(vd) && Math.abs(kd) <= 180 && Math.abs(vd) <= 90) {
      diem.push({ kinh_do: kd, vi_do: vd })
    }
  }
  return diem
}

/** Duyet cay Folder. Folder co Placemark Point hoac ten T_ => tuyen; con lai => du an chua. */
function phanTichKml(xml) {
  const kml = phanTichXml(xml)
  const goc = kml.Document || kml
  const cacTuyen = []
  const cacDuAn = []
  let coTagWeb = false

  const kiemTraWeb = (pm) => {
    if (co(pm.AC, 'DAI') || co(pm.LoaiCot, 'hientrangcot')) coTagWeb = true
  }

  const duyet = (folder, duongDan) => {
    const ten = chu(folder.name)
    const pms = mang(folder.Placemark)
    const coDiem = pms.some(p => p.Point)
    const laTuyen = coDiem || /^T_/i.test(ten)
    let duongDanCon = duongDan
    if (laTuyen) {
      cacTuyen.push({ ten: layTuyenTen(ten) || 'Tuyến không tên', duong_dan: duongDan, placemark: pms })
      pms.forEach(kiemTraWeb)
    } else if (ten) {
      duongDanCon = [...duongDan, ten]
      cacDuAn.push(duongDanCon)
    }
    for (const sub of mang(folder.Folder)) duyet(sub, duongDanCon)
  }
  for (const f of mang(goc.Folder)) duyet(f, [])

  // Placemark dat truc tiep duoi Document (khong nam trong Folder nao)
  const roi = mang(goc.Placemark)
  if (roi.some(p => p.Point)) {
    cacTuyen.push({ ten: layTuyenTen(chu(goc.name)) || 'Tuyến nhập từ KML', duong_dan: [], placemark: roi })
    roi.forEach(kiemTraWeb)
  }
  return { nguon: coTagWeb ? 'web' : 'android', cacTuyen, cacDuAn }
}

// ---------------------------------------------------------------- anh xa cot

function docHienTrang(s) {
  const t = String(s || '').trim().toLowerCase()
  if (!t) return null
  if (t === 'tm' || t.includes('mới') || t.includes('moi')) return 'tm'
  if (t === 'cs' || t.includes('có sẵn') || t.includes('co san')) return 'cs'
  return undefined // khong nhan ra
}

function docBool(s) {
  return String(s || '').trim().toLowerCase() === 'true'
}

function docChieuCao(s) {
  if (!s) return null
  const n = Number(String(s).trim().replace(/\s*m$/i, '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

/**
 * Anh xa mot Placemark Point thanh cot (truong cua CSDL) + canh bao.
 * Khong nem loi: gia tri khong hop le duoc chuyen thanh NULL, giu ban goc trong thuoc_tinh_khac.
 */
function anhXaCot(pm, nguon, cat, thuTu, canhBao) {
  const cb = (loai, thong_diep, cot) => canhBao.push({ loai, thong_diep, cot })
  const tenGoc = chu(pm.name) || `Cột ${thuTu}`
  const ten = tenGoc.slice(0, 120)
  if (tenGoc.length > 120) cb('ten_bi_cat', `Tên cột dài quá 120 ký tự, đã cắt: ${tenGoc.slice(0, 30)}...`, ten)

  // R/D11: tach ky hieu va so thu tu an toan
  let kyHieu = ten
  let soThuTu = null
  const cach = ten.indexOf(' ')
  if (cach > 0) {
    const phan = ten.slice(cach + 1).trim()
    kyHieu = ten.slice(0, cach)
    if (/^\d{1,9}$/.test(phan)) soThuTu = parseInt(phan, 10)
  }

  const diem = docToaDoDiem(pm)
  const khac = {}
  const cot = {
    ten_cot: ten,
    ky_hieu: kyHieu.slice(0, 60),
    so_thu_tu: soThuTu,
    dia_diem: rongThanhNull(chu(pm.diachi)),
    kinh_do: diem.kinh_do,
    vi_do: diem.vi_do,
    ly_trinh: rongThanhNull(chu(pm.lytrinh)),
    nhan_doi_phu_kien: docBool(chu(pm.nhandoiphukien)),
    dat_bien_bao: docBool(chu(pm.bienbao)),
    ma_loai_cot: rongThanhNull(chu(pm.LoaiCot && pm.LoaiCot.chungloai)),
    ma_vat_tu: rongThanhNull(chu(pm.VatTu && pm.VatTu.ten)),
    chung_loai_splitter: rongThanhNull(chu(pm.VatTu && pm.VatTu.chungloai1)),
    chung_loai_odf: rongThanhNull(chu(pm.VatTu && pm.VatTu.chungloai2)),
    ma_be_cap: rongThanhNull(chu(pm.BeCap && (pm.BeCap.maloaibe || pm.BeCap.ten))),
    // D5: web ghi maphukien, Android ghi ten
    ma_phu_kien: rongThanhNull(chu(pm.PhuKien && (chu(pm.PhuKien.maphukien) || pm.PhuKien.ten))),
    adss_treo_neo: rongThanhNull(chu(pm.ADSS && pm.ADSS.TreoNeo)),
    adss_udj: rongThanhNull(chu(pm.ADSS && pm.ADSS.UDJ)),
    adss_gong: rongThanhNull(chu(pm.ADSS && pm.ADSS.Gong)),
    adss_chung_loai: rongThanhNull(chu(pm.ADSS && pm.ADSS.ChungLoai)),
    ac_treo_ham: rongThanhNull(chu(pm.AC && pm.AC.TreoHam)),
    ac_chung_loai: rongThanhNull(chu(pm.AC && pm.AC.ChungLoai)),
    nguon_diem: 'nhap_kml',
  }
  // R9: nghia cua the UD
  const ud = rongThanhNull(chu(pm.AC && pm.AC.UD))
  if (nguon === 'web') {
    cot.ac_de_u = ud
    cot.ac_dai = rongThanhNull(chu(pm.AC && pm.AC.DAI))
  } else {
    cot.ac_dai = ud
    cot.ac_de_u = null
  }
  cot.hien_ly_trinh = cot.ly_trinh !== null // D14

  // hien trang
  for (const [truong, nguonTag] of [
    ['hien_trang_cot', chu(pm.LoaiCot && pm.LoaiCot.hientrangcot)],
    ['hien_trang_vat_tu', chu(pm.VatTu && pm.VatTu.hientrangvattu)],
    ['hien_trang_be_cap', chu(pm.BeCap && pm.BeCap.hientrang)],
  ]) {
    const h = docHienTrang(nguonTag)
    if (h === undefined) {
      cb('hien_trang_khong_nhan_ra', `Hiện trạng không nhận ra: "${nguonTag}" (${truong})`, ten)
      khac[`${truong}_goc`] = nguonTag
      cot[truong] = null
    } else cot[truong] = h
  }

  // chieu cao (D7)
  const cc = docChieuCao(chu(pm.LoaiCot && pm.LoaiCot.chieucaocot))
  if (Number.isNaN(cc) || (cc !== null && !cat.tim.chieu_cao.has(Math.round(cc * 10) / 10))) {
    cb('chieu_cao_ngoai_danh_muc', `Chiều cao không có trong danh mục: "${chu(pm.LoaiCot && pm.LoaiCot.chieucaocot)}"`, ten)
    khac.chieu_cao_goc = chu(pm.LoaiCot && pm.LoaiCot.chieucaocot)
    cot.chieu_cao_m = null
  } else cot.chieu_cao_m = cc

  // ma co khoa ngoai: khong co trong danh muc -> NULL, giu ban goc
  for (const [truong, bang] of [
    ['ma_loai_cot', 'loai_cot'], ['ma_vat_tu', 'vat_tu'], ['ma_be_cap', 'be_cap'], ['ma_phu_kien', 'phu_kien'],
  ]) {
    if (cot[truong] && !cat.tim[bang].has(cot[truong])) {
      cb('ma_ngoai_danh_muc', `${truong} không có trong danh mục: "${cot[truong]}"`, ten)
      khac[`${truong}_goc`] = cot[truong]
      cot[truong] = null
    }
  }

  // D1: Gong
  if (cot.adss_gong && !(cat.tim.gia_tri.gong && cat.tim.gia_tri.gong.has(cot.adss_gong))) {
    cb('gong_khong_khoi_phuc', `Giá trị Gông không thuộc danh mục (tệp Android ghi Gông bằng giá trị UDJ): "${cot.adss_gong}"`, ten)
    khac.adss_gong_goc = cot.adss_gong
    cot.adss_gong = null
  }

  // danh muc gia tri don gian: giu nguyen, canh bao
  for (const [truong, nhom] of Object.entries(cotSv.NHOM_GIA_TRI)) {
    const v = cot[truong]
    if (v && !(cat.tim.gia_tri[nhom] && cat.tim.gia_tri[nhom].has(v))) {
      cb('gia_tri_ngoai_danh_muc', `${truong}: "${v}" không thuộc danh mục ${nhom}`, ten)
    }
  }

  // R6: hien trang suy tu ma. Neu tep ghi khac ma thi tin theo ma va canh bao.
  const theoMa = [
    ['hien_trang_cot', cot.ma_loai_cot && cat.tim.loai_cot.get(cot.ma_loai_cot), d => d.hien_trang],
    ['hien_trang_vat_tu', cot.ma_vat_tu && cat.tim.vat_tu.get(cot.ma_vat_tu), d => (d.hien_trang_ap_dung === 'ca_hai' ? null : d.hien_trang_ap_dung)],
    ['hien_trang_be_cap', cot.ma_be_cap && cat.tim.be_cap.get(cot.ma_be_cap), d => d.hien_trang],
  ]
  for (const [truong, d, suy] of theoMa) {
    if (!d) continue
    const ht = suy(d)
    if (ht && cot[truong] && cot[truong] !== ht) {
      cb('hien_trang_khong_khop', `${truong}: tệp ghi "${cot[truong]}" nhưng mã ${d.ma} thuộc "${ht}", dùng "${ht}"`, ten)
    }
    if (ht) cot[truong] = ht
  }
  if (cot.ma_vat_tu && !cot.hien_trang_vat_tu) {
    cb('hien_trang_vat_tu_khong_suy_duoc', `Vật tư ${cot.ma_vat_tu} dùng cho cả hai hiện trạng, tệp không cho biết`, ten)
  }

  // du lieu JSON cu (Placemark/data)
  if (pm.data) {
    try { khac.json_cu = JSON.parse(chu(pm.data)) } catch (_) { khac.json_cu_chuoi = chu(pm.data) }
  }
  cot.thuoc_tinh_khac = khac
  return cot
}

/** Chuyen cac Placemark cua mot tuyen thanh cot / duong / track. */
function phanTichTuyen(t, nguon, cat) {
  const canhBao = []
  const cacCot = []
  const cacDuong = []
  let track = []
  let boQuaDoDuong = 0
  let boQuaDiemSai = 0
  for (const pm of t.placemark) {
    const ten = chu(pm.name)
    if (pm.Point) {
      if (!docToaDoDiem(pm)) { boQuaDiemSai++; canhBao.push({ loai: 'toa_do_sai', thong_diep: `Bỏ qua cột có tọa độ sai: ${ten}`, cot: ten }); continue }
      cacCot.push(anhXaCot(pm, nguon, cat, cacCot.length + 1, canhBao))
    } else if (pm['gx:Track']) {
      track = track.concat(docTrack(pm))
    } else if (pm.LineString) {
      const toaDo = docDuong(pm)
      if (!toaDo.length) continue
      const laDoDuong = ten === 'Đo đường'
      if (laDoDuong && nguon === 'android') { boQuaDoDuong++; continue } // D12
      cacDuong.push({ loai: laDoDuong ? 'do_duong' : 've_tay', ten: laDoDuong ? null : (ten || null), toa_do: toaDo })
    }
  }
  if (!cacCot.length) canhBao.push({ loai: 'tuyen_rong', thong_diep: `Tuyến "${t.ten}" không có cột hợp lệ nào`, cot: null })
  return { cot: cacCot, duong: cacDuong, track, canh_bao: canhBao, bo_qua_do_duong: boQuaDoDuong, bo_qua_diem_sai: boQuaDiemSai }
}

// ---------------------------------------------------------------- nhap vao CSDL

class ChayThu extends Error {
  constructor(bao_cao) { super('chay_thu'); this.bao_cao = bao_cao }
}

async function timHoacTaoDuAn(c, req, cha, ten, cache) {
  const khoa = `${cha || ''}/${ten.toLowerCase()}`
  if (cache.has(khoa)) return { id: cache.get(khoa), moi: false }
  const ton = await c.query(
    `SELECT id FROM du_an WHERE cha_id IS NOT DISTINCT FROM $1 AND lower(ten) = lower($2)
        AND tao_boi = $3 AND xoa_luc IS NULL LIMIT 1`, [cha, ten, req.user.id])
  let id
  let moi = false
  if (ton.rows[0]) id = ton.rows[0].id
  else {
    id = (await c.query('INSERT INTO du_an (cha_id, ten, tao_boi) VALUES ($1,$2,$3) RETURNING id',
      [cha, ten.slice(0, 200), req.user.id])).rows[0].id
    moi = true
  }
  cache.set(khoa, id)
  return { id, moi }
}

async function tenTrungTrongDuAn(c, duAnId, ten) {
  const r = await c.query(
    `SELECT 1 FROM tuyen WHERE coalesce(du_an_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND lower(ten_tuyen) = lower($2) AND xoa_luc IS NULL`, [duAnId, ten])
  return !!r.rows[0]
}

/**
 * Nhap KML. Tuyen duoc gan cho nguoi nhap. opts: { du_an_id, khi_trung: 'loi'|'doi_ten'|'bo_qua', thu }
 * thu = true: chay het roi hoan tac, chi tra bao cao (xem truoc).
 */
async function nhap(req, xml, opts = {}) {
  const khiTrung = opts.khi_trung || 'loi'
  const kq = phanTichKml(xml)
  if (!kq.cacTuyen.length) throw loi.duLieuSai('Tệp KML không có tuyến nào (không tìm thấy Placemark điểm)')

  try {
    return await db.giaoDich(async c => {
      if (opts.du_an_id) await tuyenSv.kiemTraDuAn(req, c, opts.du_an_id)
      const cat = await danhMuc.lay(c)
      const cacheDuAn = new Map()
      const duAnTao = []
      const baoCaoTuyen = []
      const boQua = []
      const tongCanhBao = {}
      const daDungTrongTep = new Set()

      // 1. Quet truoc de bao het xung dot ten (che do 'loi')
      const xungDot = []
      for (const t of kq.cacTuyen) {
        const ten = t.ten.slice(0, 200)
        let duAnId = opts.du_an_id || null
        for (const ten_da of t.duong_dan) {
          const r = await c.query(
            `SELECT id FROM du_an WHERE cha_id IS NOT DISTINCT FROM $1 AND lower(ten) = lower($2)
                AND tao_boi = $3 AND xoa_luc IS NULL LIMIT 1`, [duAnId, ten_da, req.user.id])
          duAnId = r.rows[0] ? r.rows[0].id : null
          if (!duAnId) break
        }
        const khoa = `${t.duong_dan.join('/')}|${ten.toLowerCase()}`
        const trongTep = daDungTrongTep.has(khoa)
        daDungTrongTep.add(khoa)
        if (trongTep || (duAnId !== null || t.duong_dan.length === 0) && await tenTrungTrongDuAn(c, duAnId, ten)) {
          xungDot.push(ten)
        }
      }
      if (xungDot.length && khiTrung === 'loi') {
        throw loi.trung('Tên tuyến đã tồn tại. Đặt khi_trung = doi_ten hoặc bo_qua để xử lý', { ten_trung: xungDot })
      }

      // 2. Nhap
      const dangDung = new Set()
      for (const t of kq.cacTuyen) {
        let duAnId = opts.du_an_id || null
        for (const ten of t.duong_dan) {
          const r = await timHoacTaoDuAn(c, req, duAnId, ten, cacheDuAn)
          duAnId = r.id
          if (r.moi) duAnTao.push({ ten, id: duAnId })
        }
        let ten = t.ten.slice(0, 200)
        const khoaDung = (n) => `${duAnId || ''}|${n.toLowerCase()}`
        const trung = async (n) => dangDung.has(khoaDung(n)) || await tenTrungTrongDuAn(c, duAnId, n)
        if (await trung(ten)) {
          if (khiTrung === 'bo_qua') { boQua.push({ ten, ly_do: 'Trùng tên' }); continue }
          let i = 2
          while (await trung(`${ten.slice(0, 190)} (${i})`)) i++
          ten = `${ten.slice(0, 190)} (${i})`
        }
        dangDung.add(khoaDung(ten))

        const pt = phanTichTuyen(t, kq.nguon, cat)
        const tuyenId = (await c.query(
          `INSERT INTO tuyen (ten_tuyen, du_an_id, nguon_tao, tao_boi) VALUES ($1,$2,'nhap_kml',$3) RETURNING id`,
          [ten, duAnId, req.user.id])).rows[0].id

        for (let i = 0; i < pt.cot.length; i++) {
          const gt = tuyenSv.giaTriCot(pt.cot[i], undefined)
          await c.query(tuyenSv.CAU_LENH_INSERT_COT, [null, tuyenId, i + 1, req.user.id, ...tuyenSv.thamSoCot(gt)])
        }
        if (pt.duong.length) await tuyenSv.thayDuong(c, tuyenId, pt.duong)
        if (pt.track.length) await tuyenSv.ghiTrack(c, tuyenId, pt.track, 1)

        const t0 = (await c.query('SELECT * FROM tuyen WHERE id = $1 FOR UPDATE', [tuyenId])).rows[0]
        const { tuyen, phien_ban } = await tuyenSv.chotPhienBan(c, req, t0, {
          loai_luu: 'hien_truong', hanh_dong: 'tao',
          chi_tiet_them: { su_kien: 'nhap_kml', nguon_tep: kq.nguon, so_canh_bao: pt.canh_bao.length },
        })

        const dem = {}
        for (const w of pt.canh_bao) {
          dem[w.loai] = (dem[w.loai] || 0) + 1
          tongCanhBao[w.loai] = (tongCanhBao[w.loai] || 0) + 1
        }
        baoCaoTuyen.push({
          id: tuyenId, ten_tuyen: ten, du_an_id: duAnId, so_cot: pt.cot.length,
          so_duong: pt.duong.length, so_diem_track: pt.track.length,
          chieu_dai_tuyen_m: tuyen.chieu_dai_tuyen_m, so_phien_ban: phien_ban.so_phien_ban,
          bo_qua_do_duong: pt.bo_qua_do_duong, bo_qua_cot_toa_do_sai: pt.bo_qua_diem_sai,
          so_canh_bao: pt.canh_bao.length, canh_bao_theo_loai: dem,
          canh_bao: pt.canh_bao.slice(0, GIOI_HAN_CANH_BAO_CHI_TIET),
        })
      }

      const baoCao = {
        da_luu: !opts.thu, nguon_tep: kq.nguon, du_an_moi: duAnTao, tuyen: baoCaoTuyen,
        bo_qua: boQua, canh_bao_theo_loai: tongCanhBao,
      }
      if (opts.thu) throw new ChayThu(baoCao)
      return baoCao
    })
  } catch (e) {
    if (e instanceof ChayThu) return e.bao_cao
    throw e
  }
}

// ---------------------------------------------------------------- xuat KML

const xml = (v) => String(v === null || v === undefined ? '' : v)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const th = (ten, v) => `<${ten}>${xml(v)}</${ten}>`
const boolStr = (b) => (b ? 'true' : 'false')

const STYLES = `
<StyleMap id="multiTrack33"><Pair><key>normal</key><styleUrl>#multiTrack_n6</styleUrl></Pair><Pair><key>highlight</key><styleUrl>#multiTrack_h6</styleUrl></Pair></StyleMap>
<Style id="multiTrack_h6"><IconStyle><scale>1.2</scale><Icon><href>https://earth.google.com/images/kml-icons/track-directional/track-0.png</href></Icon></IconStyle><LineStyle><width>8</width><color>99ffac59</color></LineStyle></Style>
<Style id="multiTrack_n6"><IconStyle><scale>1.2</scale><Icon><href>https://earth.google.com/images/kml-icons/track-directional/track-0.png</href></Icon></IconStyle><LineStyle><width>6</width><color>99ffac59</color></LineStyle></Style>
<Style id="line-w2"><LineStyle><width>1</width><color>ff2dc0fb</color></LineStyle></Style>
<Style id="s_ylw-pushpin"><IconStyle><scale>1.1</scale><color>ff02c8f1</color><Icon><href>http://maps.google.com/mapfiles/kml/paddle/A.png</href></Icon></IconStyle></Style>
<Style id="s_ylw-pushpin_hl"><IconStyle><scale>1.3</scale><color>ff02c8f1</color><Icon><href>http://maps.google.com/mapfiles/kml/paddle/A.png</href></Icon></IconStyle></Style>
<StyleMap id="m_ylw-pushpin"><Pair><key>normal</key><styleUrl>#s_ylw-pushpin</styleUrl></Pair><Pair><key>highlight</key><styleUrl>#s_ylw-pushpin_hl</styleUrl></Pair></StyleMap>`

function placemarkCot(c, dinhDang) {
  const web = dinhDang !== 'android'
  const cao = c.chieu_cao_m === null || c.chieu_cao_m === undefined ? '' : (web ? String(c.chieu_cao_m) : `${c.chieu_cao_m}m`)
  const ud = web ? c.ac_de_u : c.ac_dai // Android: UD = Dai
  return `<Placemark>${th('name', c.ten_cot)}${th('diachi', c.dia_diem)}${th('lytrinh', c.ly_trinh)}` +
    `${th('nhandoiphukien', boolStr(c.nhan_doi_phu_kien))}${th('bienbao', boolStr(c.dat_bien_bao))}` +
    `<styleUrl>#m_ylw-pushpin</styleUrl><Point><coordinates>${c.kinh_do},${c.vi_do},0</coordinates></Point>` +
    // Tep Android khong co cac the hien trang (R6): khong ghi de nhap lai nhan dien dung la tep Android (R9).
    `<LoaiCot>${th('chieucaocot', cao)}${th('chungloai', c.ma_loai_cot)}${web ? th('hientrangcot', c.hien_trang_cot) : ''}</LoaiCot>` +
    `<VatTu>${th('ten', c.ma_vat_tu)}${web ? th('hientrangvattu', c.hien_trang_vat_tu) : ''}${th('chungloai1', c.chung_loai_splitter)}${th('chungloai2', c.chung_loai_odf)}</VatTu>` +
    `<BeCap>${th('ten', c.ma_be_cap)}${web ? th('hientrang', c.hien_trang_be_cap) : ''}${th('maloaibe', c.ma_be_cap)}${th('chungloai1', '')}${th('chungloai2', '')}</BeCap>` +
    // D5: ghi ca ten lan maphukien de ca Android va web doc duoc
    `<PhuKien>${th('ten', c.ma_phu_kien)}${th('maphukien', c.ma_phu_kien)}${th('chungloai1', '')}${th('chungloai2', '')}</PhuKien>` +
    `<ADSS>${th('TreoNeo', c.adss_treo_neo)}${th('UDJ', c.adss_udj)}${th('Gong', c.adss_gong)}${th('ChungLoai', c.adss_chung_loai)}</ADSS>` +
    `<AC>${th('TreoHam', c.ac_treo_ham)}${th('UD', ud)}${web ? th('DAI', c.ac_dai) : ''}${th('ChungLoai', c.ac_chung_loai)}</AC></Placemark>`
}

/** Xuat mot tuyen. dinhDang: 'web' (mac dinh) hoac 'android'. */
function xuat(tuyen, cots, duongs, track, dinhDang = 'web') {
  const phan = []
  phan.push(`<?xml version="1.0" encoding="utf-8"?>`)
  phan.push(`<kml xmlns:atom="http://www.w3.org/2005/Atom" xmlns:gx="http://www.google.com/kml/ext/2.2" xmlns:kml="http://www.opengis.net/kml/2.2" xmlns="http://www.opengis.net/kml/2.2">`)
  phan.push(`<Document>${th('name', 'PROJECT POTECO')}${STYLES}`)
  phan.push(`<Folder>${th('name', `T_${tuyen.ten_tuyen}`)}`)
  for (const c of cots) phan.push(placemarkCot(c, dinhDang))

  const doDuong = duongs.filter(d => d.loai === 'do_duong')
  const veTay = duongs.filter(d => d.loai === 've_tay')
  const dsDoDuong = doDuong.length ? doDuong.map(d => d.toa_do) : (cots.length ? [cots.map(c => [c.kinh_do, c.vi_do])] : [])
  for (const toaDo of dsDoDuong) {
    phan.push(`<Placemark>${th('name', 'Đo đường')}<styleUrl>#line-w2</styleUrl><LineString><tessellate>1</tessellate>` +
      `<coordinates>${toaDo.map(p => `${p[0]},${p[1]},0`).join(' ')}</coordinates></LineString></Placemark>`)
  }
  for (const d of veTay) {
    phan.push(`<Placemark>${th('name', d.ten || 'Đường vẽ tay')}<styleUrl>#line-w2</styleUrl><LineString><tessellate>1</tessellate>` +
      `<coordinates>${d.toa_do.map(p => `${p[0]},${p[1]},0`).join(' ')}</coordinates></LineString></Placemark>`)
  }
  if (track.length) {
    phan.push(`<Placemark>${th('name', 'Current Track')}<styleUrl>#multiTrack33</styleUrl><gx:balloonVisibility>1</gx:balloonVisibility>` +
      `<gx:Track>${track.map(p => `<gx:coord>${p.kinh_do} ${p.vi_do}</gx:coord>`).join('')}</gx:Track></Placemark>`)
  }
  phan.push(`</Folder></Document></kml>`)
  return phan.join('\n')
}

// ---------------------------------------------------------------- luu tu KML (ung dung Android)

const EPS_TOA_DO = 1e-7

/** Ghep cot trong KML voi cot dang co cua tuyen: truoc het theo ten, sau do theo toa do. */
function ghepCot(moi, hienCo) {
  const dung = new Set()
  const ketQua = new Array(moi.length).fill(null)
  const theoTen = new Map()
  for (const e of hienCo) {
    const k = String(e.ten_cot || '').trim().toLowerCase()
    if (!theoTen.has(k)) theoTen.set(k, [])
    theoTen.get(k).push(e)
  }
  moi.forEach((m, i) => {
    const ds = theoTen.get(String(m.ten_cot || '').trim().toLowerCase()) || []
    const e = ds.find(x => !dung.has(x.id))
    if (e) { dung.add(e.id); ketQua[i] = e }
  })
  moi.forEach((m, i) => {
    if (ketQua[i]) return
    const e = hienCo.find(x => !dung.has(x.id) &&
      Math.abs(Number(x.kinh_do) - m.kinh_do) < EPS_TOA_DO && Math.abs(Number(x.vi_do) - m.vi_do) < EPS_TOA_DO)
    if (e) { dung.add(e.id); ketQua[i] = e }
  })
  return ketQua
}

/**
 * Luu mot tuyen da co tu noi dung KML (ung dung Android khong gui JSON cot). Cot duoc ghep voi cot hien co de
 * giu id (phien ban / so sanh van co nghia); cot khong con trong tep bi xoa mem nhu POST /tuyen/:id/luu.
 * tuyChon: cac truong cua luuSchema tru cot / duong / track.
 */
async function luuTuKml(req, tuyenId, xml, tuyChon = {}) {
  await tuyenSv.layTuyen(req, db, tuyenId) // 404 neu khong thay / ngoai pham vi
  const kq = phanTichKml(xml)
  if (!kq.cacTuyen.length) throw loi.duLieuSai('Tệp KML không có tuyến nào (không tìm thấy Placemark điểm)')
  if (kq.cacTuyen.length > 1) {
    throw loi.duLieuSai('Tệp KML có nhiều tuyến; chỉ gửi một tuyến cho mỗi lần lưu', [{ truong: 'kml', thong_diep: `${kq.cacTuyen.length} tuyến` }])
  }
  const cat = await danhMuc.lay(db)
  const pt = phanTichTuyen(kq.cacTuyen[0], kq.nguon, cat)
  if (!pt.cot.length) throw loi.duLieuSai('Tệp KML không có cột hợp lệ nào')

  const hienCo = await tuyenSv.layCotHienTai(db, tuyenId)
  const ghep = ghepCot(pt.cot, hienCo)
  const cot = pt.cot.map((c, i) => {
    const e = ghep[i]
    // KML khong noi duoc nguon diem: giu nguon cu cua cot da co, cot moi de trong
    return { ...c, id: e ? e.id : undefined, nguon_diem: e ? e.nguon_diem : null }
  })
  const body = { ...tuyChon, cot }
  if (pt.duong.length) body.duong = pt.duong
  if (pt.track.length) body.track = pt.track

  const luu = await tuyenSv.luu(req, tuyenId, body)
  return {
    ...luu,
    nguon_tep: kq.nguon,
    so_canh_bao: pt.canh_bao.length,
    canh_bao: pt.canh_bao.slice(0, GIOI_HAN_CANH_BAO_CHI_TIET),
  }
}

module.exports = { phanTichKml, phanTichTuyen, nhap, xuat, luuTuKml }
