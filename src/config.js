'use strict'
require('dotenv').config()

const laMoiTruongThat = process.env.NODE_ENV === 'production'

function bat_buoc(ten) {
  const v = process.env[ten]
  if (!v) throw new Error(`Thieu bien moi truong ${ten}`)
  return v
}

const so = (ten, macDinh) => {
  const v = process.env[ten]
  if (v === undefined || v === '') return macDinh
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`Bien moi truong ${ten} khong phai so`)
  return n
}

const jwtSecret = process.env.JWT_SECRET || ''
if (laMoiTruongThat && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET phai co it nhat 32 ky tu o moi truong production')
}

module.exports = {
  laMoiTruongThat,
  port: so('PORT', 4000),
  get databaseUrl() { return process.env.DATABASE_URL || '' },
  jwtSecret: jwtSecret || 'chi-dung-khi-phat-trien-khong-dung-o-production',
  jwtTtlGiay: so('JWT_TTL_GIAY', 3600),
  refreshTtlNgay: so('REFRESH_TTL_NGAY', 30),
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  trustProxy: process.env.TRUST_PROXY || '',
  donNhatKyTuDong: process.env.DON_NHAT_KY_TU_DONG === '1',
  dangNhapSaiToiDa: so('DANG_NHAP_SAI_TOI_DA', 5),
  dangNhapKhoaPhut: so('DANG_NHAP_KHOA_PHUT', 15),
  batBuoc: bat_buoc,
}
