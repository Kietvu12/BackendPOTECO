'use strict'
/**
 * Xuat dac ta API va ma tran phan quyen ra JSON tu chinh ma nguon (registry + permissions),
 * de tai lieu khong bao gio lech voi code.
 *   node scripts/xuat-api.js [duong_dan_json]   (mac dinh: ghi ra stdout)
 */
const fs = require('fs')
const { routes } = require('../src/routes')
const { VAI_TRO, QUYEN } = require('../src/permissions')
const { TIEN_TO } = require('../src/app')

const out = {
  tien_to: TIEN_TO,
  vai_tro: VAI_TRO,
  quyen: Object.entries(QUYEN).map(([ma, q]) => ({ ma, nhom: q.nhom, mo_ta: q.mo_ta, ma_tran: q.ma_tran })),
  api: routes.map(r => ({
    method: r.method.toUpperCase(),
    path: TIEN_TO + r.path,
    quyen: r.quyen,
    nhom: r.nhom,
    tom_tat: r.tom_tat,
    tham_so: r.tham_so || '',
    ket_qua: r.ket_qua || '',
    ghi_chu: r.ghi_chu || '',
  })),
}
const s = JSON.stringify(out, null, 2)
if (process.argv[2]) fs.writeFileSync(process.argv[2], s, 'utf8')
else process.stdout.write(s + '\n')
