'use strict'
/**
 * Tao tai khoan tu dong lenh (de tao quan tri dau tien).
 *   MAT_KHAU=... node scripts/tao-tai-khoan.js <ten_dang_nhap> "<ho ten>" <vai_tro> [ten_dang_nhap_quan_ly]
 * Khong co MAT_KHAU: sinh ngau nhien va in ra mot lan. Khong nhan mat khau qua doi so (tranh lo trong danh sach tien trinh).
 */
const crypto = require('crypto')
const db = require('../src/db')
const matKhau = require('../src/auth/matkhau')
const { VAI_TRO } = require('../src/permissions')

async function main() {
  const [tenDangNhap, hoTen, vaiTro, quanLy] = process.argv.slice(2)
  if (!tenDangNhap || !hoTen || !vaiTro) {
    console.error('Cach dung: MAT_KHAU=... node scripts/tao-tai-khoan.js <ten_dang_nhap> "<ho ten>" <vai_tro> [quan_ly]')
    console.error('Vai tro: ' + VAI_TRO.map(v => v.ma).join(', '))
    process.exit(2)
  }
  if (!VAI_TRO.some(v => v.ma === vaiTro)) { console.error(`Vai tro khong hop le: ${vaiTro}`); process.exit(2) }
  if (!/^[A-Za-z0-9._-]{3,60}$/.test(tenDangNhap)) { console.error('Ten dang nhap: 3-60 ky tu gom chu, so, . _ -'); process.exit(2) }

  let mk = process.env.MAT_KHAU
  const sinh = !mk
  if (sinh) mk = crypto.randomBytes(9).toString('base64url') + 'a1'
  const yeu = matKhau.kiemTraDoManh(mk)
  if (yeu) { console.error(yeu); process.exit(2) }

  const hash = await matKhau.bam(mk)
  await db.giaoDich(async c => {
    const v = (await c.query('SELECT id FROM vai_tro WHERE ma = $1', [vaiTro])).rows[0]
    if (!v) throw new Error(`Chua co vai tro ${vaiTro} trong CSDL. Da chay db:migrate chua?`)
    let ql = null
    if (quanLy) {
      ql = (await c.query('SELECT id FROM tai_khoan WHERE lower(ten_dang_nhap) = lower($1)', [quanLy])).rows[0]
      if (!ql) throw new Error(`Khong tim thay quan ly ${quanLy}`)
      ql = ql.id
    }
    await c.query(
      'INSERT INTO tai_khoan (ten_dang_nhap, mat_khau_hash, ho_ten, vai_tro_id, quan_ly_id) VALUES ($1,$2,$3,$4,$5)',
      [tenDangNhap, hash, hoTen, v.id, ql])
  })
  console.log(`Da tao tai khoan ${tenDangNhap} (${vaiTro}).`)
  if (sinh) console.log(`Mat khau (chi hien mot lan): ${mk}`)
}

main().then(() => db.dong()).catch(async e => {
  console.error(e.code === '23505' ? 'Ten dang nhap da ton tai' : e.message)
  await db.dong()
  process.exit(1)
})
