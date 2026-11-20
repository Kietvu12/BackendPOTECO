'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const ExcelJS = require('exceljs')
const { khoiTao, cotMau } = require('./helpers')

let H
let admin, ql2, ql1, ql1b, nv1, nv2, nv3, kt
let loai, tuyen = {}

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

  loai = (await H.goi('POST', '/danh-muc/loai-cong-trinh', { token: ql2.token, body: { ma: 'NGAM', ten: 'Cáp ngầm', he_so_n: 2 } })).body
  const tao = async (u, ten, nCot, { loaiId, hoanThien } = {}) => {
    const t = (await H.goi('POST', '/tuyen', { token: u.token, body: { ten_tuyen: ten, loai_cong_trinh_id: loaiId } })).body
    const cot = Array.from({ length: nCot }, (_, i) => cotMau(i + 1, { ten_cot: i === 0 ? '=HYPERLINK("http://x")' : `C${i + 1}` }))
    const r = await H.goi('POST', `/tuyen/${t.id}/luu`, { token: u.token, body: { cot, gps: { kinh_do: 105.8, vi_do: 21 } } })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    if (hoanThien) assert.equal((await H.goi('POST', `/tuyen/${t.id}/hoan-thien`, { token: u.token, body: {} })).status, 200)
    return t
  }
  tuyen.a1 = await tao(nv1, 'A1', 4, { loaiId: loai.id, hoanThien: true })
  tuyen.a2 = await tao(nv1, 'A2', 3, { loaiId: loai.id })
  tuyen.b1 = await tao(nv2, 'B1', 5, { hoanThien: true })
  tuyen.c1 = await tao(nv3, 'C1', 2, { loaiId: loai.id, hoanThien: true })
})
test.after(async () => { await H.dong() })

const doc = async (buf) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); return wb }

test('bao cao hoan thien tuyen (III.6): ke toan thay toan he thong, quan ly theo nhanh, nhan vien cua minh', async () => {
  const xem = async (u, query) => (await H.goi('GET', '/bao-cao/hoan-thien-tuyen', { token: u.token, query })).body
  const ten = (b) => b.du_lieu.map(x => x.ten_tuyen).sort()
  assert.deepEqual(ten(await xem(kt)), ['A1', 'B1', 'C1'], 'ke toan thay moi tuyen hoan thien, khong thay tuyen dang khao sat')
  assert.deepEqual(ten(await xem(admin)), ['A1', 'B1', 'C1'])
  assert.deepEqual(ten(await xem(ql2)), ['A1', 'B1'])
  assert.deepEqual(ten(await xem(ql1)), ['A1', 'B1'])
  assert.deepEqual(ten(await xem(ql1b)), ['C1'])
  assert.deepEqual(ten(await xem(nv1)), ['A1'])
  assert.deepEqual(ten(await xem(nv3)), ['C1'])

  const a1 = (await xem(kt)).du_lieu.find(x => x.ten_tuyen === 'A1')
  assert.equal(a1.so_phien_ban, 1)
  assert.ok(a1.luu_dau_luc && a1.hoan_thien_luc && a1.tao_luc)
  assert.ok(new Date(a1.hoan_thien_luc) >= new Date(a1.luu_dau_luc))
  assert.ok(a1.tong_phut_tu_luc_tao >= 0)
  assert.equal(a1.so_cot, 4)

  // loc
  assert.deepEqual(ten(await xem(kt, { tai_khoan_id: nv2.id })), ['B1'])
  assert.deepEqual(ten(await xem(kt, { tu_ngay: '2020-01-01', den_ngay: '2020-12-31' })), [])
  assert.equal((await H.goi('GET', '/bao-cao/hoan-thien-tuyen', { token: ql1.token, query: { tai_khoan_id: nv3.id } })).status, 403)
  assert.equal((await H.goi('GET', '/bao-cao/hoan-thien-tuyen', { token: kt.token, query: { tu_ngay: 'abc' } })).status, 422)

  // dong thoi gian cua mot tuyen: ke toan xem duoc; nhan vien khac thi khong
  const tl = await H.goi('GET', `/bao-cao/hoan-thien-tuyen/${tuyen.c1.id}/track-log`, { token: kt.token })
  assert.equal(tl.status, 200)
  assert.equal(tl.body.phien_ban.length, 1)
  assert.equal(tl.body.phien_ban[0].gps_kinh_do, 105.8)
  assert.ok(tl.body.nhat_ky.some(x => x.hanh_dong === 'luu'))
  assert.equal(tl.body.tuyen.trang_thai, 'hoan_thien')
  assert.equal((await H.goi('GET', `/bao-cao/hoan-thien-tuyen/${tuyen.c1.id}/track-log`, { token: nv1.token })).status, 404)
  assert.equal((await H.goi('GET', `/bao-cao/hoan-thien-tuyen/${tuyen.c1.id}/track-log`, { token: ql1.token })).status, 404)
})

test('thong ke tong quan: dung pham vi, dem dung, chi quan tri thay tai khoan va thiet bi', async () => {
  const xem = async (u) => { const r = await H.goi('GET', '/he-thong/thong-ke', { token: u.token }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body }
  const ad = await xem(admin)
  assert.equal(ad.tuyen.tong, 4)
  assert.equal(ad.tuyen.hoan_thien, 3)
  assert.equal(ad.tuyen.dang_khao_sat, 1)
  assert.ok(ad.tuyen.tong_chieu_dai_tuyen_m > 0)
  assert.equal(ad.hoat_dong_7_ngay.length, 7)
  assert.match(ad.hoat_dong_7_ngay[6].ngay, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(ad.hoat_dong_7_ngay[6].so_lan_luu, 4, 'ca bon lan luu deu trong hom nay')
  assert.equal(ad.hoat_dong_7_ngay[6].so_nhan_vien, 3)
  assert.equal(ad.hoat_dong_7_ngay.slice(0, 6).reduce((s, x) => s + x.so_lan_luu, 0), 0)
  assert.ok(ad.nhat_ky_hom_nay >= 4)
  const dsTk = (await H.goi('GET', '/tai-khoan', { token: admin.token, query: { so_luong: 200 } })).body
  assert.equal(ad.tai_khoan.tong, dsTk.phan_trang.tong, 'khop so tai khoan trong danh sach')
  assert.ok(ad.tai_khoan.tong >= 8 && ad.tai_khoan.hoat_dong <= ad.tai_khoan.tong)
  assert.ok(ad.thiet_bi.tong >= 0)

  assert.equal((await xem(nv1)).tuyen.tong, 2)
  assert.equal((await xem(ql1)).tuyen.tong, 3)
  assert.equal((await xem(ql1b)).tuyen.tong, 1)
  assert.equal((await xem(ql2)).tuyen.tong, 3)
  for (const u of [nv1, ql1, ql2]) {
    const b = await xem(u)
    assert.equal(b.tai_khoan, undefined, 'khong lo so luong tai khoan')
    assert.equal(b.thiet_bi, undefined)
  }
  assert.equal((await H.goi('GET', '/he-thong/thong-ke', { token: kt.token })).status, 403)
})

test('bao cao khoi luong cap (IV.3): chieu dai cap = chieu dai tuyen x n, co tong', async () => {
  const r = (await H.goi('GET', '/bao-cao/khoi-luong-cap', { token: kt.token })).body
  assert.equal(r.phan_trang.tong, 4)
  for (const t of r.du_lieu) {
    if (t.he_so_n === null) assert.equal(t.chieu_dai_cap_m, null, `${t.ten_tuyen} chua co loai cong trinh`)
    else assert.equal(t.chieu_dai_cap_m, Math.round(t.chieu_dai_tuyen_m * t.he_so_n * 100) / 100, t.ten_tuyen)
  }
  const co = r.du_lieu.filter(t => t.chieu_dai_cap_m !== null)
  assert.equal(co.length, 3)
  const tongCap = co.reduce((a, t) => a + t.chieu_dai_cap_m, 0)
  assert.ok(Math.abs(r.tong.chieu_dai_cap_m - tongCap) < 0.011)
  assert.equal(r.tong.so_tuyen, 4)
  assert.equal(r.tong.so_cot, 14)
  assert.equal(r.tong.so_tuyen_chua_co_chieu_dai_cap, 1)

  const nv = (await H.goi('GET', '/bao-cao/khoi-luong-cap', { token: nv1.token })).body
  assert.deepEqual(nv.du_lieu.map(x => x.ten_tuyen).sort(), ['A1', 'A2'])
  const ql = (await H.goi('GET', '/bao-cao/khoi-luong-cap', { token: ql1.token })).body
  assert.equal(ql.phan_trang.tong, 3)
  const loc = (await H.goi('GET', '/bao-cao/khoi-luong-cap', { token: kt.token, query: { loai_cong_trinh_id: loai.id, trang_thai: 'hoan_thien' } })).body
  assert.deepEqual(loc.du_lieu.map(x => x.ten_tuyen).sort(), ['A1', 'C1'])
  assert.equal((await H.goi('GET', '/bao-cao/khoi-luong-cap', { token: kt.token, query: { loai_cong_trinh_id: 'x' } })).status, 422)
  assert.equal((await H.goi('GET', '/bao-cao/khoi-luong-cap', { token: kt.token, query: { trang_thai: 'xong' } })).status, 422)
})

test('xuat Excel khoi luong cap: dong tong, so lieu khop bao cao', async () => {
  const r = await H.goi('GET', '/bao-cao/khoi-luong-cap/excel', { token: kt.token })
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-type'), /spreadsheetml/)
  assert.match(r.headers.get('content-disposition'), /khoi_luong_cap\.xlsx/)
  const wb = await doc(r.body)
  const ws = wb.getWorksheet('Khối lượng cáp')
  assert.ok(ws)
  assert.equal(ws.rowCount, 1 + 4 + 1, 'tieu de + 4 tuyen + dong tong')
  const bc = (await H.goi('GET', '/bao-cao/khoi-luong-cap', { token: kt.token })).body
  const dongTong = ws.getRow(ws.rowCount)
  assert.match(String(dongTong.getCell(1).value), /^Tổng \(4 tuyến\)/)
  assert.equal(dongTong.getCell(8).value, Math.round(bc.tong.chieu_dai_cap_m * 100) / 100)
  assert.equal(dongTong.getCell(6).value, 14)
  assert.equal((await H.goi('GET', '/bao-cao/khoi-luong-cap/excel', { token: admin.token })).status, 200)
})

test('xuat Excel mot tuyen (IV.5): tong hop va danh sach cot; noi dung "=..." khong thanh cong thuc', async () => {
  const r = await H.goi('GET', `/tuyen/${tuyen.a1.id}/excel`, { token: nv1.token })
  assert.equal(r.status, 200)
  const wb = await doc(r.body)
  assert.deepEqual(wb.worksheets.map(w => w.name), ['Tổng hợp', 'Cột'])
  const tong = wb.getWorksheet('Tổng hợp')
  const map = Object.fromEntries(tong.getRows(1, 10).map(row => [row.getCell(1).value, row.getCell(2).value]))
  assert.equal(map['Tên tuyến'], 'A1')
  assert.equal(map['Loại công trình'], 'Cáp ngầm')
  assert.equal(map['Hệ số n'], 2)
  assert.equal(map['Số cột'], 4)
  const tuyenHienTai = (await H.goi('GET', `/tuyen/${tuyen.a1.id}`, { token: nv1.token })).body
  assert.equal(map['Chiều dài tuyến (m)'], tuyenHienTai.chieu_dai_tuyen_m)
  assert.equal(map['Chiều dài cáp (m) = chiều dài tuyến × n'], tuyenHienTai.chieu_dai_cap_m)
  assert.equal(map['Trạng thái'], 'Hoàn thiện')

  const cot = wb.getWorksheet('Cột')
  assert.equal(cot.rowCount, 5)
  const o = cot.getRow(2).getCell(2)
  assert.equal(o.value, '=HYPERLINK("http://x")', 'giu nguyen la van ban')
  assert.equal(o.type, ExcelJS.ValueType.String, 'khong phai cong thuc')
  assert.equal(cot.getRow(2).getCell(8).value, '2lt_tm')
  assert.equal(cot.getRow(2).getCell(7).value, 'Trồng mới')

  assert.equal((await H.goi('GET', `/tuyen/${tuyen.a1.id}/excel`, { token: nv2.token })).status, 404)
  assert.equal((await H.goi('GET', `/tuyen/${tuyen.a1.id}/excel`, { token: ql1.token })).status, 200)
  assert.equal((await H.goi('GET', `/tuyen/${tuyen.a1.id}/excel`, { token: kt.token })).status, 403)
})

test('xuat Excel nhat ky (III.7): chi quan ly tro len, khop so dong da loc', async () => {
  assert.equal((await H.goi('GET', '/nhat-ky/excel', { token: nv1.token })).status, 403)
  assert.equal((await H.goi('GET', '/nhat-ky/excel', { token: kt.token })).status, 403)
  const r = await H.goi('GET', '/nhat-ky/excel', { token: ql1.token, query: { hanh_dong: 'luu' } })
  assert.equal(r.status, 200)
  const ws = (await doc(r.body)).getWorksheet('Nhật ký thao tác')
  const ds = await H.goi('GET', '/nhat-ky', { token: ql1.token, query: { hanh_dong: 'luu', so_luong: 200 } })
  assert.equal(ws.rowCount - 1, ds.body.phan_trang.tong)
  assert.ok(ds.body.phan_trang.tong >= 3, 'ql1 thay luu cua nv1 va nv2')
  const dau = ws.getRow(2)
  assert.equal(dau.getCell(5).value, 'Lưu')
  assert.ok(dau.getCell(1).value instanceof Date)
  assert.equal((await H.goi('GET', '/nhat-ky/excel', { token: ql1.token, query: { tai_khoan_id: nv3.id } })).status, 403)
  assert.equal((await H.goi('GET', '/nhat-ky/excel', { token: ql1.token, query: { tu_ngay: 'xx' } })).status, 422)
  // ten tep co dau, quan ly nhanh khac khong thay nhat ky nhanh nay
  const khac = await H.goi('GET', '/nhat-ky/excel', { token: ql1b.token })
  const ws2 = (await doc(khac.body)).getWorksheet('Nhật ký thao tác')
  assert.ok(ws2.rowCount - 1 < ws.rowCount + 10)
})

test('luu tru nhat ky: don qua han, giu phien ban va lich su theo ngay', async () => {
  const cfg = await H.goi('GET', '/he-thong/cau-hinh', { token: admin.token })
  assert.equal(cfg.body.find(x => x.khoa === 'nhat_ky.luu_tru_ngay').gia_tri, 30)
  assert.equal((await H.goi('GET', '/he-thong/cau-hinh', { token: ql2.token })).status, 403)

  const chen = (ngay) => H.db.query(
    `INSERT INTO nhat_ky_thao_tac (tai_khoan_id, tuyen_id, hanh_dong, thoi_gian_server)
     VALUES ($1, $2, 'sua', now() - make_interval(days => $3)) RETURNING id`, [nv1.id, tuyen.a1.id, ngay])
  const cu = (await chen(45)).rows[0].id
  const vua = (await chen(10)).rows[0].id
  const moi = (await chen(0)).rows[0].id
  const soPhienBan = async () => (await H.db.query('SELECT count(*)::int n FROM tuyen_phien_ban')).rows[0].n
  const truoc = await soPhienBan()
  const con = async (id) => (await H.db.query('SELECT 1 FROM nhat_ky_thao_tac WHERE id = $1', [id])).rowCount

  assert.equal((await H.goi('POST', '/he-thong/don-nhat-ky', { token: ql2.token })).status, 403)
  const don = await H.goi('POST', '/he-thong/don-nhat-ky', { token: admin.token })
  assert.equal(don.status, 200)
  assert.equal(don.body.luu_tru_ngay, 30)
  assert.ok(don.body.so_dong_da_xoa >= 1)
  assert.equal(await con(cu), 0, 'nhat ky 45 ngay bi xoa')
  assert.equal(await con(vua), 1, 'nhat ky 10 ngay con')
  assert.equal(await con(moi), 1)
  assert.equal(await soPhienBan(), truoc, 'phien ban khong bi xoa')

  // doi cau hinh va kiem tra gia tri khong hop le
  for (const gia_tri of [0, -3, 'ba muoi', 4000, 1.5, null]) {
    assert.equal((await H.goi('PUT', '/he-thong/cau-hinh/nhat_ky.luu_tru_ngay', { token: admin.token, body: { gia_tri } })).status, 422, String(gia_tri))
  }
  assert.equal((await H.goi('PUT', '/he-thong/cau-hinh/he_thong.mui_gio', { token: admin.token, body: { gia_tri: 'UTC' } })).status, 404, 'khoa khac chi doc')
  assert.equal((await H.goi('PUT', '/he-thong/cau-hinh/nhat_ky.luu_tru_ngay', { token: admin.token, body: { gia_tri: 7 } })).status, 200)
  await H.goi('POST', '/he-thong/don-nhat-ky', { token: admin.token })
  assert.equal(await con(vua), 0, 'sau khi rut ngan han luu tru, nhat ky 10 ngay bi xoa')
  assert.equal(await con(moi), 1)

  // lich su theo ngay van tra cuu duoc vi lay tu phien ban
  const homNay = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)
  const ls = await H.goi('GET', '/lich-su', { token: ql1.token, query: { ngay: homNay } })
  assert.equal(ls.status, 200)
  assert.ok(ls.body.nhan_vien.length >= 2)
})
