'use strict'
const crypto = require('crypto')
const { promisify } = require('util')
const scrypt = promisify(crypto.scrypt)

const N = 16384, R = 8, P = 1, KEYLEN = 64

/** Tra ve chuoi dang scrypt$N$r$p$salt$hash (hex). */
async function bam(matKhau) {
  const salt = crypto.randomBytes(16)
  const key = await scrypt(matKhau, salt, KEYLEN, { N, r: R, p: P })
  return ['scrypt', N, R, P, salt.toString('hex'), key.toString('hex')].join('$')
}

/** Dinh dang khac (vi du '!' cua tai khoan he thong) luon tra ve false. */
async function kiemTra(matKhau, luu) {
  if (typeof luu !== 'string') return false
  const p = luu.split('$')
  if (p.length !== 6 || p[0] !== 'scrypt') return false
  const [n, r, par] = [Number(p[1]), Number(p[2]), Number(p[3])]
  if (![n, r, par].every(Number.isInteger)) return false
  const salt = Buffer.from(p[4], 'hex')
  const mong = Buffer.from(p[5], 'hex')
  if (!salt.length || !mong.length) return false
  const key = await scrypt(matKhau, salt, mong.length, { N: n, r, p: par })
  return crypto.timingSafeEqual(key, mong)
}

/** Mat khau toi thieu 8 ky tu, co chu va so. */
function kiemTraDoManh(matKhau) {
  if (typeof matKhau !== 'string' || matKhau.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự'
  if (matKhau.length > 200) return 'Mật khẩu quá dài'
  if (!/[A-Za-z]/.test(matKhau) || !/[0-9]/.test(matKhau)) return 'Mật khẩu phải gồm cả chữ và số'
  return null
}

module.exports = { bam, kiemTra, kiemTraDoManh }
