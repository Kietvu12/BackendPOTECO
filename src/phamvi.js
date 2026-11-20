'use strict'
const db = require('./db')

/**
 * Danh sach id tai khoan nam trong pham vi.
 *   'T' -> null (khong loc)
 *   'B' -> [user.id]
 *   'C' -> ban than + moi cap duoi theo quan_ly_id
 * Ket qua duoc nho trong req de mot yeu cau chi truy van mot lan.
 */
async function idTrongPham(req, phamVi, client) {
  if (phamVi === 'T') return null
  if (phamVi === 'B') return [req.user.id]
  req._cayCache = req._cayCache || {}
  if (!req._cayCache[req.user.id]) {
    const q = (client || db)
    const kq = await q.query(
      `WITH RECURSIVE cay AS (
         SELECT id FROM tai_khoan WHERE id = $1
         UNION
         SELECT t.id FROM tai_khoan t JOIN cay c ON t.quan_ly_id = c.id
       )
       SELECT id FROM cay`, [req.user.id])
    req._cayCache[req.user.id] = kq.rows.map(r => r.id)
  }
  return req._cayCache[req.user.id]
}

/** ids = null nghia la khong gioi han. */
function trongPham(ids, chuSoHuuId) {
  return ids === null || ids.includes(chuSoHuuId)
}

module.exports = { idTrongPham, trongPham }
