'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { khoiTao, cotMau } = require('./helpers')

let H, nv1, nv2, ql1
test.before(async () => {
  H = await khoiTao()
  ql1 = await H.nguoiDung('ql1', 'quan_ly_cap_1')
  nv1 = await H.nguoiDung('nv1', 'nhan_vien', ql1.id)
  nv2 = await H.nguoiDung('nv2', 'nhan_vien', ql1.id)
})
test.after(async () => { await H.dong() })

test('tham so tim kiem: chen SQL khong co tac dung, ky tu % _ duoc hieu la ky tu thuong', async () => {
  await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'Tuyen 100%' } })
  await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'Tuyen 1000' } })
  const tim = async (q) => (await H.goi('GET', '/tuyen', { token: nv1.token, query: { q } })).body
  assert.equal((await tim("'; DROP TABLE tuyen; --")).phan_trang.tong, 0)
  assert.equal((await tim('1 OR 1=1')).phan_trang.tong, 0)
  assert.equal((await tim('100%')).phan_trang.tong, 1, '% khong phai ky tu dai dien')
  assert.equal((await tim('Tuyen 10_0')).phan_trang.tong, 0, '_ khong phai ky tu dai dien')
  assert.equal((await tim('tuyen')).phan_trang.tong, 2)
  assert.equal((await H.db.query('SELECT count(*)::int n FROM tuyen')).rows[0].n, 2)
  // tham so khong hop le o cac bo loc
  assert.equal((await H.goi('GET', '/tuyen', { token: nv1.token, query: { du_an_id: "x' OR '1'='1" } })).status >= 400, true)
  assert.notEqual((await H.goi('GET', '/tuyen', { token: nv1.token, query: { trang_thai: "x'" } })).status, 500)
  assert.equal((await H.goi('GET', '/tuyen/1;DROP', { token: nv1.token })).status, 400)
  assert.equal((await H.goi('GET', '/tuyen', { token: nv1.token, query: { so_luong: '-1' } })).status, 422)
  assert.equal((await H.goi('GET', '/tuyen', { token: nv1.token, query: { trang: '0' } })).status, 422)
})

test('noi dung qua lon bi tu choi 413; JSON hong 400; kieu noi dung la van tra loi JSON', async () => {
  const lon = 'a'.repeat(21 * 1024 * 1024)
  const r = await H.goi('POST', '/tuyen', { token: nv1.token, raw: JSON.stringify({ ten_tuyen: lon }), headers: { 'Content-Type': 'application/json' } })
  assert.equal(r.status, 413)
  assert.equal(r.body.loi.ma, 'NOI_DUNG_QUA_LON')
  const hong = await H.goi('POST', '/tuyen', { token: nv1.token, raw: '{"ten_tuyen":', headers: { 'Content-Type': 'application/json' } })
  assert.equal(hong.status, 400)
  const la = await H.goi('POST', '/tuyen', { token: nv1.token, raw: 'ten_tuyen=x', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  assert.equal(la.status, 422, 'khong doc duoc thi coi nhu thieu du lieu, khong loi may chu')
})

test('khong lo thong tin trong loi may chu va header bao mat co mat', async () => {
  const r = await H.goi('GET', '/suc-khoe')
  assert.equal(r.headers.get('x-powered-by'), null)
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(r.headers.get('access-control-allow-origin'), null, 'khong cau hinh CORS thi khong mo cho trinh duyet')
  const u = await H.goi('GET', '/tuyen/00000000-0000-4000-8000-000000000000', { token: nv1.token })
  assert.equal(u.status, 404)
  assert.equal(JSON.stringify(u.body).includes('SELECT'), false)
})

test('khong the doc du lieu cua nguoi khac bang cach doan id (cot, phien ban, track-log, kml, excel, nhat ky)', async () => {
  const t = (await H.goi('POST', '/tuyen', { token: nv1.token, body: { ten_tuyen: 'Rieng' } })).body
  const luu = await H.goi('POST', `/tuyen/${t.id}/luu`, { token: nv1.token, body: { cot: [cotMau(1)] } })
  const cotId = (await H.goi('GET', `/tuyen/${t.id}`, { token: nv1.token, query: { kem: 'cot' } })).body.cot[0].id
  const pbId = luu.body.phien_ban.id
  const thu = async (method, p, body) => (await H.goi(method, p, { token: nv2.token, body })).status
  assert.equal(await thu('GET', `/tuyen/${t.id}`), 404)
  assert.equal(await thu('GET', `/tuyen/${t.id}?kem=cot,duong,track`), 404)
  assert.equal(await thu('GET', `/tuyen/${t.id}/phien-ban/1`), 404)
  assert.equal(await thu('GET', `/tuyen/${t.id}/phien-ban`), 404)
  assert.equal(await thu('GET', `/tuyen/${t.id}/kml`), 404)
  assert.equal(await thu('GET', `/tuyen/${t.id}/excel`), 404)
  assert.equal(await thu('PATCH', `/cot/${cotId}`, { dia_diem: 'hack' }), 404)
  assert.equal(await thu('DELETE', `/cot/${cotId}`), 404)
  assert.equal(await thu('POST', `/tuyen/${t.id}/cot`, cotMau(9)), 404)
  assert.equal(await thu('POST', `/tuyen/${t.id}/track`, { diem: [{ kinh_do: 1, vi_do: 1 }] }), 404)
  assert.equal(await thu('PUT', `/tuyen/${t.id}/cot/thu-tu`, { ids: [cotId] }), 404)
  const nk = await H.goi('GET', '/nhat-ky', { token: nv2.token, query: { tuyen_id: t.id } })
  assert.equal(nk.body.phan_trang.tong, 0)
  // khong ghi duoc cot cua nguoi khac vao tuyen cua minh bang cach gui id cot
  const cua = (await H.goi('POST', '/tuyen', { token: nv2.token, body: { ten_tuyen: 'Cua nv2' } })).body
  const r = await H.goi('POST', `/tuyen/${cua.id}/luu`, { token: nv2.token, body: { cot: [cotMau(1, { id: cotId })] } })
  assert.equal(r.status, 409, 'id cot dang thuoc tuyen khac')
  assert.equal((await H.goi('GET', `/tuyen/${t.id}`, { token: nv1.token, query: { kem: 'cot' } })).body.cot.length, 1)
  void pbId
})
