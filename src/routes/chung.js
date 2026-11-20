'use strict'

/** Gui tep tai ve. Ten tep co dau: filename (ASCII) + filename* (UTF-8) theo RFC 6266. */
function guiTep(res, { noiDung, tenTep, kieu }) {
  const ascii = tenTep.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  res.setHeader('Content-Type', kieu)
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(tenTep)}`)
  res.setHeader('Cache-Control', 'no-store')
  res.send(noiDung)
}

const KIEU_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const KIEU_KML = 'application/vnd.google-earth.kml+xml; charset=utf-8'

module.exports = { guiTep, KIEU_XLSX, KIEU_KML }
