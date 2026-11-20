-- =====================================================================
-- POTECO - Phan mem khao sat tuyen cap
-- 02_seed_danh_muc.sql : Du lieu khoi tao lay tu cac mang hang cung
--   Web    : WebBanDoPTA/src/component/const/Const_Infor.js, Const_Images.js
--   Android: AppKhaoSatPOTECO/.../SPC.java
--
-- Khi hai nen tang khac nhau, script chon theo web va ghi chu trong cot
-- ghi_chu. Cac muc do chua chot nam trong tai lieu muc 6.
-- Script chay lai duoc nhieu lan (ON CONFLICT DO NOTHING).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Chieu cao cot (web: CHIEU_CAO_COT, Android: lst_ChieuCaoCot)
-- ---------------------------------------------------------------------
INSERT INTO dm_chieu_cao_cot (gia_tri_m, ten, thu_tu) VALUES
    (6.0,  '6m',   1),
    (6.5,  '6.5m', 2),
    (7.0,  '7m',   3),
    (7.5,  '7.5m', 4),
    (8.0,  '8m',   5),
    (8.5,  '8.5m', 6),
    (10.0, '10m',  7),
    (12.0, '12m',  8)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Danh muc gia tri don gian (ma = chuoi dang luu trong KML)
-- ---------------------------------------------------------------------
INSERT INTO dm_gia_tri (nhom, ma, ten, thu_tu) VALUES
    -- Chung loai ODF
    ('chung_loai_odf',      '6Fo',         '6Fo',         1),
    ('chung_loai_odf',      '12Fo',        '12Fo',        2),
    ('chung_loai_odf',      '24Fo',        '24Fo',        3),
    ('chung_loai_odf',      '48Fo',        '48Fo',        4),
    ('chung_loai_odf',      '96Fo',        '96Fo',        5),
    -- Chung loai splitter
    ('chung_loai_splitter', '1:2',         '1:2',         1),
    ('chung_loai_splitter', '1:4',         '1:4',         2),
    ('chung_loai_splitter', '1:8',         '1:8',         3),
    ('chung_loai_splitter', '1:16',        '1:16',        4),
    -- Cap ADSS: treo / neo
    ('treo_neo',            'Treo',        'Treo',        1),
    ('treo_neo',            'Néo',         'Néo',         2),
    ('treo_neo',            'Néo 2 hướng', 'Néo 2 hướng', 3),
    -- Cap ADSS: de U / dai / moc J
    ('udj',                 'Đế U',        'Đế U',        1),
    ('udj',                 'Đai',         'Đai',         2),
    ('udj',                 'Móc J',       'Móc J',       3),
    -- Cap ADSS: gong
    ('gong',                'Gông C1',     'Gông C1',     1),
    ('gong',                'Gông G0',     'Gông G0',     2),
    -- Chung loai cap (dung chung cho ADSS va AC)
    ('chung_loai_cap',      'KV100',       'KV100',       1),
    ('chung_loai_cap',      'KV200',       'KV200',       2),
    ('chung_loai_cap',      'KV300',       'KV300',       3),
    ('chung_loai_cap',      'KV400',       'KV400',       4),
    ('chung_loai_cap',      'KV500',       'KV500',       5),
    ('chung_loai_cap',      'KV600',       'KV600',       6),
    -- Cap AC
    ('treo_ham',            'Treo',        'Treo',        1),
    ('treo_ham',            'Hãm',         'Hãm',         2),
    ('de_u',                'Đế U',        'Đế U',        1),
    ('dai',                 'Đai',         'Đai',         1)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Loai cot (28 ma). ten de trong, nghiep vu bo sung.
-- icon_key = ma; web lay anh tai /img/poteco/LoaiCot/<ma>.png
-- ---------------------------------------------------------------------
INSERT INTO dm_loai_cot (ma, hien_trang, icon_key, thu_tu) VALUES
    -- Trong moi (LOAI_COT_TM / lst_LoaiCot_Moi)
    ('2lt_tm',    'tm', '2lt_tm',    1),
    ('2v_tm',     'tm', '2v_tm',     2),
    ('s_tm',      'tm', 's_tm',      3),
    ('v_tm',      'tm', 'v_tm',      4),
    ('lt_tm',     'tm', 'lt_tm',     5),
    ('b_lt',      'tm', 'b_lt',      6),
    ('b_2lt',     'tm', 'b_2lt',     7),
    ('b_v',       'tm', 'b_v',       8),
    ('b_2v',      'tm', 'b_2v',      9),
    -- Co san (LOAI_COT_CS / lst_LoaiCot_CoSan)
    ('v_cs_cn',   'cs', 'v_cs_cn',   10),
    ('2v_cs_cn',  'cs', '2v_cs_cn',  11),
    ('lt_cs_cn',  'cs', 'lt_cs_cn',  12),
    ('2lt_cs_cn', 'cs', '2lt_cs_cn', 13),
    ('b_v_cn',    'cs', 'b_v_cn',    14),
    ('b_2v_cn',   'cs', 'b_2v_cn',   15),
    ('b_lt_cn',   'cs', 'b_lt_cn',   16),
    ('b_2lt_cn',  'cs', 'b_2lt_cn',  17),
    ('lt_cs',     'cs', 'lt_cs',     18),
    ('2lt_cs',    'cs', '2lt_cs',    19),
    ('v_cs',      'cs', 'v_cs',      20),
    ('2v_cs',     'cs', '2v_cs',     21),
    ('dl_lt',     'cs', 'dl_lt',     22),
    ('dl_2lt',    'cs', 'dl_2lt',    23),
    ('dl_v',      'cs', 'dl_v',      24),
    ('dl_2v',     'cs', 'dl_2v',     25),
    ('s_cs',      'cs', 's_cs',      26),
    ('vt_lt',     'cs', 'vt_lt',     27),
    ('vt_v',      'cs', 'vt_v',      28)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Vat tu (13 ma)
-- ---------------------------------------------------------------------
INSERT INTO dm_vat_tu (ma, hien_trang_ap_dung, icon_key, thu_tu, ghi_chu) VALUES
    ('ms_m',           'tm', 'ms_m',           1,  NULL),
    ('odf_indoor',     'tm', 'odf_indoor',     2,  NULL),
    ('odf_outdoor_m',  'tm', 'odf_outdoor_m',  3,  NULL),
    ('odfs1_m',        'tm', 'odfs1_m',        4,  NULL),
    ('s1s2_m',         'tm', 's1s2_m',         5,  NULL),
    ('s1s3_m',         'tm', 's1s3_m',         6,  NULL),
    ('s2_m',           'tm', 's2_m',           7,  NULL),
    ('ms_cs',          'cs', 'ms_cs',          8,  NULL),
    ('odf_outdoor_cs', 'cs', 'odf_outdoor_cs', 9,  NULL),
    ('odfs1_cs',       'cs', 'odfs1_cs',       10, NULL),
    ('s1_m_s2_cs',     'ca_hai', 's1_m_s2_cs', 11,
        'Web chi xep o Co san; Android co mat o CA HAI danh sach (Trong moi va Co san). De ca_hai cho den khi nghiep vu chot.'),
    ('s1s2_cs',        'cs', 's1s2_cs',        12, NULL),
    ('s2_cs',          'cs', 's2_cs',          13, NULL)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Be cap (6 ma). Android chi co 3 ma _cs.
-- ---------------------------------------------------------------------
INSERT INTO dm_be_cap (ma, hien_trang, icon_key, thu_tu, ghi_chu) VALUES
    ('bc1_cs', 'cs', 'bc1_cs', 1, NULL),
    ('bc2_cs', 'cs', 'bc2_cs', 2, NULL),
    ('bc3_cs', 'cs', 'bc3_cs', 3, NULL),
    ('bc1_m',  'tm', 'bc1_m',  4, 'Chi co tren web; Android chua co.'),
    ('bc2_m',  'tm', 'bc2_m',  5, 'Chi co tren web; Android chua co.'),
    ('bc3_m',  'tm', 'bc3_m',  6, 'Chi co tren web; Android chua co.')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Phu kien cot
-- ---------------------------------------------------------------------
INSERT INTO dm_phu_kien_cot (ma, icon_key, thu_tu, hoat_dong, ghi_chu) VALUES
    ('duphong',      NULL,           1, true,  NULL),
    ('satnoi',       'satnoi',       2, true,  NULL),
    ('chinhnghieng', NULL,           3, true,  'Chi co tren web; Android chua co.'),
    ('rr',           'rr',           4, false, 'Chi co anh trong Const_Images.js, khong co trong form nao. Tam tat.')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Vai tro (TAM THOI): bao gia chi neu "cap quan ly", "quan ly cap 2 tro len"
-- va "ke toan". So cap thuc te can nghiep vu xac nhan.
-- ---------------------------------------------------------------------
INSERT INTO vai_tro (ma, ten, cap_quan_ly, la_ke_toan, ghi_chu) VALUES
    ('nhan_vien',    'Nhân viên khảo sát', 0, false, 'Tam thoi'),
    ('quan_ly_cap_1','Quản lý cấp 1',      1, false, 'Tam thoi'),
    ('quan_ly_cap_2','Quản lý cấp 2',      2, false, 'Tam thoi; duoc thiet lap loai cong trinh va he so n'),
    ('ke_toan',      'Kế toán',            0, true,  'Tam thoi; xem track log thoi gian hoan thien tuyen')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- Tai khoan he thong dung cho du lieu di chuyen tu KML cu (khong dang nhap).
-- ---------------------------------------------------------------------
INSERT INTO tai_khoan (ten_dang_nhap, mat_khau_hash, ho_ten, vai_tro_id, hoat_dong)
SELECT 'he_thong', '!', 'Hệ thống (dữ liệu di chuyển)', v.id, false
  FROM vai_tro v
 WHERE v.ma = 'nhan_vien'
   AND NOT EXISTS (SELECT 1 FROM tai_khoan t WHERE lower(t.ten_dang_nhap) = 'he_thong');

-- ---------------------------------------------------------------------
-- Cau hinh he thong
-- ---------------------------------------------------------------------
INSERT INTO cau_hinh_he_thong (khoa, gia_tri, mo_ta) VALUES
    ('nhat_ky.luu_tru_ngay', '30'::jsonb,
        'So ngay giu nhat_ky_thao_tac (III.7 - luu tru lich su 1 thang). Can xac nhan pham vi ap dung.'),
    ('he_thong.mui_gio', '"Asia/Ho_Chi_Minh"'::jsonb,
        'Mui gio dung de tinh "ngay" trong tra cuu lich su.')
ON CONFLICT DO NOTHING;

COMMIT;
