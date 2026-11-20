'use strict'
/**
 * Chay cac script SQL trong docs/database theo thu tu ten tep (01_, 02_, ...).
 * Moi tep chi chay mot lan; ten tep da chay duoc ghi trong bang schema_migrations.
 *
 *   npm run db:migrate
 *   SQL_DIR=... DATABASE_URL=... node db/migrate.js
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const THU_MUC_MAC_DINH = path.resolve(__dirname, '..', '..', 'docs', 'database')

async function chay({ databaseUrl, thuMuc = THU_MUC_MAC_DINH, log = console.log } = {}) {
  if (!databaseUrl) throw new Error('Thieu DATABASE_URL')
  const tepSql = fs.readdirSync(thuMuc).filter(f => /^\d{2}_.*\.sql$/.test(f)).sort()
  if (!tepSql.length) throw new Error(`Khong co tep SQL trong ${thuMuc}`)

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         ten      text PRIMARY KEY,
         chay_luc timestamptz NOT NULL DEFAULT now())`)
    const daChay = new Set((await client.query('SELECT ten FROM schema_migrations')).rows.map(r => r.ten))
    const vuaChay = []
    for (const tep of tepSql) {
      if (daChay.has(tep)) { log(`bo qua  ${tep} (da chay)`); continue }
      const noiDung = fs.readFileSync(path.join(thuMuc, tep), 'utf8').replace(/^\uFEFF/, '')
      log(`dang chay ${tep}`)
      try {
        await client.query(noiDung)
      } catch (e) {
        try { await client.query('ROLLBACK') } catch (_) { /* bo qua */ }
        throw new Error(`Loi khi chay ${tep}: ${e.message}`)
      }
      await client.query('INSERT INTO schema_migrations (ten) VALUES ($1)', [tep])
      vuaChay.push(tep)
    }
    return vuaChay
  } finally {
    await client.end()
  }
}

module.exports = { chay }

if (require.main === module) {
  require('dotenv').config()
  chay({ databaseUrl: process.env.DATABASE_URL, thuMuc: process.env.SQL_DIR || THU_MUC_MAC_DINH })
    .then(r => console.log(r.length ? `Xong, da chay ${r.length} tep.` : 'Khong co gi moi.'))
    .catch(e => { console.error(e.message); process.exit(1) })
}
