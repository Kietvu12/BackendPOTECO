'use strict'
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const config = require('../config')

function taoAccess({ id, vai_tro }, thietBiId) {
  return jwt.sign(
    { sub: id, vt: vai_tro, tb: thietBiId || undefined },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: config.jwtTtlGiay }
  )
}

/** Tra ve payload hoac nem loi. Chi nhan HS256. */
function xacMinhAccess(token) {
  return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] })
}

function taoRefresh() {
  const token = crypto.randomBytes(48).toString('base64url')
  return { token, maBam: bamRefresh(token) }
}

function bamRefresh(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

module.exports = { taoAccess, xacMinhAccess, taoRefresh, bamRefresh }
