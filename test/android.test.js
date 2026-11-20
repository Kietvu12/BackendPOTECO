'use strict'
/**
 * Luong ma ung dung Android (AppKhaoSatPOTECO) thuc hien, theo dung thu tu va dang du lieu cua
 * DongBoTuyen.java / ApiClient.java: dang nhap bang tai khoan (khong ma thiet bi), lay loai cong trinh,
 * tao tuyen, gui KML, tai lai KML, hoan thien, lam moi token, dang xuat.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const { khoiTao } = require('./helpers')

let H
let nv
test.before(async () => {
  H = await khoiTao()
  const ql = await H.taoTaiKhoan('ql_a', 'quan_ly_cap_1')
  await H.taoTaiKhoan('nv_a', 'nhan_vien', ql.id)
  const ql2 = await H.nguoiDung('ql2_a', 'quan_ly_cap_2')
  const r = await H.goi('POST', '/danh-muc/loai-cong-trinh', { token: ql2.token, body: { ma: 'TREO', ten: 'Cáp treo', he_so_n: 1.05 } })
  assert.equal(r.status, 201, JSON.stringify(r.body))
})
test.after(async () => { await H.dong() })

const cotKml = (ten, kd, vd, cao = '7m') => `<Placemark><name>${ten}</name><diachi>Ngõ 1</diachi><lytrinh>Km1</lytrinh>
<nhandoiphukien>false</nhandoiphukien><bienbao>true</bienbao>
<styleUrl>#m_ylw-pushpin</styleUrl><Point><coordinates>${kd},${vd},0</coordinates></Point>
<LoaiCot><chieucaocot>${cao}</chieucaocot><chungloai>lt_cs</chungloai></LoaiCot>
<VatTu><ten>ms_cs</ten><chungloai1></chungloai1><chungloai2></chungloai2></VatTu>
<BeCap><ten></ten></BeCap><PhuKien><ten></ten></PhuKien>
<ADSS><TreoNeo>Treo</TreoNeo><UDJ>Đế U</UDJ><Gong></Gong><ChungLoai>KV100</ChungLoai></ADSS>
<AC><TreoHam>Hãm</TreoHam><UD>Đai</UD><ChungLoai>KV200</ChungLoai></AC></Placemark>`

const khung = (ten, cot) => `<?xml version="1.0" encoding="utf-8"?>
<kml xmlns:atom="http://www.w3.org/2005/Atom" xmlns:gx="http://www.google.com/kml/ext/2.2" xmlns:kml="http://www.opengis.net/kml/2.2" xmlns="http://www.opengis.net/kml/2.2">
<Document><name>kmlFile</name><Folder><name>T_${ten}</name>${cot.join('')}
<Placemark><name>Đo đường</name><LineString><coordinates>105.8,21,0 105.801,21,0</coordinates></LineString></Placemark>
</Folder></Document></kml>`

test('luong ung dung: dang nhap tai khoan, loai cong trinh, tao + gui + tai lai + hoan thien', async () => {
  // 1. dang nhap chi bang tai khoan (khong ma_thiet_bi)
  const dn = await H.dangNhap('nv_a')
  assert.equal(dn.tai_khoan.ten_dang_nhap, 'nv_a')
  assert.ok(dn.tai_khoan.ho_ten && dn.tai_khoan.vai_tro_ten)
  assert.equal(dn.thiet_bi_id, null)
  nv = { token: dn.access_token, refresh: dn.refresh_token }

  // 2. loai cong trinh: cac truong ung dung doc
  const loai = await H.goi('GET', '/danh-muc/loai-cong-trinh', { token: nv.token })
  assert.equal(loai.status, 200)
  assert.ok(Array.isArray(loai.body) && loai.body.length > 0)
  const l = loai.body.find(x => x.hoat_dong)
  assert.ok(l, 'co loai dang hoat dong')
  for (const k of ['id', 'ten', 'he_so_n', 'hoat_dong']) assert.ok(k in l, `thieu ${k}`)
  assert.ok(Number.isInteger(l.id))

  // 3. tao tuyen (nguon android, GPS + gio kieu +07:00 nhu Java)
  const gio = '2026-11-19T16:30:00+07:00'
  const gps = { kinh_do: 105.8, vi_do: 21, do_chinh_xac_m: 12.345600128173828 }
  const t = await H.goi('POST', '/tuyen', { token: nv.token, body: { ten_tuyen: 'Tuyen app', nguon_tao: 'android', thoi_gian_thiet_bi: gio, gps } })
  assert.equal(t.status, 201, JSON.stringify(t.body))
  assert.equal(typeof t.body.id, 'string')

  // 4. gui KML lan dau
  const kml1 = khung('Tuyen app', [cotKml('Cot 1', 105.8, 21), cotKml('Cot 2', 105.801, 21)])
  const r1 = await H.goi('POST', `/tuyen/${t.body.id}/luu-kml`, {
    token: nv.token,
    body: { kml: kml1, loai_cong_trinh_id: l.id, ma_yeu_cau: '22222222-2222-4222-8222-222222222222', phien_ban_co_so: 0, thoi_gian_thiet_bi: gio, gps },
  })
  assert.equal(r1.status, 201, JSON.stringify(r1.body))
  const pb = r1.body.phien_ban
  assert.equal(pb.so_phien_ban, 1)
  assert.equal(pb.so_cot, 2)
  assert.ok(Number(pb.chieu_dai_tuyen_m) > 0)
  assert.equal(pb.loai_luu, 'hien_truong')
  assert.equal(pb.loai_cong_trinh_id, l.id)
  assert.equal(Number(pb.he_so_n), 1.05)
  assert.ok(Math.abs(Number(pb.chieu_dai_cap_m) - Number(pb.chieu_dai_tuyen_m) * 1.05) < 0.1, 'cap = tuyen x n')
  for (const k of ['so_cot_them', 'so_cot_sua', 'so_cot_xoa', 'chieu_dai_cap_m', 'he_so_n']) assert.ok(k in pb, `thieu ${k}`)
  assert.equal(r1.body.tuyen.trang_thai, 'dang_khao_sat')
  assert.equal(r1.body.so_canh_bao, 0, JSON.stringify(r1.body.canh_bao))

  // 5. danh sach tuyen (ung dung dung de tai ve) co du cac truong
  const ds = await H.goi('GET', '/tuyen', { token: nv.token, query: { so_luong: '100' } })
  assert.equal(ds.status, 200)
  const m = ds.body.du_lieu.find(x => x.id === t.body.id)
  for (const k of ['id', 'ten_tuyen', 'so_cot', 'chieu_dai_tuyen_m', 'phien_ban_hien_tai', 'trang_thai', 'du_an_id']) assert.ok(k in m, `thieu ${k}`)
  assert.equal(m.phien_ban_hien_tai, 1)

  // 6. may khac cung ten: tao -> 409 (khong phai XUNG_DOT_PHIEN_BAN), tim lai theo ten q
  const trung = await H.goi('POST', '/tuyen', { token: nv.token, body: { ten_tuyen: 'tuyen APP', nguon_tao: 'android' } })
  assert.equal(trung.status, 409)
  assert.notEqual(trung.body.loi.ma, 'XUNG_DOT_PHIEN_BAN')
  const tim = await H.goi('GET', '/tuyen', { token: nv.token, query: { so_luong: '100', q: 'tuyen app' } })
  assert.ok(tim.body.du_lieu.some(x => x.id === t.body.id))

  // 7. tai lai KML dinh dang Android va gui lai nguyen van: khong doi cot nao
  const tai = await H.goi('GET', `/tuyen/${t.body.id}/kml`, { token: nv.token, query: { dinh_dang: 'android' } })
  assert.equal(tai.status, 200)
  assert.equal(typeof tai.body, 'string')
  assert.match(tai.body, /<Folder>/)
  const r2 = await H.goi('POST', `/tuyen/${t.body.id}/luu-kml`, { token: nv.token, body: { kml: tai.body, phien_ban_co_so: 1, thoi_gian_thiet_bi: gio } })
  assert.equal(r2.status, 201, JSON.stringify(r2.body))
  assert.equal(r2.body.phien_ban.so_cot_them, 0)
  assert.equal(r2.body.phien_ban.so_cot_sua, 0)
  assert.equal(r2.body.phien_ban.so_cot_xoa, 0)
  assert.equal(r2.body.phien_ban.loai_cong_trinh_id, l.id, 'khong gui loai thi giu loai cu')

  // 8. hoan thien roi luu tiep -> chinh_sua_sau
  const ht = await H.goi('POST', `/tuyen/${t.body.id}/hoan-thien`, { token: nv.token, body: { thoi_gian_thiet_bi: gio, gps } })
  assert.equal(ht.status, 200, JSON.stringify(ht.body))
  const r3 = await H.goi('POST', `/tuyen/${t.body.id}/luu-kml`, { token: nv.token, body: { kml: kml1, phien_ban_co_so: 2 } })
  assert.equal(r3.status, 201)
  assert.equal(r3.body.phien_ban.loai_luu, 'chinh_sua_sau')
  assert.equal(r3.body.tuyen.trang_thai, 'hoan_thien')
})

test('token: lam moi (xoay vong) va dang xuat thu hoi refresh token', async () => {
  const dn = await H.dangNhap('nv_a')
  const lm = await H.goi('POST', '/auth/lam-moi', { body: { refresh_token: dn.refresh_token } })
  assert.equal(lm.status, 200)
  assert.ok(lm.body.access_token && lm.body.refresh_token && lm.body.refresh_token !== dn.refresh_token)
  const ok = await H.goi('GET', '/tuyen', { token: lm.body.access_token })
  assert.equal(ok.status, 200)
  const dx = await H.goi('POST', '/auth/dang-xuat', { token: lm.body.access_token, body: { refresh_token: lm.body.refresh_token } })
  assert.equal(dx.status, 200)
  assert.equal((await H.goi('POST', '/auth/lam-moi', { body: { refresh_token: lm.body.refresh_token } })).status, 401)
  const sai = await H.goi('POST', '/auth/dang-nhap', { body: { ten_dang_nhap: 'nv_a', mat_khau: 'sai-mat-khau-1' } })
  assert.equal(sai.status, 401)
  assert.ok(sai.body.loi.thong_diep)
})
