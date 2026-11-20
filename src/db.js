'use strict'
const { Pool, types } = require('pg')
const config = require('./config')

// numeric -> number (toa do, chieu dai deu nam trong mien an toan cua double)
types.setTypeParser(1700, v => (v === null ? null : parseFloat(v)))
// bigint (id nhat ky) -> number
types.setTypeParser(20, v => (v === null ? null : parseInt(v, 10)))
// date -> chuoi YYYY-MM-DD (tranh bi lech mui gio khi pg doi sang Date)
types.setTypeParser(1082, v => v)

let pool = null

function layPool() {
  if (!pool) {
    if (!config.databaseUrl) throw new Error('Thieu DATABASE_URL')
    pool = new Pool({ connectionString: config.databaseUrl, max: 10 })
    pool.on('error', err => console.error('Loi ket noi CSDL nhan roi:', err.message))
  }
  return pool
}

async function query(text, params) {
  return layPool().query(text, params)
}

/** Chay fn trong mot giao dich. fn nhan client, tu COMMIT/ROLLBACK. */
async function giaoDich(fn) {
  const client = await layPool().connect()
  try {
    await client.query('BEGIN')
    const kq = await fn(client)
    await client.query('COMMIT')
    return kq
  } catch (e) {
    try { await client.query('ROLLBACK') } catch (_) { /* bo qua */ }
    throw e
  } finally {
    client.release()
  }
}

async function dong() {
  if (pool) {
    const p = pool
    pool = null
    await p.end()
  }
}

module.exports = { query, giaoDich, dong, layPool }
