'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { khoiTao, cotMau } = require('./helpers')
const { TRUONG_SUA } = require('../src/services/cot')

let H
let ql1, nv1, nv2, kt
test.before(async () => {
  H = await khoiTao()
  ql1 = await H.nguoiDung('ql1', 'quan_ly_cap_1')
  nv1 = await H.nguoiDung('nv1', 'nhan_vien', ql1.id)
  nv2 = await H.nguoiDung('nv2', 'nhan_vien', ql1.id)
  kt = await H.nguoiDung('kt', 'ke_toan')
})
test.after(async () => { await H.dong() })

const nhap = (u, kml, query, loai = 'application/xml') =>
  H.goi('POST', '/tuyen/nhap-kml', { token: u.token, raw: kml, query, headers: { 'Content-Type': loai } })

const layCot = async (u, id) => (await H.goi('GET', `/tuyen/${id}`, { token: u.token, query: { kem: 'cot,duong,track' } })).body

/** Cac truong cot can giong nhau sau khi xuat roi nhap lai. */
// ky_hieu va so_thu_tu khong co the rieng trong KML: chi suy duoc tu ten dang `<ky hieu> <so>`
const SO_SANH = TRUONG_SUA.filter(t => !['nguon_diem', 'thuoc_tinh_khac', 'so_thu_tu', 'ky_hieu'].includes(t))
const rutGon = (c) => Object.fromEntries(SO_SANH.map(t => [t, c[t]]))

// ----------------------------------------------------------------- KML Android viet tay (theo loi da biet)
const pmAndroid = (ten, kd, vd, { loaiCot = '', cao = '', vatTu = '', beCap = '', phuKien = '', gong = '', udj = '', ud = '' } = {}) => `
<Placemark><name>${ten}</name><diachi>Ngõ 1 &amp; ngách 2</diachi><lytrinh>Km1</lytrinh>
<nhandoiphukien>false</nhandoiphukien><bienbao>true</bienbao>
<styleUrl>#m_ylw-pushpin</styleUrl><Point><coordinates>${kd},${vd},0</coordinates></Point>
<LoaiCot><chieucaocot>${cao}</chieucaocot><chungloai>${loaiCot}</chungloai></LoaiCot>
<VatTu><ten>${vatTu}</ten><chungloai1></chungloai1><chungloai2></chungloai2></VatTu>
<BeCap><ten>${beCap}</ten></BeCap>
<PhuKien><ten>${phuKien}</ten></PhuKien>
<ADSS><TreoNeo>Treo</TreoNeo><UDJ>${udj}</UDJ><Gong>${gong}</Gong><ChungLoai>KV100</ChungLoai></ADSS>
<AC><TreoHam>Hãm</TreoHam><UD>${ud}</UD><ChungLoai>KV200</ChungLoai></AC></Placemark>`

const khung = (noiDung) => `<?xml version="1.0" encoding="utf-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><name>x</name>${noiDung}</Document></kml>`

test('xuat roi nhap lai (web): giong het, ten dac biet, Do duong, track, phien ban 1', async () => {
  const t = (await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'Vong "web" & <1>' } })).body
  const cot = [
    cotMau(1, {
      ten_cot: "C1 & 'a' <b>", ky_hieu: 'C1', so_thu_tu: 1, dia_diem: 'Ngõ 5 "A" & B', ly_trinh: 'Km2+100', hien_ly_trinh: true,
      ma_vat_tu: 'ms_m', ma_be_cap: 'bc1_m', ma_phu_kien: 'duphong', nhan_doi_phu_kien: true, dat_bien_bao: true,
      adss_treo_neo: 'Treo', adss_udj: 'Móc J', adss_gong: 'Gông C1', adss_chung_loai: 'KV100',
      ac_treo_ham: 'Hãm', ac_de_u: 'Đế U', ac_dai: 'Đai', ac_chung_loai: 'KV200', chung_loai_odf: '12Fo', chung_loai_splitter: '1:4',
    }),
    cotMau(2, { ma_loai_cot: 'lt_cs', chieu_cao_m: 7.5 }),
    cotMau(3, { ma_loai_cot: 'v_cs_cn', chieu_cao_m: 10 }),
  ]
  const luu = await H.goi('POST', `/tuyen/${t.id}/luu`, {
    token: nv1.token,
    body: {
      cot,
      duong: [{ loai: 'do_duong', toa_do: [[105.8, 21], [105.801, 21.0005], [105.802, 21]] }, { loai: 've_tay', ten: 'Ve tay', toa_do: [[105.8, 21.001], [105.81, 21.002]] }],
      track: [{ kinh_do: 105.8, vi_do: 21 }, { kinh_do: 105.801, vi_do: 21.001 }],
    },
  })
  assert.equal(luu.status, 201, JSON.stringify(luu.body))

  const xuat = await H.goi('GET', `/tuyen/${t.id}/kml`, { token: nv1.token })
  assert.equal(xuat.status, 200)
  assert.match(xuat.headers.get('content-type'), /kml/)
  assert.match(xuat.headers.get('content-disposition'), /filename\*=UTF-8''T_/)
  assert.ok(!/[\u0000-\u0008]/.test(xuat.body))

  assert.equal((await nhap(nv1, xuat.body)).status, 409, 'trung ten voi tuyen da co')
  const kq = await nhap(nv1, xuat.body, { khi_trung: 'doi_ten' })
  assert.equal(kq.status, 201, JSON.stringify(kq.body))
  assert.equal(kq.body.nguon_tep, 'web')
  const moi = kq.body.tuyen[0]
  assert.equal(moi.ten_tuyen, 'Vong "web" & <1> (2)')
  assert.equal(moi.so_cot, 3)
  assert.equal(moi.so_phien_ban, 1)
  assert.equal(moi.so_canh_bao, 0, JSON.stringify(moi.canh_bao))

  const goc = await layCot(nv1, t.id)
  const ban = await layCot(nv1, moi.id)
  assert.equal(ban.nguon_tao, 'nhap_kml')
  assert.equal(ban.cot.length, 3)
  for (let i = 0; i < 3; i++) assert.deepEqual(rutGon(ban.cot[i]), rutGon(goc.cot[i]), `cot ${i + 1}`)
  assert.ok(ban.cot.every(c => c.nguon_diem === 'nhap_kml'))
  assert.equal(ban.chieu_dai_tuyen_m, goc.chieu_dai_tuyen_m, 'cung duong do thi cung chieu dai')
  assert.equal(ban.duong.filter(d => d.loai === 'do_duong').length, 1)
  assert.equal(ban.duong.filter(d => d.loai === 've_tay').length, 1)
  assert.equal(ban.track.length, 2)

  // phien ban 1 va nhat ky 'tao'
  const pb = await H.goi('GET', `/tuyen/${moi.id}/phien-ban/1`, { token: nv1.token })
  assert.equal(pb.body.du_lieu_cot.length, 3)
  const nk = await H.goi('GET', '/nhat-ky', { token: nv1.token, query: { tuyen_id: moi.id } })
  assert.equal(nk.body.du_lieu[0].hanh_dong, 'tao')
  assert.equal(nk.body.du_lieu[0].chi_tiet.su_kien, 'nhap_kml')
})

test('xuat dinh dang Android: AC/UD la Dai, chieu cao co "m"; nhap lai dung nghia', async () => {
  const t = (await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'Vong android' } })).body
  await H.goi('POST', `/tuyen/${t.id}/luu`, { token: nv1.token, body: { cot: [cotMau(1, { ac_dai: 'Đai', ac_de_u: 'Đế U', chieu_cao_m: 6.5 })] } })
  const x = await H.goi('GET', `/tuyen/${t.id}/kml`, { token: nv1.token, query: { dinh_dang: 'android' } })
  assert.match(x.body, /<chieucaocot>6\.5m<\/chieucaocot>/)
  assert.match(x.body, /<UD>Đai<\/UD>/, 'Android: UD = Dai')
  assert.ok(!/<DAI>/.test(x.body))
  const web = await H.goi('GET', `/tuyen/${t.id}/kml`, { token: nv1.token })
  assert.match(web.body, /<chieucaocot>6\.5<\/chieucaocot>/)
  assert.match(web.body, /<UD>Đế U<\/UD>/)
  assert.match(web.body, /<DAI>Đai<\/DAI>/)
  assert.equal((await H.goi('GET', `/tuyen/${t.id}/kml`, { token: nv1.token, query: { dinh_dang: 'ios' } })).status, 400)

  const kq = await nhap(nv1, x.body, { khi_trung: 'doi_ten' })
  assert.equal(kq.body.nguon_tep, 'android')
  const c = (await layCot(nv1, kq.body.tuyen[0].id)).cot[0]
  assert.equal(c.ac_dai, 'Đai')
  assert.equal(c.ac_de_u, null, 'Android khong co Đế U (D2)')
  assert.equal(c.chieu_cao_m, 6.5)
})

test('KML Android viet tay: loi Gong (D1), hien trang suy tu ma, ma la, Do duong bo qua, du an long nhau', async () => {
  const kml = khung(`
<Folder><name>Du an Lon</name>
 <Folder><name>Du an Con</name>
  <Folder><name>T_Tuyen Android</name>
   ${pmAndroid('Cot 1', 105.8, 21.0, { loaiCot: '2lt_tm', cao: '8m', vatTu: 'ms_m', beCap: 'bc1_m', phuKien: 'duphong', gong: 'Đế U', udj: 'Đế U', ud: 'Đai' })}
   ${pmAndroid('Cot 2', 105.801, 21.0, { loaiCot: 'lt_cs', cao: '7m', vatTu: 'ms_cs' })}
   ${pmAndroid('Cot 3', 105.802, 21.0, { loaiCot: 'ma_la_khong_co', cao: '9.9m', vatTu: 'vt_la', beCap: 'be_la', phuKien: 'pk_la' })}
   <Placemark><name>Đo đường</name><LineString><coordinates>105.8,21,0 105.802,21,0</coordinates></LineString></Placemark>
   <Placemark><name>Current Track</name><gx:Track><gx:coord>105.8 21 0</gx:coord><gx:coord>105.801 21 0</gx:coord><gx:coord>abc def</gx:coord></gx:Track></Placemark>
  </Folder>
 </Folder>
</Folder>`)
  const kq = await nhap(nv2, kml)
  assert.equal(kq.status, 201, JSON.stringify(kq.body))
  assert.equal(kq.body.nguon_tep, 'android')
  assert.deepEqual(kq.body.du_an_moi.map(d => d.ten), ['Du an Lon', 'Du an Con'])
  const r = kq.body.tuyen[0]
  assert.equal(r.ten_tuyen, 'Tuyen Android')
  assert.equal(r.so_cot, 3)
  assert.equal(r.bo_qua_do_duong, 1, 'duong do Android sinh tu cot nen bo qua (D12)')
  assert.equal(r.so_diem_track, 2, 'diem track hong bi bo')
  const loai = r.canh_bao_theo_loai
  assert.equal(loai.gong_khong_khoi_phuc, 1)
  assert.ok(loai.chieu_cao_ngoai_danh_muc >= 1)
  assert.ok(loai.ma_ngoai_danh_muc >= 3)

  const ban = await layCot(nv2, r.id)
  const [c1, c2, c3] = ban.cot
  assert.equal(c1.adss_gong, null, 'Gong khong thuoc danh muc gong -> rong')
  assert.equal(c1.thuoc_tinh_khac.adss_gong_goc, 'Đế U', 'giu gia tri goc de khong mat du lieu')
  assert.equal(c1.adss_udj, 'Đế U')
  assert.equal(c1.ac_dai, 'Đai')
  assert.equal(c1.chieu_cao_m, 8)
  assert.equal(c1.dia_diem, 'Ngõ 1 & ngách 2')
  assert.equal(c1.dat_bien_bao, true)
  assert.equal(c1.hien_trang_cot, 'tm', 'suy tu ma 2lt_tm')
  assert.equal(c1.hien_trang_vat_tu, 'tm')
  assert.equal(c1.hien_trang_be_cap, 'tm')
  assert.equal(c2.hien_trang_cot, 'cs')
  assert.equal(c2.hien_trang_vat_tu, 'cs')
  assert.equal(c3.ma_loai_cot, null)
  assert.equal(c3.thuoc_tinh_khac.ma_loai_cot_goc, 'ma_la_khong_co')
  assert.equal(c3.chieu_cao_m, null)
  assert.equal(c3.thuoc_tinh_khac.chieu_cao_goc, '9.9m')
  assert.equal(ban.duong.length, 0)
  assert.equal(ban.track.length, 2)
  assert.notEqual(ban.du_an_id, null)
  const da = await H.goi('GET', `/du-an/${ban.du_an_id}`, { token: nv2.token })
  assert.equal(da.body.ten, 'Du an Con')
  assert.notEqual(da.body.cha_id, null)

  // luu lai tuyen vua nhap voi du lieu cu "khong thuoc danh muc" khong bi chan (cot khong doi)
  const lai = await H.goi('POST', `/tuyen/${ban.id}/luu`, { token: nv2.token, body: { cot: ban.cot, phien_ban_co_so: 1 } })
  assert.equal(lai.status, 201, JSON.stringify(lai.body))
  assert.equal(lai.body.phien_ban.so_cot_sua, 0)
})

test('chay thu (thu=true) khong ghi gi; loi giua chung thi khong tuyen nao duoc tao', async () => {
  const kml = khung(`<Folder><name>T_Chay thu</name>${pmAndroid('A', 105.8, 21)}${pmAndroid('B', 105.801, 21)}</Folder>`)
  const truoc = (await H.goi('GET', '/tuyen', { token: nv1.token })).body.phan_trang.tong
  const thu = await nhap(nv1, kml, { thu: 'true' })
  assert.equal(thu.status, 200)
  assert.equal(thu.body.da_luu, false)
  assert.equal(thu.body.tuyen[0].so_cot, 2)
  assert.equal((await H.goi('GET', '/tuyen', { token: nv1.token })).body.phan_trang.tong, truoc)
  assert.equal((await H.db.query("SELECT count(*)::int n FROM tuyen WHERE ten_tuyen = 'Chay thu'")).rows[0].n, 0)

  // hai tuyen, tuyen thu hai trung ten tuyen co san -> mac dinh loi, khong luu tuyen nao
  await nhap(nv1, khung(`<Folder><name>T_Co san</name>${pmAndroid('A', 105.8, 21)}</Folder>`))
  const hai = khung(`<Folder><name>T_Moi 1</name>${pmAndroid('A', 105.8, 21)}</Folder><Folder><name>T_Co san</name>${pmAndroid('A', 105.8, 21)}</Folder>`)
  const loi = await nhap(nv1, hai)
  assert.equal(loi.status, 409)
  assert.deepEqual(loi.body.loi.chi_tiet.ten_trung, ['Co san'])
  assert.equal((await H.db.query("SELECT count(*)::int n FROM tuyen WHERE ten_tuyen = 'Moi 1'")).rows[0].n, 0)
  const boQua = await nhap(nv1, hai, { khi_trung: 'bo_qua' })
  assert.equal(boQua.status, 201)
  assert.deepEqual(boQua.body.bo_qua.map(x => x.ten), ['Co san'])
  assert.equal(boQua.body.tuyen.length, 1)
  // hai tuyen cung ten trong cung tep
  const cung = khung(`<Folder><name>T_Cung ten</name>${pmAndroid('A', 105.8, 21)}</Folder><Folder><name>T_cung ten</name>${pmAndroid('A', 105.8, 21)}</Folder>`)
  assert.equal((await nhap(nv1, cung)).status, 409)
  const dd = await nhap(nv1, cung, { khi_trung: 'doi_ten' })
  assert.deepEqual(dd.body.tuyen.map(x => x.ten_tuyen), ['Cung ten', 'cung ten (2)'])
})

test('KML hong hoac nguy hiem bi tu choi', async () => {
  assert.equal((await nhap(nv1, '')).status, 400)
  assert.equal((await nhap(nv1, 'khong phai xml')).status, 400)
  assert.equal((await nhap(nv1, '<html></html>')).status, 400)
  assert.equal((await nhap(nv1, '<?xml version="1.0"?><!DOCTYPE kml [<!ENTITY a "aaaa">]><kml><Document/></kml>')).status, 400, 'DOCTYPE/ENTITY bi chan')
  assert.equal((await nhap(nv1, khung('<Folder/>'))).status, 422, 'khong co tuyen nao')
  const rong = await nhap(nv1, khung('<Folder><name>T_Rong</name></Folder>'))
  assert.equal(rong.status, 201)
  assert.equal(rong.body.tuyen[0].so_cot, 0)
  assert.equal(rong.body.canh_bao_theo_loai.tuyen_rong, 1)
  const sai = await nhap(nv1, khung(`<Folder><name>T_Sai toa do</name>${pmAndroid('A', 999, 21)}</Folder>`))
  assert.equal(sai.body.tuyen[0].so_cot, 0, 'cot sai toa do bi bo, tuyen van duoc tao kem canh bao')
  const mot = khung(`<Folder><name>T_Mot cot sai</name>${pmAndroid('A', 105.8, 21)}${pmAndroid('B', 999, 21)}</Folder>`)
  const r = await nhap(nv1, mot)
  assert.equal(r.status, 201)
  assert.equal(r.body.tuyen[0].so_cot, 1)
  assert.equal(r.body.tuyen[0].bo_qua_cot_toa_do_sai, 1)
  assert.equal((await nhap(nv1, '{"kml": 1}', undefined, 'application/json')).status, 400)
  // JSON { kml }
  const json = await H.goi('POST', '/tuyen/nhap-kml', { token: nv1.token, body: { kml: khung(`<Folder><name>T_Qua JSON</name>${pmAndroid('A', 105.8, 21)}</Folder>`) } })
  assert.equal(json.status, 201)
  assert.equal((await H.goi('POST', '/tuyen/nhap-kml', { token: nv1.token, query: { khi_trung: 'xoa_het' }, raw: khung('<Folder/>'), headers: { 'Content-Type': 'text/xml' } })).status, 422)
  assert.equal((await H.goi('POST', '/tuyen/nhap-kml', { token: nv1.token, query: { du_an_id: 'khong-uuid' }, raw: khung('<Folder/>'), headers: { 'Content-Type': 'text/xml' } })).status, 422)
})

test('phan quyen KML: ke toan khong nhap/xuat; nhan vien khac khong xuat tuyen cua nguoi khac; quan ly xuat duoc', async () => {
  const kml = khung(`<Folder><name>T_Quyen</name>${pmAndroid('A', 105.8, 21)}</Folder>`)
  assert.equal((await nhap(kt, kml)).status, 403)
  const t = (await nhap(nv1, kml)).body.tuyen[0]
  assert.equal((await H.goi('GET', `/tuyen/${t.id}/kml`, { token: nv2.token })).status, 404)
  assert.equal((await H.goi('GET', `/tuyen/${t.id}/kml`, { token: kt.token })).status, 403)
  assert.equal((await H.goi('GET', `/tuyen/${t.id}/kml`, { token: ql1.token })).status, 200)
  // nhap vao du an cua nguoi khac
  const da = (await H.goi('POST', '/du-an', { token: nv1.token, body: { ten: 'DA rieng' } })).body
  assert.equal((await nhap(nv2, khung(`<Folder><name>T_Lac</name>${pmAndroid('A', 105.8, 21)}</Folder>`), { du_an_id: da.id })).status, 422)
  const dung = await nhap(nv1, khung(`<Folder><name>T_Trong du an</name>${pmAndroid('A', 105.8, 21)}</Folder>`), { du_an_id: da.id })
  assert.equal(dung.status, 201)
  assert.equal(dung.body.tuyen[0].du_an_id, da.id)
})

test('KML lon: 3000 cot nhap trong mot giao dich, thoi gian chap nhan duoc', async () => {
  let pm = ''
  for (let i = 0; i < 3000; i++) pm += pmAndroid(`C${i}`, 105 + i * 0.0001, 21, { loaiCot: '2lt_tm', cao: '8m' })
  const t0 = Date.now()
  const r = await nhap(nv1, khung(`<Folder><name>T_Lon</name>${pm}</Folder>`))
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 300))
  assert.equal(r.body.tuyen[0].so_cot, 3000)
  assert.ok(Date.now() - t0 < 60000, `mat ${Date.now() - t0}ms`)
  assert.ok(r.body.tuyen[0].canh_bao.length <= 50, 'chi tiet canh bao bi cat gon')
})

// ----------------------------------------------------------------- luu tu KML (ung dung Android)

const luuKml = (u, id, body) => H.goi('POST', `/tuyen/${id}/luu-kml`, { token: u.token, body })

test('luu-kml: lan dau tao cot, lan sau giu id cot (theo ten), xung dot phien ban, trung lap, pham vi', async () => {
  const t = (await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'Tuyen luu kml', nguon_tao: 'android' } })).body
  const kml1 = khung(`<Folder><name>T_Tuyen luu kml</name>
    ${pmAndroid('Cot 1', 105.8, 21.0, { loaiCot: 'lt_cs', cao: '7m', vatTu: 'ms_cs' })}
    ${pmAndroid('Cot 2', 105.801, 21.0, { loaiCot: 'lt_cs', cao: '7m' })}
    ${pmAndroid('Cot 3', 105.802, 21.0, { loaiCot: 'lt_cs', cao: '7m' })}
    <Placemark><name>Current Track</name><gx:Track><gx:coord>105.8 21 0</gx:coord><gx:coord>105.801 21 0</gx:coord></gx:Track></Placemark>
  </Folder>`)
  const maYeuCau = '11111111-1111-4111-8111-111111111111'
  const r1 = await luuKml(nv1, t.id, { kml: kml1, ma_yeu_cau: maYeuCau, phien_ban_co_so: 0, gps: { kinh_do: 105.8, vi_do: 21, do_chinh_xac_m: 8 } })
  assert.equal(r1.status, 201, JSON.stringify(r1.body))
  assert.equal(r1.body.phien_ban.so_phien_ban, 1)
  assert.equal(r1.body.phien_ban.so_cot, 3)
  assert.equal(r1.body.nguon_tep, 'android')
  const truoc = await layCot(nv1, t.id)
  assert.equal(truoc.cot.length, 3)
  assert.equal(truoc.track.length, 2)
  assert.ok(truoc.chieu_dai_tuyen_m > 0)

  // gui lai cung ma_yeu_cau: khong tao phien ban moi
  const trung = await luuKml(nv1, t.id, { kml: kml1, ma_yeu_cau: maYeuCau })
  assert.equal(trung.status, 200)
  assert.equal(trung.body.trung_lap, true)

  // sua: doi chieu cao Cot 2, bo Cot 3, them Cot 4 (dung ten moi, toa do moi)
  const kml2 = khung(`<Folder><name>T_Tuyen luu kml</name>
    ${pmAndroid('Cot 1', 105.8, 21.0, { loaiCot: 'lt_cs', cao: '7m', vatTu: 'ms_cs' })}
    ${pmAndroid('Cot 2', 105.801, 21.0, { loaiCot: 'lt_cs', cao: '8m' })}
    ${pmAndroid('Cot 4', 105.803, 21.0, { loaiCot: 'lt_cs', cao: '7m' })}
  </Folder>`)
  const r2 = await luuKml(nv1, t.id, { kml: kml2, phien_ban_co_so: 1 })
  assert.equal(r2.status, 201, JSON.stringify(r2.body))
  assert.equal(r2.body.phien_ban.so_phien_ban, 2)
  const sau = await layCot(nv1, t.id)
  assert.equal(sau.cot.length, 3)
  assert.equal(sau.cot[0].id, truoc.cot[0].id, 'Cot 1 giu id')
  assert.equal(sau.cot[1].id, truoc.cot[1].id, 'Cot 2 giu id')
  assert.equal(sau.cot[1].chieu_cao_m, 8)
  assert.notEqual(sau.cot[2].id, truoc.cot[2].id, 'Cot 4 la cot moi')
  assert.equal(sau.track.length, 2, 'KML khong co track thi giu track cu')
  assert.equal(r2.body.phien_ban.so_cot_them, 1)
  assert.equal(r2.body.phien_ban.so_cot_xoa, 1)
  assert.equal(r2.body.phien_ban.so_cot_sua, 1)

  // doi ten cot nhung giu toa do: van ghep duoc theo toa do
  const kml3 = kml2.replace('>Cot 1<', '>Cot A<')
  const r3 = await luuKml(nv1, t.id, { kml: kml3, phien_ban_co_so: 2 })
  assert.equal(r3.status, 201, JSON.stringify(r3.body))
  assert.equal((await layCot(nv1, t.id)).cot[0].id, truoc.cot[0].id, 'ghep theo toa do khi doi ten')
  assert.equal(r3.body.phien_ban.so_cot_them, 0)
  assert.equal(r3.body.phien_ban.so_cot_xoa, 0)

  // xung dot phien ban va ghi de
  const xd = await luuKml(nv1, t.id, { kml: kml2, phien_ban_co_so: 1 })
  assert.equal(xd.status, 409)
  assert.equal(xd.body.loi.ma, 'XUNG_DOT_PHIEN_BAN')
  const gd = await luuKml(nv1, t.id, { kml: kml2, phien_ban_co_so: 1, ghi_de: true })
  assert.equal(gd.status, 201, JSON.stringify(gd.body))

  // sai dau vao
  assert.equal((await luuKml(nv1, t.id, { phien_ban_co_so: 1 })).status, 422)
  assert.equal((await luuKml(nv1, t.id, { kml: 'khong phai xml' })).status, 400)
  assert.equal((await luuKml(nv1, t.id, { kml: khung('') })).status, 422)
  assert.equal((await luuKml(nv1, t.id, { kml: kml2, cot: [] })).status, 422, 'khong nhan cot cung luc')
  const hai = khung(`<Folder><name>T_A</name>${pmAndroid('A', 105.8, 21)}</Folder><Folder><name>T_B</name>${pmAndroid('B', 105.8, 21)}</Folder>`)
  assert.equal((await luuKml(nv1, t.id, { kml: hai, ghi_de: true })).status, 422)

  // ngoai pham vi: nhan vien khac khong thay tuyen
  assert.equal((await luuKml(nv2, t.id, { kml: kml2 })).status, 404)
  assert.equal((await luuKml(kt, t.id, { kml: kml2 })).status, 403)
})

test('luu-kml: tuyen da hoan thien luu thanh chinh_sua_sau', async () => {
  const t = (await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'Tuyen hoan thien kml', nguon_tao: 'android' } })).body
  const kml = khung(`<Folder><name>T_x</name>${pmAndroid('A', 105.8, 21)}${pmAndroid('B', 105.801, 21)}</Folder>`)
  assert.equal((await luuKml(nv1, t.id, { kml })).status, 201)
  assert.equal((await H.goi('POST', `/tuyen/${t.id}/hoan-thien`, { token: nv1.token, body: {} })).status, 200)
  const r = await luuKml(nv1, t.id, { kml })
  assert.equal(r.status, 201, JSON.stringify(r.body))
  assert.equal(r.body.phien_ban.loai_luu, 'chinh_sua_sau')
})
