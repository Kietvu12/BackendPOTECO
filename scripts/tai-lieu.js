'use strict'
/**
 * Sinh lai tai lieu API va ma tran phan quyen tu ma nguon:
 *   npm run tai-lieu
 * Ket qua: docs/Tai-lieu-API-Backend.docx, docs/Ma-tran-phan-quyen.docx, docs/api/api-spec.json
 * Can Python 3 va python-docx (pip install python-docx).
 */
const { execFileSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const goc = path.resolve(__dirname, '..', '..')
const docs = path.join(goc, 'docs')
const json = path.join(docs, 'api', 'api-spec.json')
fs.mkdirSync(path.dirname(json), { recursive: true })

execFileSync(process.execPath, [path.join(__dirname, 'xuat-api.js'), json], { stdio: 'inherit' })

const py = path.join(__dirname, 'sinh_tai_lieu.py')
for (const lenh of [['python', []], ['py', ['-3']], ['python3', []]]) {
  const kq = spawnSync(lenh[0], [...lenh[1], py, json, docs], { stdio: 'inherit', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
  if (kq.error && kq.error.code === 'ENOENT') continue
  process.exit(kq.status === null ? 1 : kq.status)
}
console.error('Khong tim thay Python 3. Cai Python va chay: pip install python-docx')
process.exit(1)
