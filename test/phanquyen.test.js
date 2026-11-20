'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const { khoiTao } = require('./helpers')
const { VAI_TRO, QUYEN, phamVi } = require('../src/permissions')
const { routes } = require('../src/routes')

let H
const nguoi = {}
test.before(async () => {
  H = await khoiTao()
  for (const v of VAI_TRO) nguoi[v.ma] = await H.nguoiDung(`u_${v.ma}`, v.ma)
})
test.after(async () => { await H.dong() })

const THAM_SO = { ':so': '1', ':loai': 'loai-cot', ':nhom': 'treo_neo', ':ma': 'x', ':khoa': 'x' }
function duongDan(p) {
  return p.replace(/:[a-z]+/g, m => THAM_SO[m] || crypto.randomUUID())
}

test('ma tran phan quyen ap dung dung cho moi route x moi vai tro', async () => {
  const loi = []
  let so = 0
  for (const r of routes) {
    if (r.quyen === 'cong_khai') continue
    for (const v of VAI_TRO) {
      const body = ['post', 'put', 'patch'].includes(r.method) ? {} : undefined
      const kq = await H.goi(r.method.toUpperCase(), duongDan(r.path), { token: nguoi[v.ma].token, body })
      so++
      const duoc = r.quyen === 'dang_nhap' || phamVi(v.ma, r.quyen) !== null
      const nhan = `${r.method.toUpperCase()} ${r.path} [${v.ma}] -> ${kq.status}`
      if (!duoc && kq.status !== 403) loi.push(`${nhan} (phai 403)`)
      if (duoc && (kq.status === 401 || kq.status === 403 || kq.status >= 500)) loi.push(`${nhan} (phai duoc phep va khong loi may chu)`)
    }
  }
  assert.deepEqual(loi, [])
  assert.ok(so > 200, `da kiem ${so} to hop`)
})

test('moi route tru cong khai deu doi dang nhap (401 khi khong co token)', async () => {
  const sai = []
  for (const r of routes) {
    if (r.quyen === 'cong_khai') continue
    const kq = await H.goi(r.method.toUpperCase(), duongDan(r.path), { body: ['post', 'put', 'patch'].includes(r.method) ? {} : undefined })
    if (kq.status !== 401) sai.push(`${r.method} ${r.path} -> ${kq.status}`)
  }
  assert.deepEqual(sai, [])
})

test('moi quyen trong ma tran duoc it nhat mot route dung; khong quyen mo coi', () => {
  const dung = new Set(routes.map(r => r.quyen))
  const moCoi = Object.keys(QUYEN).filter(q => !dung.has(q))
  assert.deepEqual(moCoi, [])
})

test('moi route co mo ta day du de sinh tai lieu', () => {
  for (const r of routes) {
    assert.ok(r.tom_tat && r.tom_tat.length > 5, `${r.method} ${r.path} thieu tom_tat`)
    assert.ok(r.nhom, `${r.method} ${r.path} thieu nhom`)
  }
  // khong co hai route trung (method, path)
  const khoa = routes.map(r => `${r.method} ${r.path}`)
  assert.equal(new Set(khoa).size, khoa.length)
})

test('ma tran phan quyen: cac quy tac nghiep vu chu chot', () => {
  const pv = phamVi
  // III.6: ke toan xem track log hoan thien tuyen cua toan he thong, nhung khong xem du lieu tuyen thang
  assert.equal(pv('ke_toan', 'bao_cao.hoan_thien_tuyen'), 'T')
  assert.equal(pv('ke_toan', 'tuyen.xem'), null)
  assert.equal(pv('ke_toan', 'nhat_ky.xem'), null)
  // III.5, III.1: phan quyen theo cap quan ly
  assert.equal(pv('nhan_vien', 'nhat_ky.xem'), 'B')
  assert.equal(pv('quan_ly_cap_1', 'nhat_ky.xem'), 'C')
  assert.equal(pv('quan_ly_cap_2', 'lich_su.xem'), 'C')
  // III.7: xuat nhat ky chi quan ly tro len
  assert.equal(pv('nhan_vien', 'nhat_ky.xuat_excel'), null)
  assert.equal(pv('quan_ly_cap_1', 'nhat_ky.xuat_excel'), 'C')
  // IV.2: chi quan ly cap 2 tro len thiet lap loai cong trinh va he so n
  assert.equal(pv('nhan_vien', 'danh_muc.sua_loai_cong_trinh'), null)
  assert.equal(pv('quan_ly_cap_1', 'danh_muc.sua_loai_cong_trinh'), null)
  assert.equal(pv('quan_ly_cap_2', 'danh_muc.sua_loai_cong_trinh'), 'T')
  // tai khoan va he thong: chi quan tri
  for (const q of ['tai_khoan.tao', 'tai_khoan.sua', 'he_thong.cau_hinh_sua', 'danh_muc.sua', 'thiet_bi.quan_ly']) {
    for (const v of VAI_TRO.filter(x => x.ma !== 'quan_tri')) assert.equal(pv(v.ma, q), null, `${v.ma} ${q}`)
    assert.equal(pv('quan_tri', q), 'T')
  }
  // quan tri khong bi han che pham vi o du lieu nghiep vu
  assert.equal(pv('quan_tri', 'tuyen.xem'), 'T')
})
