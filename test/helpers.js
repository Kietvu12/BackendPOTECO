'use strict'
/**
 * Khung kiem thu tich hop: moi tep test tao mot CSDL rieng (chay 01..04), khoi dong server
 * that tren cong ngau nhien va goi bang fetch. Can PostgreSQL that:
 *   TEST_ADMIN_URL=postgres://postgres:postgres@localhost:55432/postgres npm test
 */
const crypto = require('crypto')
const path = require('path')
const { Client } = require('pg')

const ADMIN_URL = process.env.TEST_ADMIN_URL || 'postgres://postgres:postgres@localhost:55432/postgres'

async function khoiTao() {
  const ten = `potecotest_${crypto.randomBytes(5).toString('hex')}`
  const admin = new Client({ connectionString: ADMIN_URL })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${ten}`)
  await admin.end()

  const url = new URL(ADMIN_URL)
  url.pathname = '/' + ten
  process.env.DATABASE_URL = url.toString()
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123'
  process.env.DANG_NHAP_SAI_TOI_DA = '3'
  process.env.NODE_ENV = 'test'

  const migrate = require('../db/migrate')
  await migrate.chay({ databaseUrl: process.env.DATABASE_URL, thuMuc: path.join(__dirname, '..', '..', 'docs', 'database'), log: () => {} })

  const db = require('../src/db')
  const matKhau = require('../src/auth/matkhau')
  const { taoApp } = require('../src/app')
  const server = await new Promise(res => { const s = taoApp().listen(0, '127.0.0.1', () => res(s)) })
  const goc = `http://127.0.0.1:${server.address().port}/api/v1`

  const MAT_KHAU = 'Matkhau123'
  const hash = await matKhau.bam(MAT_KHAU)

  /** Tao tai khoan truc tiep trong CSDL. Tra ve { id, ten_dang_nhap, token }. */
  async function taoTaiKhoan(tenDangNhap, vaiTro, quanLyId = null) {
    const r = await db.query(
      `INSERT INTO tai_khoan (ten_dang_nhap, mat_khau_hash, ho_ten, vai_tro_id, quan_ly_id)
       SELECT $1, $2, $3, v.id, $4 FROM vai_tro v WHERE v.ma = $5 RETURNING id`,
      [tenDangNhap, hash, `Ten ${tenDangNhap}`, quanLyId, vaiTro])
    return { id: r.rows[0].id, ten_dang_nhap: tenDangNhap, vai_tro: vaiTro }
  }

  async function goi(method, duongDan, { token, body, query, raw, headers } = {}) {
    let u = goc + duongDan
    if (query) u += '?' + new URLSearchParams(query).toString()
    const h = { ...(headers || {}) }
    if (token) h.Authorization = `Bearer ${token}`
    let noiDung
    if (raw !== undefined) noiDung = raw
    else if (body !== undefined) { h['Content-Type'] = 'application/json'; noiDung = JSON.stringify(body) }
    const r = await fetch(u, { method, headers: h, body: noiDung })
    const loai = r.headers.get('content-type') || ''
    let du_lieu
    if (loai.includes('application/json')) du_lieu = await r.json()
    else if (/^text\/|application\/xml|\+xml|kml/.test(loai)) du_lieu = await r.text()
    else du_lieu = Buffer.from(await r.arrayBuffer())
    return { status: r.status, body: du_lieu, headers: r.headers }
  }

  async function dangNhap(tenDangNhap, extra = {}) {
    const r = await goi('POST', '/auth/dang-nhap', { body: { ten_dang_nhap: tenDangNhap, mat_khau: MAT_KHAU, ...extra } })
    if (r.status !== 200) throw new Error(`Dang nhap ${tenDangNhap} that bai: ${r.status} ${JSON.stringify(r.body)}`)
    return r.body
  }

  /** Tao tai khoan + dang nhap, tra ve { ...tai khoan, token }. */
  async function nguoiDung(tenDangNhap, vaiTro, quanLyId = null) {
    const t = await taoTaiKhoan(tenDangNhap, vaiTro, quanLyId)
    const d = await dangNhap(tenDangNhap)
    return { ...t, token: d.access_token, refresh: d.refresh_token }
  }

  async function dong() {
    await new Promise(res => server.close(res))
    await db.dong()
    const a = new Client({ connectionString: ADMIN_URL })
    await a.connect()
    await a.query(`DROP DATABASE IF EXISTS ${ten} WITH (FORCE)`)
    await a.end()
  }

  return { db, goi, dangNhap, taoTaiKhoan, nguoiDung, dong, MAT_KHAU, goc }
}

/** Cot hop le mau; ghi de bang tham so. */
function cotMau(i, ghiDe = {}) {
  return {
    ten_cot: `C${i}`,
    kinh_do: 105.8 + i * 0.001,
    vi_do: 21.0,
    ma_loai_cot: '2lt_tm',
    chieu_cao_m: 8,
    nguon_diem: 'gps',
    ...ghiDe,
  }
}

module.exports = { khoiTao, cotMau }
