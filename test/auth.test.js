'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { khoiTao } = require('./helpers')

let H
test.before(async () => { H = await khoiTao() })
test.after(async () => { await H.dong() })

test('suc khoe khong can dang nhap', async () => {
  const r = await H.goi('GET', '/suc-khoe')
  assert.equal(r.status, 200)
  assert.equal(r.body.trang_thai, 'ok')
})

test('duong dan khong ton tai tra 404 dang JSON', async () => {
  const r = await H.goi('GET', '/khong-co')
  assert.equal(r.status, 404)
  assert.equal(r.body.loi.ma, 'KHONG_TIM_THAY')
})

test('khong co token -> 401; token rac -> 401', async () => {
  assert.equal((await H.goi('GET', '/tuyen')).status, 401)
  assert.equal((await H.goi('GET', '/tuyen', { token: 'abc.def.ghi' })).status, 401)
})

test('token ky bang thuat toan none bi tu choi', async () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const t = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: '00000000-0000-4000-8000-000000000000', vt: 'quan_tri' })}.`
  assert.equal((await H.goi('GET', '/auth/toi', { token: t })).status, 401)
})

test('dang nhap dung, sai, tai khoan khoa', async () => {
  await H.taoTaiKhoan('an', 'nhan_vien')
  const ok = await H.goi('POST', '/auth/dang-nhap', { body: { ten_dang_nhap: 'AN', mat_khau: H.MAT_KHAU } })
  assert.equal(ok.status, 200, 'ten dang nhap khong phan biet hoa thuong')
  assert.ok(ok.body.access_token && ok.body.refresh_token)
  assert.equal(ok.body.tai_khoan.vai_tro, 'nhan_vien')
  assert.equal(ok.body.quyen['tuyen.xem'], 'B')
  assert.equal(ok.body.quyen['tai_khoan.tao'], undefined)
  assert.equal(ok.body.tai_khoan.mat_khau_hash, undefined)

  const sai = await H.goi('POST', '/auth/dang-nhap', { body: { ten_dang_nhap: 'an', mat_khau: 'saisaisai1' } })
  assert.equal(sai.status, 401)
  const khongCo = await H.goi('POST', '/auth/dang-nhap', { body: { ten_dang_nhap: 'khongco', mat_khau: 'saisaisai1' } })
  assert.equal(khongCo.status, 401)
  assert.equal(khongCo.body.loi.thong_diep, sai.body.loi.thong_diep, 'khong lo viec tai khoan co ton tai hay khong')

  await H.db.query("UPDATE tai_khoan SET hoat_dong = false WHERE ten_dang_nhap = 'an'")
  const khoa = await H.goi('POST', '/auth/dang-nhap', { body: { ten_dang_nhap: 'an', mat_khau: H.MAT_KHAU } })
  assert.equal(khoa.status, 401)
  // token cu cua tai khoan bi khoa cung bi tu choi
  assert.equal((await H.goi('GET', '/auth/toi', { token: ok.body.access_token })).status, 401)
})

test('body dang nhap sai kieu / thieu truong -> 422', async () => {
  const r = await H.goi('POST', '/auth/dang-nhap', { body: { ten_dang_nhap: 'an' } })
  assert.equal(r.status, 422)
  assert.ok(Array.isArray(r.body.loi.chi_tiet))
  const j = await H.goi('POST', '/auth/dang-nhap', { raw: '{rac', headers: { 'Content-Type': 'application/json' } })
  assert.equal(j.status, 400)
})

test('khoa dang nhap sau nhieu lan sai (429), dung van bi khoa', async () => {
  await H.taoTaiKhoan('binh', 'nhan_vien')
  const sai = () => H.goi('POST', '/auth/dang-nhap', { body: { ten_dang_nhap: 'binh', mat_khau: 'saisaisai1' } })
  assert.equal((await sai()).status, 401)
  assert.equal((await sai()).status, 401)
  assert.equal((await sai()).status, 401)
  assert.equal((await sai()).status, 429)
  const dung = await H.goi('POST', '/auth/dang-nhap', { body: { ten_dang_nhap: 'binh', mat_khau: H.MAT_KHAU } })
  assert.equal(dung.status, 429)
})

test('refresh token xoay vong; dung lai token cu thu hoi moi phien', async () => {
  await H.taoTaiKhoan('chi', 'nhan_vien')
  const d = await H.dangNhap('chi')
  const moi = await H.goi('POST', '/auth/lam-moi', { body: { refresh_token: d.refresh_token } })
  assert.equal(moi.status, 200)
  assert.notEqual(moi.body.refresh_token, d.refresh_token)
  assert.equal((await H.goi('GET', '/auth/toi', { token: moi.body.access_token })).status, 200)

  const lai = await H.goi('POST', '/auth/lam-moi', { body: { refresh_token: d.refresh_token } })
  assert.equal(lai.status, 401)
  const sauKhiBiLo = await H.goi('POST', '/auth/lam-moi', { body: { refresh_token: moi.body.refresh_token } })
  assert.equal(sauKhiBiLo.status, 401, 'token moi cung bi thu hoi sau khi phat hien dung lai')

  assert.equal((await H.goi('POST', '/auth/lam-moi', { body: { refresh_token: 'khongphailatoken123' } })).status, 401)
})

test('dang xuat thu hoi refresh token', async () => {
  await H.taoTaiKhoan('dung', 'nhan_vien')
  const d = await H.dangNhap('dung')
  const r = await H.goi('POST', '/auth/dang-xuat', { token: d.access_token, body: { refresh_token: d.refresh_token } })
  assert.equal(r.status, 200)
  assert.equal(r.body.so_phien_thu_hoi, 1)
  assert.equal((await H.goi('POST', '/auth/lam-moi', { body: { refresh_token: d.refresh_token } })).status, 401)
  assert.equal((await H.goi('POST', '/auth/dang-xuat', { token: d.access_token, body: {} })).status, 422)
})

test('doi mat khau: sai mat khau cu, mat khau yeu, thanh cong thu hoi refresh', async () => {
  await H.taoTaiKhoan('em', 'nhan_vien')
  const d = await H.dangNhap('em')
  const t = d.access_token
  assert.equal((await H.goi('POST', '/auth/doi-mat-khau', { token: t, body: { mat_khau_cu: 'sai12345', mat_khau_moi: 'Moi12345' } })).status, 401)
  assert.equal((await H.goi('POST', '/auth/doi-mat-khau', { token: t, body: { mat_khau_cu: H.MAT_KHAU, mat_khau_moi: 'abc' } })).status, 422)
  assert.equal((await H.goi('POST', '/auth/doi-mat-khau', { token: t, body: { mat_khau_cu: H.MAT_KHAU, mat_khau_moi: 'chicochu' } })).status, 422)
  assert.equal((await H.goi('POST', '/auth/doi-mat-khau', { token: t, body: { mat_khau_cu: H.MAT_KHAU, mat_khau_moi: 'Moi12345' } })).status, 200)
  assert.equal((await H.goi('POST', '/auth/lam-moi', { body: { refresh_token: d.refresh_token } })).status, 401)
  const cu = await H.goi('POST', '/auth/dang-nhap', { body: { ten_dang_nhap: 'em', mat_khau: H.MAT_KHAU } })
  assert.equal(cu.status, 401)
  const moi = await H.goi('POST', '/auth/dang-nhap', { body: { ten_dang_nhap: 'em', mat_khau: 'Moi12345' } })
  assert.equal(moi.status, 200)
})

test('thiet bi: dang ky khi dang nhap, gan mot tai khoan, khoa thi token bi tu choi', async () => {
  await H.taoTaiKhoan('phuc', 'nhan_vien')
  await H.taoTaiKhoan('quan', 'nhan_vien')
  await H.taoTaiKhoan('ketoan1', 'ke_toan')
  const admin = await H.nguoiDung('admin', 'quan_tri')

  const d = await H.dangNhap('phuc', { ma_thiet_bi: 'DEV-1', ten_thiet_bi: 'May A' })
  assert.ok(d.thiet_bi_id)
  const ds = await H.goi('GET', '/thiet-bi', { token: d.access_token })
  assert.equal(ds.status, 200)
  assert.equal(ds.body.du_lieu.length, 1)
  assert.equal(ds.body.du_lieu[0].ma_thiet_bi, 'DEV-1')

  // cung tai khoan dang nhap lai tren cung thiet bi: duoc
  await H.dangNhap('phuc', { ma_thiet_bi: 'DEV-1' })
  // tai khoan khac dung thiet bi do: 403
  const khac = await H.goi('POST', '/auth/dang-nhap', { body: { ten_dang_nhap: 'quan', mat_khau: H.MAT_KHAU, ma_thiet_bi: 'DEV-1' } })
  assert.equal(khac.status, 403)
  // ke toan khong duoc dang ky thiet bi
  const kt = await H.goi('POST', '/auth/dang-nhap', { body: { ten_dang_nhap: 'ketoan1', mat_khau: H.MAT_KHAU, ma_thiet_bi: 'DEV-9' } })
  assert.equal(kt.status, 403)

  // quan tri khoa thiet bi: access token va refresh deu bi tu choi
  const khoa = await H.goi('PATCH', `/thiet-bi/${d.thiet_bi_id}`, { token: admin.token, body: { hoat_dong: false } })
  assert.equal(khoa.status, 200)
  assert.equal((await H.goi('GET', '/tuyen', { token: d.access_token })).status, 401)
  assert.equal((await H.goi('POST', '/auth/lam-moi', { body: { refresh_token: d.refresh_token } })).status, 401)
  const lai = await H.goi('POST', '/auth/dang-nhap', { body: { ten_dang_nhap: 'phuc', mat_khau: H.MAT_KHAU, ma_thiet_bi: 'DEV-1' } })
  assert.equal(lai.status, 403)

  // chuyen thiet bi sang tai khoan khac
  const q = (await H.db.query("SELECT id FROM tai_khoan WHERE ten_dang_nhap = 'quan'")).rows[0].id
  const chuyen = await H.goi('PATCH', `/thiet-bi/${d.thiet_bi_id}`, { token: admin.token, body: { hoat_dong: true, tai_khoan_id: q } })
  assert.equal(chuyen.status, 200)
  assert.equal((await H.goi('POST', '/auth/dang-nhap', { body: { ten_dang_nhap: 'quan', mat_khau: H.MAT_KHAU, ma_thiet_bi: 'DEV-1' } })).status, 200)
})

test('quan tri: tao tai khoan, quy tac quan ly, khoa tai khoan thu hoi phien', async () => {
  const admin = await H.nguoiDung('admin2', 'quan_tri')
  const t = admin.token
  const ql2 = await H.goi('POST', '/tai-khoan', { token: t, body: { ten_dang_nhap: 'sep2', mat_khau: H.MAT_KHAU, ho_ten: 'Sep 2', vai_tro: 'quan_ly_cap_2' } })
  assert.equal(ql2.status, 201)
  const ql1 = await H.goi('POST', '/tai-khoan', { token: t, body: { ten_dang_nhap: 'sep1', mat_khau: H.MAT_KHAU, ho_ten: 'Sep 1', vai_tro: 'quan_ly_cap_1', quan_ly_id: ql2.body.id } })
  assert.equal(ql1.status, 201)
  const nv = await H.goi('POST', '/tai-khoan', { token: t, body: { ten_dang_nhap: 'nv1', mat_khau: H.MAT_KHAU, ho_ten: 'NV 1', vai_tro: 'nhan_vien', quan_ly_id: ql1.body.id } })
  assert.equal(nv.status, 201)
  // quan ly cap thap hon / bang
  const sai = await H.goi('POST', '/tai-khoan', { token: t, body: { ten_dang_nhap: 'nv2', mat_khau: H.MAT_KHAU, ho_ten: 'NV 2', vai_tro: 'quan_ly_cap_1', quan_ly_id: nv.body.id } })
  assert.equal(sai.status, 422)
  // trung ten (khong phan biet hoa thuong)
  const trung = await H.goi('POST', '/tai-khoan', { token: t, body: { ten_dang_nhap: 'NV1', mat_khau: H.MAT_KHAU, ho_ten: 'x', vai_tro: 'nhan_vien' } })
  assert.equal(trung.status, 409)
  // mat khau yeu
  assert.equal((await H.goi('POST', '/tai-khoan', { token: t, body: { ten_dang_nhap: 'nv3', mat_khau: '12345678', ho_ten: 'x', vai_tro: 'nhan_vien' } })).status, 422)
  // vong quan ly: ql2 khong the duoc quan ly boi cap duoi cua chinh no
  assert.equal((await H.goi('PATCH', `/tai-khoan/${ql2.body.id}`, { token: t, body: { quan_ly_id: ql1.body.id } })).status, 422)
  // tu khoa chinh minh
  assert.equal((await H.goi('PATCH', `/tai-khoan/${admin.id}`, { token: t, body: { hoat_dong: false } })).status, 422)

  const dnv = await H.dangNhap('nv1')
  // nhan vien chi thay chinh minh; khong tao duoc tai khoan
  const ds = await H.goi('GET', '/tai-khoan', { token: dnv.access_token })
  assert.equal(ds.body.du_lieu.length, 1)
  assert.equal((await H.goi('POST', '/tai-khoan', { token: dnv.access_token, body: {} })).status, 403)
  // quan ly cap 1 thay nhanh cua minh
  const dq1 = await H.dangNhap('sep1')
  const dsq = await H.goi('GET', '/tai-khoan', { token: dq1.access_token })
  assert.deepEqual(dsq.body.du_lieu.map(x => x.ten_dang_nhap).sort(), ['nv1', 'sep1'])
  // khoa nhan vien -> token bi tu choi, refresh bi thu hoi
  assert.equal((await H.goi('PATCH', `/tai-khoan/${nv.body.id}`, { token: t, body: { hoat_dong: false } })).status, 200)
  assert.equal((await H.goi('GET', '/auth/toi', { token: dnv.access_token })).status, 401)
  assert.equal((await H.goi('POST', '/auth/lam-moi', { body: { refresh_token: dnv.refresh_token } })).status, 401)
  // dat lai mat khau
  assert.equal((await H.goi('POST', `/tai-khoan/${ql1.body.id}/dat-lai-mat-khau`, { token: t, body: { mat_khau_moi: 'Doimoi123' } })).status, 200)
  assert.equal((await H.goi('POST', '/auth/dang-nhap', { body: { ten_dang_nhap: 'sep1', mat_khau: 'Doimoi123' } })).status, 200)
  // id sai dinh dang -> 400, khong phai 500
  assert.equal((await H.goi('GET', '/tai-khoan/abc', { token: t })).status, 400)
})
