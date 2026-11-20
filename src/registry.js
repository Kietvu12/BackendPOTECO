'use strict'
/**
 * Noi duy nhat dang ky route. Moi route khai bao:
 *   method, path, quyen, nhom, tom_tat, (tham_so, ket_qua, ghi_chu), xuLy
 *
 * quyen = 'cong_khai'  : khong can dang nhap
 *       = 'dang_nhap'  : chi can dang nhap (thao tac tren chinh minh)
 *       = '<ma quyen>' : phai co quyen trong permissions.js
 *
 * Danh sach route (routes) duoc dung de sinh tai lieu API va de kiem thu
 * rang moi route deu co quyen hop le.
 */
const express = require('express')
const db = require('./db')
const { loi } = require('./errors')
const { xacMinhAccess } = require('./auth/token')
const { QUYEN, phamVi } = require('./permissions')

const router = express.Router()
const routes = []

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete'])

function boc(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}

async function xacThuc(req, _res, next) {
  const h = req.headers.authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  if (!m) throw loi.chuaDangNhap()
  let payload
  try {
    payload = xacMinhAccess(m[1])
  } catch (_) {
    throw loi.chuaDangNhap()
  }
  const kq = await db.query(
    `SELECT t.id, t.ten_dang_nhap, t.ho_ten, t.hoat_dong, t.quan_ly_id,
            v.ma AS vai_tro, v.ten AS vai_tro_ten, v.cap_quan_ly, v.la_ke_toan
       FROM tai_khoan t JOIN vai_tro v ON v.id = t.vai_tro_id
      WHERE t.id = $1`, [payload.sub])
  const u = kq.rows[0]
  if (!u || !u.hoat_dong) throw loi.chuaDangNhap('Tài khoản không tồn tại hoặc đã bị khóa')
  if (payload.tb) {
    const tb = await db.query(
      'SELECT hoat_dong, het_han_luc FROM thiet_bi WHERE id = $1 AND tai_khoan_id = $2',
      [payload.tb, u.id])
    const d = tb.rows[0]
    if (!d || !d.hoat_dong || (d.het_han_luc && d.het_han_luc < new Date())) {
      throw loi.chuaDangNhap('Thiết bị đã bị khóa hoặc hết hạn')
    }
  }
  req.user = u
  req.thietBiId = payload.tb || null
  next()
}

function kiemTraQuyen(quyen) {
  return (req, _res, next) => {
    const pv = phamVi(req.user.vai_tro, quyen)
    if (!pv) throw loi.khongCoQuyen()
    req.pham_vi = pv
    next()
  }
}

function dang(meta) {
  if (!METHODS.has(meta.method)) throw new Error(`Method sai: ${meta.method}`)
  if (!meta.path || !meta.xuLy || !meta.tom_tat || !meta.nhom) {
    throw new Error(`Route thieu truong bat buoc: ${meta.method} ${meta.path}`)
  }
  const q = meta.quyen
  if (q !== 'cong_khai' && q !== 'dang_nhap' && !QUYEN[q]) {
    throw new Error(`Route ${meta.method} ${meta.path} dung quyen khong ton tai: ${q}`)
  }
  if (routes.some(r => r.method === meta.method && r.path === meta.path)) {
    throw new Error(`Route trung: ${meta.method} ${meta.path}`)
  }
  routes.push(meta)
  const mw = []
  if (q !== 'cong_khai') mw.push(boc(xacThuc))
  if (QUYEN[q]) mw.push(kiemTraQuyen(q))
  router[meta.method](meta.path, ...mw, boc(meta.xuLy))
}

module.exports = { router, routes, dang, boc }
