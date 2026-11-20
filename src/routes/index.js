'use strict'
// Thu tu nap = thu tu dang ky route trong Express. Route cu the phai dang truoc route co tham so cung tien to.
require('./auth')
require('./taiKhoan')
require('./thietBi')
require('./danhMuc')
require('./duAn')
require('./tuyen')
require('./nhatKy')
require('./baoCao')
require('./heThong')

const { router, routes } = require('../registry')

module.exports = { router, routes }
