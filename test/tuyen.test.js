'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const { khoiTao, cotMau } = require('./helpers')

let H
let admin, ql2, ql1, ql1b, nv1, nv2, nv3, kt
let loaiCT

test.before(async () => {
  H = await khoiTao()
  admin = await H.nguoiDung('admin', 'quan_tri')
  ql2 = await H.nguoiDung('ql2', 'quan_ly_cap_2')
  ql1 = await H.nguoiDung('ql1', 'quan_ly_cap_1', ql2.id)
  ql1b = await H.nguoiDung('ql1b', 'quan_ly_cap_1')
  nv1 = await H.nguoiDung('nv1', 'nhan_vien', ql1.id)
  nv2 = await H.nguoiDung('nv2', 'nhan_vien', ql1.id)
  nv3 = await H.nguoiDung('nv3', 'nhan_vien', ql1b.id)
  kt = await H.nguoiDung('kt', 'ke_toan')
})
test.after(async () => { await H.dong() })

const ngayVN = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
const gps = { kinh_do: 105.8, vi_do: 21.0, do_chinh_xac_m: 4.5 }

test('loai cong trinh va he so n: chi cap 2 tro len duoc sua', async () => {
  const body = { ma: 'CT1', ten: 'Cáp treo', he_so_n: 1.5 }
  assert.equal((await H.goi('POST', '/danh-muc/loai-cong-trinh', { token: nv1.token, body })).status, 403)
  assert.equal((await H.goi('POST', '/danh-muc/loai-cong-trinh', { token: ql1.token, body })).status, 403)
  assert.equal((await H.goi('POST', '/danh-muc/loai-cong-trinh', { token: kt.token, body })).status, 403)
  const r = await H.goi('POST', '/danh-muc/loai-cong-trinh', { token: ql2.token, body })
  assert.equal(r.status, 201)
  loaiCT = r.body
  assert.equal(loaiCT.he_so_n, 1.5)
  assert.equal((await H.goi('POST', '/danh-muc/loai-cong-trinh', { token: ql2.token, body })).status, 409)
  for (const he_so_n of [0, -1, 1000, 1.2345]) {
    assert.equal((await H.goi('POST', '/danh-muc/loai-cong-trinh', { token: ql2.token, body: { ma: 'X' + he_so_n, ten: 'x', he_so_n } })).status, 422, `he so ${he_so_n}`)
  }
  // moi vai tro doc duoc danh muc
  const dm = await H.goi('GET', '/danh-muc', { token: nv1.token })
  assert.equal(dm.status, 200)
  assert.ok(dm.body.loai_cot.length > 10)
  assert.ok(dm.body.loai_cong_trinh.some(x => x.ma === 'CT1'))
})

let tuyenA
test('tao tuyen: bo tien to T_, ten duy nhat khong phan biet hoa thuong', async () => {
  const r = await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'T_Tuyen A', loai_cong_trinh_id: loaiCT.id } })
  assert.equal(r.status, 201)
  assert.equal(r.body.ten_tuyen, 'Tuyen A')
  assert.equal(r.body.phien_ban_hien_tai, 0)
  assert.equal(r.body.tao_boi, nv1.id)
  tuyenA = r.body
  assert.equal((await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'tuyen a' } })).status, 409)
  assert.equal((await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: '' } })).status, 422)
  assert.equal((await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'x', loai_cong_trinh_id: 9999 } })).status, 422)
  assert.equal((await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'x', du_an_id: crypto.randomUUID() } })).status, 422)
  assert.equal((await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'x', la: 1 } })).status, 422, 'truong la bi tu choi')
})

let v1
test('luu lan dau: phien ban 1, hien truong, GPS, gio server, chieu dai cap = chieu dai tuyen x n', async () => {
  const cot = [cotMau(1), cotMau(2), cotMau(3, { chieu_cao_m: '6.5m', ma_vat_tu: 'ms_m' })]
  const gioMay = '2020-01-02T03:04:05+07:00'
  const r = await H.goi('POST', `/tuyen/${tuyenA.id}/luu`, {
    token: nv1.token,
    body: { cot, ma_yeu_cau: crypto.randomUUID(), phien_ban_co_so: 0, thoi_gian_thiet_bi: gioMay, gps },
  })
  assert.equal(r.status, 201, JSON.stringify(r.body))
  v1 = r.body.phien_ban
  assert.equal(v1.so_phien_ban, 1)
  assert.equal(v1.loai_luu, 'hien_truong')
  assert.equal(v1.so_cot, 3)
  assert.equal(v1.gps_kinh_do, 105.8)
  assert.equal(v1.gps_do_chinh_xac_m, 4.5)
  assert.equal(new Date(v1.thoi_gian_thiet_bi).toISOString(), '2020-01-01T20:04:05.000Z')
  assert.ok(Math.abs(Date.now() - new Date(v1.thoi_gian_server).getTime()) < 60000, 'gio server do CSDL dong dau, khong theo gio may')
  assert.equal(v1.so_cot_them, 3)
  const t = r.body.tuyen
  assert.ok(t.chieu_dai_tuyen_m > 150 && t.chieu_dai_tuyen_m < 300, `chieu dai ${t.chieu_dai_tuyen_m}`)
  assert.equal(t.he_so_n, 1.5)
  assert.equal(t.chieu_dai_cap_m, Math.round(t.chieu_dai_tuyen_m * 1.5 * 100) / 100)
  assert.equal(t.phien_ban_hien_tai, 1)

  const ct = await H.goi('GET', `/tuyen/${tuyenA.id}`, { token: nv1.token, query: { kem: 'cot' } })
  assert.equal(ct.body.cot.length, 3)
  assert.deepEqual(ct.body.cot.map(c => c.thu_tu), [1, 2, 3])
  assert.equal(ct.body.cot[0].hien_trang_cot, 'tm', 'hien trang suy tu ma loai cot (R6)')
  assert.equal(ct.body.cot[2].chieu_cao_m, 6.5, '"6.5m" duoc doc thanh 6.5 (R7)')
  assert.equal(ct.body.cot[2].hien_trang_vat_tu, 'tm')
  // may chu khong tu gan ma mac dinh nao (loi "bam cot ra S2"): truong khong gui thi la rong
  for (const c of ct.body.cot.slice(0, 2)) {
    for (const t of ['ma_vat_tu', 'hien_trang_vat_tu', 'ma_be_cap', 'ma_phu_kien', 'chung_loai_odf', 'chung_loai_splitter', 'adss_gong', 'ac_de_u']) {
      assert.equal(c[t], null, `${c.ten_cot}.${t}`)
    }
  }
})

test('luu lai cung ma_yeu_cau: tra phien ban cu, khong tao moi', async () => {
  const ma = crypto.randomUUID()
  const a = await H.goi('POST', `/tuyen/${tuyenA.id}/luu`, { token: nv1.token, body: { ma_yeu_cau: ma, ghi_chu: 'lan 1' } })
  assert.equal(a.status, 201)
  const b = await H.goi('POST', `/tuyen/${tuyenA.id}/luu`, { token: nv1.token, body: { ma_yeu_cau: ma, ghi_chu: 'lan 1' } })
  assert.equal(b.status, 200)
  assert.equal(b.body.trung_lap, true)
  assert.equal(b.body.phien_ban.so_phien_ban, a.body.phien_ban.so_phien_ban)
  const ds = await H.goi('GET', `/tuyen/${tuyenA.id}/phien-ban`, { token: nv1.token })
  assert.equal(ds.body.length, 2)
})

test('hai lan luu dong thoi: phien ban lien tuc, khong trung, khong mat', async () => {
  const t = (await H.goi('POST', '/tuyen', { token: nv2.token, body: { ten_tuyen: 'Dong thoi' } })).body
  const kq = await Promise.all(Array.from({ length: 6 }, (_, i) =>
    H.goi('POST', `/tuyen/${t.id}/luu`, { token: nv2.token, body: { ma_yeu_cau: crypto.randomUUID(), ghi_chu: `l${i}` } })))
  assert.ok(kq.every(r => r.status === 201), kq.map(r => r.status).join())
  const so = kq.map(r => r.body.phien_ban.so_phien_ban).sort((a, b) => a - b)
  assert.deepEqual(so, [1, 2, 3, 4, 5, 6])
})

test('xung dot phien ban: co so cu bi 409, ghi_de thi duoc; thong ke them/sua/xoa', async () => {
  const cu = await H.goi('POST', `/tuyen/${tuyenA.id}/luu`, { token: nv1.token, body: { phien_ban_co_so: 1, cot: [cotMau(1)] } })
  assert.equal(cu.status, 409)
  assert.equal(cu.body.loi.ma, 'XUNG_DOT_PHIEN_BAN')
  assert.equal(cu.body.loi.chi_tiet.phien_ban_hien_tai, 2)

  const hienTai = (await H.goi('GET', `/tuyen/${tuyenA.id}`, { token: nv1.token, query: { kem: 'cot' } })).body.cot
  // giu C1 nguyen (co id), sua C2 (doi chieu cao), bo C3, them C4 moi
  const cot = [
    hienTai[0],
    { ...hienTai[1], chieu_cao_m: 10 },
    cotMau(4),
  ].map(c => { const { tao_luc, cap_nhat_luc, xoa_luc, tao_boi, ...con } = c; return con })
  const r = await H.goi('POST', `/tuyen/${tuyenA.id}/luu`, { token: nv1.token, body: { phien_ban_co_so: 2, cot } })
  assert.equal(r.status, 201, JSON.stringify(r.body))
  const pb = r.body.phien_ban
  assert.equal(pb.so_phien_ban, 3)
  assert.deepEqual([pb.so_cot_them, pb.so_cot_sua, pb.so_cot_xoa], [1, 1, 1])
  assert.equal(r.body.tuyen.so_cot, 3)

  const sosanh = await H.goi('GET', `/tuyen/${tuyenA.id}/phien-ban/so-sanh`, { token: nv1.token, query: { tu: 1, den: 3 } })
  assert.equal(sosanh.status, 200)
  assert.equal(sosanh.body.them.length, 1)
  assert.equal(sosanh.body.xoa.length, 1)
  assert.deepEqual(sosanh.body.sua[0].truong, ['chieu_cao_m'])
  assert.equal((await H.goi('GET', `/tuyen/${tuyenA.id}/phien-ban/so-sanh`, { token: nv1.token, query: { tu: 1, den: 99 } })).status, 404)

  const ghiDe = await H.goi('POST', `/tuyen/${tuyenA.id}/luu`, { token: nv1.token, body: { phien_ban_co_so: 1, ghi_de: true } })
  assert.equal(ghiDe.status, 201)
})

test('xem phien ban cu: du lieu cot luc luu khong doi khi cot hien tai bi sua', async () => {
  const p1 = await H.goi('GET', `/tuyen/${tuyenA.id}/phien-ban/1`, { token: nv1.token })
  assert.equal(p1.status, 200)
  assert.equal(p1.body.du_lieu_cot.length, 3)
  assert.equal(p1.body.hinh_dang.cot.length, 3)
  assert.ok(p1.body.du_lieu_cot.some(c => c.ten_cot === 'C3' && c.chieu_cao_m === 6.5))
  assert.equal(p1.body.tai_khoan_ho_ten, 'Ten nv1')
  assert.equal((await H.goi('GET', `/tuyen/${tuyenA.id}/phien-ban/0`, { token: nv1.token })).status, 400)
  assert.equal((await H.goi('GET', `/tuyen/${tuyenA.id}/phien-ban/77`, { token: nv1.token })).status, 404)
})

test('kiem tra du lieu cot theo danh muc', async () => {
  const t = (await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'Kiem tra' } })).body
  const thu = async (cot, mong, ghiChu) => {
    const r = await H.goi('POST', `/tuyen/${t.id}/luu`, { token: nv1.token, body: { cot: [cot] } })
    assert.equal(r.status, mong, `${ghiChu}: ${JSON.stringify(r.body).slice(0, 200)}`)
    return r
  }
  await thu(cotMau(1, { chieu_cao_m: 9.9 }), 422, 'chieu cao ngoai danh muc')
  await thu(cotMau(1, { chieu_cao_m: 'cao' }), 422, 'chieu cao khong phai so')
  await thu(cotMau(1, { ma_loai_cot: 'khong_co' }), 422, 'ma loai cot la')
  await thu(cotMau(1, { hien_trang_cot: 'cs' }), 422, 'hien trang khong khop ma')
  await thu(cotMau(1, { ma_vat_tu: 'vat_tu_la' }), 422, 'ma vat tu la')
  await thu(cotMau(1, { adss_gong: 'Đai' }), 422, 'gong khong thuoc danh muc gong (loi D1)')
  await thu(cotMau(1, { adss_gong: 'Gông C1', adss_udj: 'Móc J' }), 201, 'gong va udj hop le')
  await thu(cotMau(1, { kinh_do: 181 }), 422, 'kinh do ngoai khoang')
  await thu(cotMau(1, { vi_do: -91 }), 422, 'vi do ngoai khoang')
  await thu(cotMau(1, { ten_cot: '' }), 422, 'ten cot rong')
  await thu(cotMau(1, { nguon_diem: 'bay' }), 422, 'nguon diem la')
  await thu({ ...cotMau(1), truong_la: 1 }, 422, 'truong la')
  await thu(cotMau(1, { ma_vat_tu: 'ms_cs', hien_trang_vat_tu: 'tm' }), 422, 'vat tu co san ghi hien trang tm')
  await thu(cotMau(1, { ma_vat_tu: 's1_m_s2_cs' }), 201, 'vat tu dung cho ca hai hien trang, de trong')
  const r = await thu(cotMau(1, { ma_loai_cot: 'lt_cs', hien_trang_cot: 'cs', chieu_cao_m: 7, ma_vat_tu: 'ms_cs' }), 201, 'loai cot co san')
  assert.equal(r.body.phien_ban.so_cot, 1)
  const c = (await H.goi('GET', `/tuyen/${t.id}`, { token: nv1.token, query: { kem: 'cot' } })).body.cot[0]
  assert.equal(c.hien_trang_cot, 'cs')
  assert.equal(c.hien_trang_vat_tu, 'cs', 'suy tu ma vat tu')
  const loi = await H.goi('POST', `/tuyen/${t.id}/luu`, { token: nv1.token, body: { cot: [cotMau(1, { chieu_cao_m: 9.9 })] } })
  assert.equal(loi.body.loi.ma, 'DU_LIEU_KHONG_HOP_LE')
  assert.match(JSON.stringify(loi.body.loi.chi_tiet), /cot\[0\]\.chieu_cao_m/)
  // cung id cot gui hai lan trong mot lan luu
  const id = crypto.randomUUID()
  assert.equal((await H.goi('POST', `/tuyen/${t.id}/luu`, { token: nv1.token, body: { cot: [cotMau(1, { id }), cotMau(2, { id })] } })).status, 422)
  // mot loi thi khong luu gi: so cot van la 1
  assert.equal((await H.goi('GET', `/tuyen/${t.id}`, { token: nv1.token })).body.so_cot, 1)
})

test('hoan thien, mo lai, va loai_luu hien truong / chinh sua sau', async () => {
  const t = (await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'Hoan thien' } })).body
  assert.equal((await H.goi('POST', `/tuyen/${t.id}/hoan-thien`, { token: nv1.token, body: {} })).status, 409, 'chua luu lan nao')
  assert.equal((await H.goi('POST', `/tuyen/${t.id}/luu`, { token: nv1.token, body: { cot: [cotMau(1), cotMau(2)] } })).body.phien_ban.loai_luu, 'hien_truong')
  const ht = await H.goi('POST', `/tuyen/${t.id}/hoan-thien`, { token: nv1.token, body: {} })
  assert.equal(ht.status, 200)
  assert.equal(ht.body.trang_thai, 'hoan_thien')
  assert.ok(ht.body.hoan_thien_luc)
  assert.equal((await H.goi('POST', `/tuyen/${t.id}/hoan-thien`, { token: nv1.token, body: {} })).status, 409)
  const dsv = await H.goi('GET', `/tuyen/${t.id}/phien-ban`, { token: nv1.token })
  assert.equal(dsv.body[0].la_ban_hoan_thien, true)

  const sau = await H.goi('POST', `/tuyen/${t.id}/luu`, { token: nv1.token, body: { cot: [cotMau(1)] } })
  assert.equal(sau.body.phien_ban.loai_luu, 'chinh_sua_sau')
  assert.equal((await H.goi('POST', `/tuyen/${t.id}/luu`, { token: nv1.token, body: { loai_luu: 'hien_truong' } })).status, 422)
  const mo = await H.goi('POST', `/tuyen/${t.id}/mo-lai`, { token: nv1.token, body: {} })
  assert.equal(mo.body.trang_thai, 'dang_khao_sat')
  assert.equal((await H.goi('POST', `/tuyen/${t.id}/luu`, { token: nv1.token, body: {} })).body.phien_ban.loai_luu, 'hien_truong')
})

test('pham vi theo cap quan ly: tuyen cua nv1', async () => {
  const xem = (u) => H.goi('GET', `/tuyen/${tuyenA.id}`, { token: u.token })
  assert.equal((await xem(nv1)).status, 200)
  assert.equal((await xem(ql1)).status, 200, 'quan ly truc tiep')
  assert.equal((await xem(ql2)).status, 200, 'quan ly cap tren')
  assert.equal((await xem(admin)).status, 200)
  assert.equal((await xem(nv2)).status, 404, 'dong nghiep cung nhom')
  assert.equal((await xem(nv3)).status, 404, 'nhanh khac')
  assert.equal((await xem(ql1b)).status, 404, 'quan ly nhanh khac')
  assert.equal((await xem(kt)).status, 403, 'ke toan khong co tuyen.xem')

  const dem = async (u) => (await H.goi('GET', '/tuyen', { token: u.token })).body.phan_trang.tong
  const tatCa = await dem(admin)
  assert.equal(await dem(nv3), 0)
  assert.equal(await dem(ql1b), 0)
  assert.equal(await dem(nv1) + await dem(nv2), await dem(ql1), 'quan ly thay dung hai nhan vien cua minh')
  assert.equal(await dem(ql2), tatCa)
  // loc theo nhan vien ngoai pham vi
  assert.equal((await H.goi('GET', '/tuyen', { token: nv1.token, query: { tao_boi: nv2.id } })).status, 403)
  assert.equal((await H.goi('GET', '/tuyen', { token: ql1.token, query: { tao_boi: nv2.id } })).status, 200)
  assert.equal((await H.goi('GET', '/tuyen', { token: ql1.token, query: { tao_boi: nv3.id } })).status, 403)

  // khong ghi duoc vao tuyen ngoai pham vi
  assert.equal((await H.goi('POST', `/tuyen/${tuyenA.id}/luu`, { token: nv2.token, body: {} })).status, 404)
  assert.equal((await H.goi('PATCH', `/tuyen/${tuyenA.id}`, { token: nv3.token, body: { ten_tuyen: 'hack' } })).status, 404)
  assert.equal((await H.goi('GET', `/tuyen/${tuyenA.id}/phien-ban`, { token: nv2.token })).status, 404)
  // quan ly luu ho nhan vien: duoc, ghi dung nguoi luu
  const luuBoiQuanLy = await H.goi('POST', `/tuyen/${tuyenA.id}/luu`, { token: ql1.token, body: { ghi_chu: 'ql sua ho' } })
  assert.equal(luuBoiQuanLy.status, 201)
  assert.equal(luuBoiQuanLy.body.phien_ban.tai_khoan_id, ql1.id)
  // xoa: nhan vien khong co quyen, quan ly co
  assert.equal((await H.goi('DELETE', `/tuyen/${tuyenA.id}`, { token: nv1.token })).status, 403)
})

test('thao tac cot don le: them, chen giua, sua, xoa, sap xep; tinh lai chieu dai', async () => {
  const t = (await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'Cot don le', loai_cong_trinh_id: loaiCT.id } })).body
  const them = (cot) => H.goi('POST', `/tuyen/${t.id}/cot`, { token: nv1.token, body: cot })
  const a = await them(cotMau(1, { nguon_diem: 'cham_ban_do' }))
  assert.equal(a.status, 201)
  assert.equal(a.body.tuyen.so_cot, 1)
  const b = await them(cotMau(3))
  const giua = await them(cotMau(2, { vi_tri: 2, nguon_diem: 'chen_giua', thoi_gian_thiet_bi: '2025-05-05T10:00:00+07:00', gps }))
  assert.equal(giua.status, 201)
  const ds = (await H.goi('GET', `/tuyen/${t.id}`, { token: nv1.token, query: { kem: 'cot' } })).body
  assert.deepEqual(ds.cot.map(c => c.ten_cot), ['C1', 'C2', 'C3'])
  assert.deepEqual(ds.cot.map(c => c.thu_tu), [1, 2, 3])
  assert.equal(ds.so_cot, 3)
  assert.equal(ds.chieu_dai_cap_m, Math.round(ds.chieu_dai_tuyen_m * 1.5 * 100) / 100)
  assert.equal((await them(cotMau(9, { vi_tri: 9 }))).status, 422)

  const sua = await H.goi('PATCH', `/cot/${b.body.cot.id}`, { token: nv1.token, body: { dia_diem: 'Ngõ 5', nguon_diem: 'keo_tha', kinh_do: 105.9 } })
  assert.equal(sua.status, 200)
  assert.equal(sua.body.cot.dia_diem, 'Ngõ 5')
  assert.notEqual(sua.body.tuyen.chieu_dai_tuyen_m, ds.chieu_dai_tuyen_m, 'doi toa do thi tinh lai chieu dai')
  assert.equal((await H.goi('PATCH', `/cot/${b.body.cot.id}`, { token: nv1.token, body: { chieu_cao_m: 3 } })).status, 422)
  assert.equal((await H.goi('PATCH', `/cot/${b.body.cot.id}`, { token: nv2.token, body: { dia_diem: 'x' } })).status, 404)
  assert.equal((await H.goi('PATCH', `/cot/${b.body.cot.id}`, { token: nv1.token, body: {} })).status, 200, 'patch rong khong loi')

  const ids = ds.cot.map(c => c.id)
  const dao = await H.goi('PUT', `/tuyen/${t.id}/cot/thu-tu`, { token: nv1.token, body: { ids: [...ids].reverse() } })
  assert.equal(dao.status, 200)
  const sau = (await H.goi('GET', `/tuyen/${t.id}`, { token: nv1.token, query: { kem: 'cot' } })).body.cot
  assert.deepEqual(sau.map(c => c.ten_cot), ['C3', 'C2', 'C1'])
  assert.equal((await H.goi('PUT', `/tuyen/${t.id}/cot/thu-tu`, { token: nv1.token, body: { ids: ids.slice(1) } })).status, 422)
  assert.equal((await H.goi('PUT', `/tuyen/${t.id}/cot/thu-tu`, { token: nv1.token, body: { ids: [ids[0], ids[0], ids[1]] } })).status, 422)

  const xoa = await H.goi('DELETE', `/cot/${ids[1]}`, { token: nv1.token })
  assert.equal(xoa.status, 200)
  assert.equal(xoa.body.tuyen.so_cot, 2)
  const con = (await H.goi('GET', `/tuyen/${t.id}`, { token: nv1.token, query: { kem: 'cot' } })).body.cot
  assert.deepEqual(con.map(c => c.thu_tu), [1, 2], 'danh so lai lien tuc')
  assert.equal((await H.goi('DELETE', `/cot/${ids[1]}`, { token: nv1.token })).status, 404)

  const track = await H.goi('POST', `/tuyen/${t.id}/track`, { token: nv1.token, body: { diem: [{ kinh_do: 105.8, vi_do: 21 }, { kinh_do: 105.81, vi_do: 21.001, do_chinh_xac_m: 3 }] } })
  assert.equal(track.status, 201)
  assert.equal(track.body.tong_so_diem, 2)
  assert.equal((await H.goi('GET', `/tuyen/${t.id}`, { token: nv1.token, query: { kem: 'track,duong' } })).body.track.length, 2)
  assert.equal((await H.goi('GET', `/tuyen/${t.id}`, { token: nv1.token, query: { kem: 'rac' } })).status, 400)

  // nguon diem, gps va gio may nam trong nhat ky
  const nk = await H.goi('GET', '/nhat-ky', { token: nv1.token, query: { tuyen_id: t.id, so_luong: 50 } })
  const ghiChen = nk.body.du_lieu.find(x => x.chi_tiet.su_kien === 'them_cot' && x.nguon_diem === 'chen_giua')
  assert.ok(ghiChen, 'nhat ky co dong them cot chen giua')
  assert.equal(ghiChen.gps_kinh_do, 105.8)
  assert.equal(new Date(ghiChen.thoi_gian_thiet_bi).toISOString(), '2025-05-05T03:00:00.000Z')
  assert.ok(new Date(ghiChen.thoi_gian_server) > new Date('2026-01-01'))
  assert.equal(ghiChen.hanh_dong, 'sua')
})

test('nhat ky theo tai khoan: pham vi, bo loc, phan trang, tu choi tham so sai', async () => {
  const cua = async (u, query) => H.goi('GET', '/nhat-ky', { token: u.token, query })
  const rNv1 = await cua(nv1, {})
  assert.equal(rNv1.status, 200)
  assert.ok(rNv1.body.du_lieu.every(x => x.tai_khoan_id !== nv2.id && x.tai_khoan_id !== nv3.id))
  assert.ok(rNv1.body.du_lieu.some(x => x.hanh_dong === 'tao'))
  assert.ok(rNv1.body.du_lieu.some(x => x.hanh_dong === 'luu' && x.loai_luu === 'hien_truong'))

  assert.equal((await cua(nv1, { tai_khoan_id: nv2.id })).status, 403)
  const ql = await cua(ql1, {})
  const ids = new Set(ql.body.du_lieu.map(x => x.tai_khoan_id))
  assert.ok(ids.has(nv1.id) && ids.has(nv2.id))
  assert.ok(![...ids].includes(nv3.id))
  assert.equal((await cua(ql1, { tai_khoan_id: nv3.id })).status, 403)
  assert.equal((await cua(ql1b, { tai_khoan_id: nv1.id })).status, 403)
  assert.equal((await cua(kt, {})).status, 403)
  const adm = await cua(admin, { tai_khoan_id: nv3.id })
  assert.equal(adm.status, 200)

  const chiLuu = await cua(nv1, { hanh_dong: 'luu', loai_luu: 'chinh_sua_sau' })
  assert.ok(chiLuu.body.du_lieu.every(x => x.hanh_dong === 'luu' && x.loai_luu === 'chinh_sua_sau'))
  const trang = await cua(nv1, { so_luong: 2, trang: 2 })
  assert.equal(trang.body.du_lieu.length, 2)
  assert.equal(trang.body.phan_trang.trang, 2)
  assert.ok(trang.body.phan_trang.tong > 4)
  assert.equal((await cua(nv1, { hanh_dong: 'xoa' })).status, 422)
  assert.equal((await cua(nv1, { tu_ngay: '2026-13-45' })).status, 422)
  assert.equal((await cua(nv1, { tu_ngay: '2026-05-02', den_ngay: '2026-05-01' })).status, 422)
  assert.equal((await cua(nv1, { so_luong: 1000 })).status, 422)
  assert.equal((await cua(nv1, { tai_khoan_id: 'abc' })).status, 422)

  // bo loc ngay theo gio Viet Nam
  const homNay = ngayVN()
  assert.ok((await cua(nv1, { tu_ngay: homNay, den_ngay: homNay })).body.phan_trang.tong > 0)
  assert.equal((await cua(nv1, { den_ngay: '2020-01-01' })).body.phan_trang.tong, 0)
})

test('ung dung ghi su kien gui / dong bo; khong nhan luu/sua tu may khach', async () => {
  const gui = await H.goi('POST', '/nhat-ky', { token: nv1.token, body: { hanh_dong: 'gui', tuyen_id: tuyenA.id, thoi_gian_thiet_bi: '2026-01-01T08:00:00+07:00', gps, chi_tiet: { so_tuyen: 1 } } })
  assert.equal(gui.status, 201)
  assert.ok(gui.body.thoi_gian_server)
  assert.equal((await H.goi('POST', '/nhat-ky', { token: nv1.token, body: { hanh_dong: 'dong_bo' } })).status, 201)
  assert.equal((await H.goi('POST', '/nhat-ky', { token: nv1.token, body: { hanh_dong: 'luu' } })).status, 422)
  assert.equal((await H.goi('POST', '/nhat-ky', { token: nv2.token, body: { hanh_dong: 'gui', tuyen_id: tuyenA.id } })).status, 404, 'khong ghi vao tuyen cua nguoi khac')
  assert.equal((await H.goi('POST', '/nhat-ky', { token: kt.token, body: { hanh_dong: 'gui' } })).status, 403)
  const nk = await H.goi('GET', '/nhat-ky', { token: nv1.token, query: { hanh_dong: 'gui' } })
  assert.equal(nk.body.du_lieu[0].gps_do_chinh_xac_m, 4.5)
})

test('lich su theo nhan vien va ngay: tuyen luu cuoi cung trong ngay', async () => {
  const t1 = (await H.goi('POST', '/tuyen', { token: nv2.token, body: { ten_tuyen: 'Ngay 1' } })).body
  const t2 = (await H.goi('POST', '/tuyen', { token: nv2.token, body: { ten_tuyen: 'Ngay 2' } })).body
  await H.goi('POST', `/tuyen/${t1.id}/luu`, { token: nv2.token, body: { cot: [cotMau(1)] } })
  await H.goi('POST', `/tuyen/${t2.id}/luu`, { token: nv2.token, body: { cot: [cotMau(1)] } })
  await H.goi('POST', `/tuyen/${t1.id}/luu`, { token: nv2.token, body: { cot: [cotMau(1), cotMau(2)] } })
  await new Promise(r => setTimeout(r, 20))
  await H.goi('POST', `/tuyen/${t2.id}/luu`, { token: nv2.token, body: { cot: [cotMau(1)] } })

  const ls = await H.goi('GET', '/lich-su', { token: ql1.token, query: { ngay: ngayVN(), tai_khoan_id: nv2.id } })
  assert.equal(ls.status, 200, JSON.stringify(ls.body))
  assert.equal(ls.body.nhan_vien.length, 1)
  const n = ls.body.nhan_vien[0]
  assert.equal(n.tuyen_cuoi_trong_ngay.ten_tuyen, 'Ngay 2')
  const theoTen = Object.fromEntries(n.tuyen.map(x => [x.ten_tuyen, x]))
  assert.equal(theoTen['Ngay 1'].so_lan_luu, 2)
  assert.equal(theoTen['Ngay 1'].la_tuyen_cuoi_trong_ngay, false)
  assert.equal(theoTen['Ngay 2'].so_lan_luu, 2)
  assert.equal(theoTen['Ngay 2'].la_tuyen_cuoi_trong_ngay, true)

  // ngay khac: rong; thieu ngay: 422; ngoai pham vi: 403; nhan vien chi xem chinh minh
  assert.equal((await H.goi('GET', '/lich-su', { token: ql1.token, query: { ngay: '2020-01-01' } })).body.nhan_vien.length, 0)
  assert.equal((await H.goi('GET', '/lich-su', { token: ql1.token })).status, 422)
  assert.equal((await H.goi('GET', '/lich-su', { token: ql1b.token, query: { ngay: ngayVN(), tai_khoan_id: nv2.id } })).status, 403)
  const rieng = await H.goi('GET', '/lich-su', { token: nv2.token, query: { ngay: ngayVN() } })
  assert.deepEqual(rieng.body.nhan_vien.map(x => x.tai_khoan_id), [nv2.id])
  assert.equal((await H.goi('GET', '/lich-su', { token: kt.token, query: { ngay: ngayVN() } })).status, 403)
  // quan ly thay ca hai nhan vien cua minh trong ngay
  const tatCa = await H.goi('GET', '/lich-su', { token: ql1.token, query: { ngay: ngayVN() } })
  const ten = tatCa.body.nhan_vien.map(x => x.ho_ten)
  assert.ok(ten.includes('Ten nv1') && ten.includes('Ten nv2'))
  assert.ok(!ten.includes('Ten nv3'))
})

test('doi loai cong trinh / he so n: tinh lai chieu dai cap; he so moi chi ap dung o lan luu sau', async () => {
  const t = (await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'He so n' } })).body
  const luu = await H.goi('POST', `/tuyen/${t.id}/luu`, { token: nv1.token, body: { cot: [cotMau(1), cotMau(2)] } })
  assert.equal(luu.body.tuyen.chieu_dai_cap_m, null, 'chua chon loai cong trinh thi chua co chieu dai cap')
  const dat = await H.goi('PATCH', `/tuyen/${t.id}`, { token: nv1.token, body: { loai_cong_trinh_id: loaiCT.id } })
  assert.equal(dat.status, 200)
  const len = dat.body.chieu_dai_tuyen_m
  assert.equal(dat.body.chieu_dai_cap_m, Math.round(len * 1.5 * 100) / 100)

  // cap 2 doi he so n -> tuyen da luu khong tu doi, lan luu ke tiep dung he so moi
  assert.equal((await H.goi('PATCH', `/danh-muc/loai-cong-trinh/${loaiCT.id}`, { token: ql1.token, body: { he_so_n: 2 } })).status, 403)
  assert.equal((await H.goi('PATCH', `/danh-muc/loai-cong-trinh/${loaiCT.id}`, { token: ql2.token, body: { he_so_n: 2 } })).status, 200)
  assert.equal((await H.goi('GET', `/tuyen/${t.id}`, { token: nv1.token })).body.he_so_n, 1.5)
  const sau = await H.goi('POST', `/tuyen/${t.id}/luu`, { token: nv1.token, body: {} })
  assert.equal(sau.body.tuyen.he_so_n, 2)
  assert.equal(sau.body.tuyen.chieu_dai_cap_m, Math.round(len * 2 * 100) / 100)
  assert.equal(sau.body.phien_ban.he_so_n, 2)
  const cu = await H.goi('GET', `/tuyen/${t.id}/phien-ban`, { token: nv1.token })
  assert.deepEqual(cu.body.map(p => p.he_so_n), [2, null], 'phien ban cu giu he so luc luu')

  // tat loai cong trinh: khong chon cho tuyen moi
  assert.equal((await H.goi('PATCH', `/danh-muc/loai-cong-trinh/${loaiCT.id}`, { token: ql2.token, body: { he_so_n: 1.5, hoat_dong: false } })).status, 200)
  assert.equal((await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'Moi', loai_cong_trinh_id: loaiCT.id } })).status, 422)
  assert.equal((await H.goi('POST', `/tuyen/${t.id}/luu`, { token: nv1.token, body: {} })).status, 201, 'tuyen dang dung van luu duoc')
  await H.goi('PATCH', `/danh-muc/loai-cong-trinh/${loaiCT.id}`, { token: ql2.token, body: { hoat_dong: true } })
})

test('du an: tao long nhau, khong tao vong, khong xoa khi con tuyen', async () => {
  const goc = (await H.goi('POST', '/du-an', { token: nv1.token, body: { ten: 'Goc' } })).body
  const con = (await H.goi('POST', '/du-an', { token: nv1.token, body: { ten: 'Con', cha_id: goc.id } })).body
  assert.equal(con.cha_id, goc.id)
  assert.equal((await H.goi('POST', '/du-an', { token: nv2.token, body: { ten: 'Lac', cha_id: goc.id } })).status, 404, 'khong tao duoi du an cua nguoi khac')
  assert.equal((await H.goi('PATCH', `/du-an/${goc.id}`, { token: nv1.token, body: { cha_id: con.id } })).status, 422)
  const t = await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'Trong du an', du_an_id: con.id } })
  assert.equal(t.status, 201)
  assert.equal((await H.goi('DELETE', `/du-an/${con.id}`, { token: ql1.token })).status, 409)
  assert.equal((await H.goi('DELETE', `/du-an/${con.id}`, { token: nv1.token })).status, 403)
  // cung ten tuyen o du an khac thi duoc
  assert.equal((await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'trong du an' } })).status, 201)
  assert.equal((await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'TRONG DU AN', du_an_id: con.id } })).status, 409)
  await H.goi('DELETE', `/tuyen/${t.body.id}`, { token: ql1.token })
  assert.equal((await H.goi('DELETE', `/du-an/${con.id}`, { token: ql1.token })).status, 200)
  assert.equal((await H.goi('DELETE', `/du-an/${goc.id}`, { token: ql1.token })).status, 200)
  assert.equal((await H.goi('GET', `/du-an/${goc.id}`, { token: nv1.token })).status, 404)
  assert.equal((await H.goi('GET', '/du-an', { token: kt.token })).status, 403)
})

test('xoa tuyen: bien mat khoi danh sach, giu phien ban trong CSDL, ten duoc dung lai', async () => {
  const t = (await H.goi('POST', '/tuyen', { token: nv3.token, body: { ten_tuyen: 'Se xoa' } })).body
  await H.goi('POST', `/tuyen/${t.id}/luu`, { token: nv3.token, body: { cot: [cotMau(1)] } })
  assert.equal((await H.goi('DELETE', `/tuyen/${t.id}`, { token: ql1.token })).status, 404, 'quan ly nhanh khac')
  assert.equal((await H.goi('DELETE', `/tuyen/${t.id}`, { token: ql1b.token })).status, 200)
  assert.equal((await H.goi('GET', `/tuyen/${t.id}`, { token: nv3.token })).status, 404)
  assert.equal((await H.goi('POST', `/tuyen/${t.id}/luu`, { token: nv3.token, body: {} })).status, 404)
  const con = (await H.db.query('SELECT count(*)::int AS n FROM tuyen_phien_ban WHERE tuyen_id = $1', [t.id])).rows[0].n
  assert.equal(con, 1)
  assert.equal((await H.goi('POST', '/tuyen', { token: nv3.token, body: { ten_tuyen: 'Se xoa' } })).status, 201)
})
