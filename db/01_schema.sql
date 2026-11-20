-- =====================================================================
-- POTECO - Phan mem khao sat tuyen cap
-- 01_schema.sql : Cau truc co so du lieu (PostgreSQL 13 tro len)
--
-- Quy uoc:
--   * Ten bang/cot: tieng Viet khong dau, snake_case, bam theo ten truong
--     dang dung trong web (ly_trinh, dia_diem, ma_loai_cot ...).
--   * Thoi gian: timestamptz (luu UTC). Ngay nghiep vu tinh theo
--     Asia/Ho_Chi_Minh.
--   * Gia tri rong trong KML ('') duoc chuyen thanh NULL khi nhap.
--   * Xoa mem bang cot xoa_luc voi du lieu nghiep vu; danh muc dung
--     hoat_dong = false, khong xoa cung.
-- Chay theo thu tu: 01_schema.sql -> 02_seed_danh_muc.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Ham dung chung
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_set_cap_nhat_luc() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.cap_nhat_luc := now();
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 1. TAI KHOAN, PHAN QUYEN, THIET BI  (hang muc III.1, III.6)
-- ---------------------------------------------------------------------
CREATE TABLE vai_tro (
    id                  smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ma                  varchar(40)  NOT NULL UNIQUE,
    ten                 varchar(120) NOT NULL,
    cap_quan_ly         smallint     NOT NULL DEFAULT 0 CHECK (cap_quan_ly >= 0),
    la_ke_toan          boolean      NOT NULL DEFAULT false,
    ghi_chu             text
);
COMMENT ON TABLE  vai_tro IS 'Vai tro nguoi dung. cap_quan_ly: 0 = nhan vien; >= 1 la cac cap quan ly.';
COMMENT ON COLUMN vai_tro.la_ke_toan IS 'Ke toan duoc xem track log thoi gian hoan thien tuyen (III.6).';

CREATE TABLE tai_khoan (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ten_dang_nhap       varchar(60)  NOT NULL,
    mat_khau_hash       text         NOT NULL,
    ho_ten              varchar(150) NOT NULL,
    vai_tro_id          smallint     NOT NULL REFERENCES vai_tro(id),
    quan_ly_id          uuid         REFERENCES tai_khoan(id),
    hoat_dong           boolean      NOT NULL DEFAULT true,
    tao_luc             timestamptz  NOT NULL DEFAULT now(),
    cap_nhat_luc        timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT ck_tai_khoan_khong_tu_quan_ly CHECK (quan_ly_id IS NULL OR quan_ly_id <> id)
);
CREATE UNIQUE INDEX ux_tai_khoan_ten_dang_nhap ON tai_khoan (lower(ten_dang_nhap));
CREATE INDEX ix_tai_khoan_quan_ly ON tai_khoan (quan_ly_id);
COMMENT ON COLUMN tai_khoan.quan_ly_id IS 'Quan ly truc tiep; dung de dung cay cap quan ly khi phan quyen xem lich su.';
CREATE TRIGGER tg_tai_khoan_cap_nhat BEFORE UPDATE ON tai_khoan
    FOR EACH ROW EXECUTE FUNCTION fn_set_cap_nhat_luc();

CREATE TABLE thiet_bi (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tai_khoan_id        uuid         NOT NULL REFERENCES tai_khoan(id),
    ma_thiet_bi         varchar(100) NOT NULL UNIQUE,
    ten                 varchar(150),
    kich_hoat_luc       timestamptz  NOT NULL DEFAULT now(),
    het_han_luc         timestamptz,
    hoat_dong           boolean      NOT NULL DEFAULT true
);
CREATE INDEX ix_thiet_bi_tai_khoan ON thiet_bi (tai_khoan_id);
COMMENT ON TABLE thiet_bi IS 'Thiet bi Android. Thay the co che key kich hoat theo thiet bi dang luu trong file tren may.';

CREATE TABLE cau_hinh_he_thong (
    khoa                varchar(80) PRIMARY KEY,
    gia_tri             jsonb       NOT NULL,
    mo_ta               text,
    cap_nhat_luc        timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. DANH MUC  (tach tu cac mang hang cung trong SPC.java / Const_Infor.js)
-- ---------------------------------------------------------------------
-- Cac danh muc gia tri don gian: ODF, splitter, treo/neo, UDJ, gong,
-- chung loai cap, treo/ham, de U, dai.
-- ma = chuoi van ban dang duoc luu trong KML hien tai (giu nguyen de nhap
-- file cu khong phai chuyen doi).
CREATE TABLE dm_gia_tri (
    nhom                varchar(40)  NOT NULL,
    ma                  varchar(60)  NOT NULL,
    ten                 varchar(120) NOT NULL,
    thu_tu              smallint     NOT NULL DEFAULT 0,
    hoat_dong           boolean      NOT NULL DEFAULT true,
    PRIMARY KEY (nhom, ma)
);
COMMENT ON TABLE dm_gia_tri IS 'Danh muc gia tri don gian, phan nhom theo cot nhom. Cot cot.* tham chieu bang ma, kiem tra o tang ung dung va view v_cot_sai_danh_muc.';

CREATE TABLE dm_chieu_cao_cot (
    gia_tri_m           numeric(4,1) PRIMARY KEY CHECK (gia_tri_m > 0),
    ten                 varchar(10)  NOT NULL,
    thu_tu              smallint     NOT NULL DEFAULT 0,
    hoat_dong           boolean      NOT NULL DEFAULT true
);

CREATE TABLE dm_loai_cot (
    ma                  varchar(30) PRIMARY KEY,
    hien_trang          varchar(2)  NOT NULL CHECK (hien_trang IN ('tm','cs')),
    ten                 varchar(150),
    icon_key            varchar(60),
    thu_tu              smallint    NOT NULL DEFAULT 0,
    hoat_dong           boolean     NOT NULL DEFAULT true,
    ghi_chu             text
);
COMMENT ON COLUMN dm_loai_cot.hien_trang IS 'tm = Trong moi, cs = Co san.';
COMMENT ON COLUMN dm_loai_cot.ten IS 'Ten hien thi. Chua co trong code, nghiep vu bo sung.';

CREATE TABLE dm_vat_tu (
    ma                  varchar(30) PRIMARY KEY,
    hien_trang_ap_dung  varchar(8)  NOT NULL CHECK (hien_trang_ap_dung IN ('tm','cs','ca_hai')),
    ten                 varchar(150),
    icon_key            varchar(60),
    thu_tu              smallint    NOT NULL DEFAULT 0,
    hoat_dong           boolean     NOT NULL DEFAULT true,
    ghi_chu             text
);

CREATE TABLE dm_be_cap (
    ma                  varchar(30) PRIMARY KEY,
    hien_trang          varchar(2)  NOT NULL CHECK (hien_trang IN ('tm','cs')),
    ten                 varchar(150),
    icon_key            varchar(60),
    thu_tu              smallint    NOT NULL DEFAULT 0,
    hoat_dong           boolean     NOT NULL DEFAULT true,
    ghi_chu             text
);

CREATE TABLE dm_phu_kien_cot (
    ma                  varchar(30) PRIMARY KEY,
    ten                 varchar(150),
    icon_key            varchar(60),
    thu_tu              smallint    NOT NULL DEFAULT 0,
    hoat_dong           boolean     NOT NULL DEFAULT true,
    ghi_chu             text
);

-- Hang muc IV.2: danh muc loai cong trinh va he so n
CREATE TABLE dm_loai_cong_trinh (
    id                  smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ma                  varchar(40)  NOT NULL UNIQUE,
    ten                 varchar(150) NOT NULL,
    he_so_n             numeric(6,3) NOT NULL CHECK (he_so_n > 0),
    hoat_dong           boolean      NOT NULL DEFAULT true,
    cap_nhat_boi        uuid         REFERENCES tai_khoan(id),
    cap_nhat_luc        timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON TABLE dm_loai_cong_trinh IS 'Chi quan ly cap 2 tro len duoc sua (IV.2). He so n duoc chup lai vao tuyen_phien_ban khi luu.';
CREATE TRIGGER tg_dm_loai_cong_trinh_cap_nhat BEFORE UPDATE ON dm_loai_cong_trinh
    FOR EACH ROW EXECUTE FUNCTION fn_set_cap_nhat_luc();

-- ---------------------------------------------------------------------
-- 3. DOI TUONG LOI: DU AN -> TUYEN -> COT / DUONG / TRACK
-- ---------------------------------------------------------------------
-- Du an: thu muc cha tren web ("Tao du an"), co the long nhau.
CREATE TABLE du_an (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cha_id              uuid         REFERENCES du_an(id),
    ten                 varchar(200) NOT NULL,
    tao_boi             uuid         NOT NULL REFERENCES tai_khoan(id),
    tao_luc             timestamptz  NOT NULL DEFAULT now(),
    cap_nhat_luc        timestamptz  NOT NULL DEFAULT now(),
    xoa_luc             timestamptz,
    CONSTRAINT ck_du_an_khong_tu_cha CHECK (cha_id IS NULL OR cha_id <> id)
);
CREATE INDEX ix_du_an_cha ON du_an (cha_id);
CREATE TRIGGER tg_du_an_cap_nhat BEFORE UPDATE ON du_an
    FOR EACH ROW EXECUTE FUNCTION fn_set_cap_nhat_luc();

-- Tuyen: tren Android la mot file KML (thu muc "T_<ten>"); tren web la thu
-- muc co tien to "T_". Ten luu o day KHONG co tien to.
CREATE TABLE tuyen (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    du_an_id            uuid         REFERENCES du_an(id),
    ten_tuyen           varchar(200) NOT NULL,
    loai_cong_trinh_id  smallint     REFERENCES dm_loai_cong_trinh(id),
    so_cot              integer      NOT NULL DEFAULT 0 CHECK (so_cot >= 0),
    chieu_dai_tuyen_m   numeric(12,2) CHECK (chieu_dai_tuyen_m >= 0),
    he_so_n             numeric(6,3)  CHECK (he_so_n > 0),
    chieu_dai_cap_m     numeric(12,2) CHECK (chieu_dai_cap_m >= 0),
    trang_thai          varchar(20)  NOT NULL DEFAULT 'dang_khao_sat'
                        CHECK (trang_thai IN ('dang_khao_sat','hoan_thien')),
    hoan_thien_luc      timestamptz,
    phien_ban_hien_tai  integer      NOT NULL DEFAULT 0 CHECK (phien_ban_hien_tai >= 0),
    nguon_tao           varchar(20)  NOT NULL DEFAULT 'android'
                        CHECK (nguon_tao IN ('android','web','nhap_kml')),
    tao_boi             uuid         NOT NULL REFERENCES tai_khoan(id),
    tao_luc             timestamptz  NOT NULL DEFAULT now(),
    cap_nhat_luc        timestamptz  NOT NULL DEFAULT now(),
    xoa_luc             timestamptz,
    CONSTRAINT ck_tuyen_hoan_thien CHECK (
        (trang_thai = 'hoan_thien') = (hoan_thien_luc IS NOT NULL)
    )
);
CREATE UNIQUE INDEX ux_tuyen_ten_trong_du_an ON tuyen (
    coalesce(du_an_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(ten_tuyen)
) WHERE xoa_luc IS NULL;
CREATE INDEX ix_tuyen_tao_boi ON tuyen (tao_boi);
CREATE INDEX ix_tuyen_du_an ON tuyen (du_an_id);
COMMENT ON COLUMN tuyen.chieu_dai_tuyen_m IS 'Gia tri tinh san (cache). Quy tac tinh xem tai lieu muc 3.4 (R4).';
COMMENT ON COLUMN tuyen.he_so_n IS 'He so n dang ap dung, lay tu loai cong trinh tai luc luu gan nhat.';
CREATE TRIGGER tg_tuyen_cap_nhat BEFORE UPDATE ON tuyen
    FOR EACH ROW EXECUTE FUNCTION fn_set_cap_nhat_luc();

-- Cot: gom cac nhom thuoc tinh dang nam trong BASE_COT (web) va cls_cot (Android).
CREATE TABLE cot (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tuyen_id            uuid         NOT NULL REFERENCES tuyen(id) ON DELETE CASCADE,
    thu_tu              integer      NOT NULL CHECK (thu_tu >= 1),

    -- dinh danh va vi tri
    ten_cot             varchar(120) NOT NULL,
    ky_hieu             varchar(60),
    so_thu_tu           integer,
    dia_diem            text,
    kinh_do             numeric(10,7) NOT NULL CHECK (kinh_do BETWEEN -180 AND 180),
    vi_do               numeric(10,7) NOT NULL CHECK (vi_do BETWEEN -90 AND 90),
    cao_do_m            numeric(8,2),
    ly_trinh            varchar(60),
    hien_ly_trinh       boolean      NOT NULL DEFAULT false,
    nhan_doi_phu_kien   boolean      NOT NULL DEFAULT false,
    dat_bien_bao        boolean      NOT NULL DEFAULT false,

    -- cot
    hien_trang_cot      varchar(2)   CHECK (hien_trang_cot IN ('tm','cs')),
    ma_loai_cot         varchar(30)  REFERENCES dm_loai_cot(ma),
    chieu_cao_m         numeric(4,1) REFERENCES dm_chieu_cao_cot(gia_tri_m),

    -- vat tu
    hien_trang_vat_tu   varchar(2)   CHECK (hien_trang_vat_tu IN ('tm','cs')),
    ma_vat_tu           varchar(30)  REFERENCES dm_vat_tu(ma),
    chung_loai_odf      varchar(60),
    chung_loai_splitter varchar(60),

    -- be cap, phu kien cot
    hien_trang_be_cap   varchar(2)   CHECK (hien_trang_be_cap IN ('tm','cs')),
    ma_be_cap           varchar(30)  REFERENCES dm_be_cap(ma),
    ma_phu_kien         varchar(30)  REFERENCES dm_phu_kien_cot(ma),

    -- phu kien cap ADSS
    adss_treo_neo       varchar(60),
    adss_udj            varchar(60),
    adss_gong           varchar(60),
    adss_chung_loai     varchar(60),

    -- phu kien cap AC
    ac_treo_ham         varchar(60),
    ac_de_u             varchar(60),
    ac_dai              varchar(60),
    ac_chung_loai       varchar(60),

    -- nguon diem (III.4)
    nguon_diem          varchar(20)
                        CHECK (nguon_diem IN ('gps','cham_ban_do','keo_tha','chen_giua','nhap_kml')),
    thuoc_tinh_khac     jsonb        NOT NULL DEFAULT '{}'::jsonb,

    tao_boi             uuid         NOT NULL REFERENCES tai_khoan(id),
    tao_luc             timestamptz  NOT NULL DEFAULT now(),
    cap_nhat_luc        timestamptz  NOT NULL DEFAULT now(),
    xoa_luc             timestamptz
);
CREATE INDEX ix_cot_tuyen_thu_tu ON cot (tuyen_id, thu_tu) WHERE xoa_luc IS NULL;
CREATE INDEX ix_cot_ma_loai_cot  ON cot (ma_loai_cot);
CREATE INDEX ix_cot_ma_vat_tu    ON cot (ma_vat_tu);
COMMENT ON COLUMN cot.thu_tu IS 'Thu tu cot trong tuyen. Khong rang buoc UNIQUE de doi cho/chen cot bang mot lenh UPDATE; ung dung giu thu tu lien tuc.';
COMMENT ON COLUMN cot.thuoc_tinh_khac IS 'Truong cu khong co trong mo hinh moi (vi du dinh dang JSON cu: HinhDangCot, BoTroNeo, DonViChuQuan ...), giu lai khi nhap de khong mat du lieu.';
CREATE TRIGGER tg_cot_cap_nhat BEFORE UPDATE ON cot
    FOR EACH ROW EXECUTE FUNCTION fn_set_cap_nhat_luc();

-- Duong: polyline "Do duong" hoac duong ve tay. toa_do = [[kinh_do, vi_do], ...]
CREATE TABLE duong (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tuyen_id            uuid         NOT NULL REFERENCES tuyen(id) ON DELETE CASCADE,
    loai                varchar(20)  NOT NULL DEFAULT 'do_duong'
                        CHECK (loai IN ('do_duong','ve_tay')),
    ten                 varchar(200),
    toa_do              jsonb        NOT NULL CHECK (jsonb_typeof(toa_do) = 'array'),
    mau                 varchar(9),
    do_day              smallint     CHECK (do_day > 0),
    tao_luc             timestamptz  NOT NULL DEFAULT now(),
    cap_nhat_luc        timestamptz  NOT NULL DEFAULT now(),
    xoa_luc             timestamptz
);
CREATE INDEX ix_duong_tuyen ON duong (tuyen_id) WHERE xoa_luc IS NULL;
CREATE TRIGGER tg_duong_cap_nhat BEFORE UPDATE ON duong
    FOR EACH ROW EXECUTE FUNCTION fn_set_cap_nhat_luc();

-- Track GPS: gx:Track trong KML cua Android. KML hien tai chi co toa do; bo
-- sung thoi gian va do chinh xac de truy vet GPS (III.4) va xu ly GPS lech.
CREATE TABLE track_diem (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tuyen_id            uuid         NOT NULL REFERENCES tuyen(id) ON DELETE CASCADE,
    thu_tu              integer      NOT NULL CHECK (thu_tu >= 1),
    kinh_do             numeric(10,7) NOT NULL CHECK (kinh_do BETWEEN -180 AND 180),
    vi_do               numeric(10,7) NOT NULL CHECK (vi_do BETWEEN -90 AND 90),
    thoi_gian           timestamptz,
    do_chinh_xac_m      real         CHECK (do_chinh_xac_m >= 0),
    nguon               varchar(20)  CHECK (nguon IN ('gps','network','fused'))
);
CREATE INDEX ix_track_diem_tuyen ON track_diem (tuyen_id, thu_tu);

-- ---------------------------------------------------------------------
-- 4. PHIEN BAN TUYEN VA NHAT KY THAO TAC  (hang muc III)
-- ---------------------------------------------------------------------
CREATE TABLE tuyen_phien_ban (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tuyen_id            uuid         NOT NULL REFERENCES tuyen(id) ON DELETE CASCADE,
    so_phien_ban        integer      NOT NULL CHECK (so_phien_ban >= 1),
    loai_luu            varchar(20)  NOT NULL
                        CHECK (loai_luu IN ('hien_truong','chinh_sua_sau')),
    la_ban_hoan_thien   boolean      NOT NULL DEFAULT false,
    tai_khoan_id        uuid         NOT NULL REFERENCES tai_khoan(id),
    thiet_bi_id         uuid         REFERENCES thiet_bi(id),
    thoi_gian_thiet_bi  timestamptz,
    thoi_gian_server    timestamptz  NOT NULL DEFAULT now(),

    gps_kinh_do         numeric(10,7) CHECK (gps_kinh_do BETWEEN -180 AND 180),
    gps_vi_do           numeric(10,7) CHECK (gps_vi_do BETWEEN -90 AND 90),
    gps_do_chinh_xac_m  real         CHECK (gps_do_chinh_xac_m >= 0),

    so_cot              integer      NOT NULL DEFAULT 0,
    chieu_dai_tuyen_m   numeric(12,2),
    loai_cong_trinh_id  smallint     REFERENCES dm_loai_cong_trinh(id),
    he_so_n             numeric(6,3),
    chieu_dai_cap_m     numeric(12,2),

    so_cot_them         integer      NOT NULL DEFAULT 0,
    so_cot_sua          integer      NOT NULL DEFAULT 0,
    so_cot_xoa          integer      NOT NULL DEFAULT 0,

    hinh_dang           jsonb        NOT NULL,
    du_lieu_cot         jsonb        NOT NULL,
    UNIQUE (tuyen_id, so_phien_ban)
);
CREATE INDEX ix_phien_ban_tai_khoan_ngay ON tuyen_phien_ban (tai_khoan_id, thoi_gian_server DESC);
CREATE INDEX ix_phien_ban_thoi_gian      ON tuyen_phien_ban (thoi_gian_server);
COMMENT ON COLUMN tuyen_phien_ban.hinh_dang IS 'Hinh dang tuyen tai thoi diem luu: day toa do cot theo thu tu, cac duong, track (III.2, III.3).';
COMMENT ON COLUMN tuyen_phien_ban.du_lieu_cot IS 'Toan bo thuoc tinh cot tai thoi diem luu, de xem lai va doi chieu khi du lieu hien tai bi sua.';
COMMENT ON COLUMN tuyen_phien_ban.loai_luu IS 'hien_truong = luu khi dang khao sat; chinh_sua_sau = sua lai sau do (III.4).';

CREATE TABLE nhat_ky_thao_tac (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tai_khoan_id        uuid         NOT NULL REFERENCES tai_khoan(id),
    thiet_bi_id         uuid         REFERENCES thiet_bi(id),
    tuyen_id            uuid         REFERENCES tuyen(id) ON DELETE SET NULL,
    phien_ban_id        uuid         REFERENCES tuyen_phien_ban(id) ON DELETE SET NULL,
    hanh_dong           varchar(20)  NOT NULL
                        CHECK (hanh_dong IN ('tao','luu','sua','gui','dong_bo')),
    loai_luu            varchar(20)
                        CHECK (loai_luu IN ('hien_truong','chinh_sua_sau')),
    thoi_gian_thiet_bi  timestamptz,
    thoi_gian_server    timestamptz  NOT NULL DEFAULT now(),
    gps_kinh_do         numeric(10,7) CHECK (gps_kinh_do BETWEEN -180 AND 180),
    gps_vi_do           numeric(10,7) CHECK (gps_vi_do BETWEEN -90 AND 90),
    gps_do_chinh_xac_m  real         CHECK (gps_do_chinh_xac_m >= 0),
    nguon_diem          varchar(20)
                        CHECK (nguon_diem IN ('gps','cham_ban_do','keo_tha','chen_giua','nhap_kml')),
    chi_tiet            jsonb        NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_nhat_ky_tai_khoan ON nhat_ky_thao_tac (tai_khoan_id, thoi_gian_server DESC);
CREATE INDEX ix_nhat_ky_tuyen     ON nhat_ky_thao_tac (tuyen_id, thoi_gian_server DESC);
CREATE INDEX ix_nhat_ky_thoi_gian ON nhat_ky_thao_tac (thoi_gian_server);
COMMENT ON COLUMN nhat_ky_thao_tac.thoi_gian_thiet_bi IS 'Gio tren thiet bi luc thao tac; khac thoi_gian_server (gio dong bo len Cloud) - III.1.';
COMMENT ON COLUMN nhat_ky_thao_tac.hanh_dong IS 'Dung 5 hanh dong cua bao gia: tao, luu, sua, gui, dong_bo.';

-- ---------------------------------------------------------------------
-- 5. VIEW
-- ---------------------------------------------------------------------
-- Tuyen luu cuoi cung trong ngay cua tung nhan vien (III.5).
-- Ngay tinh theo gio Viet Nam.
CREATE VIEW v_tuyen_luu_cuoi_trong_ngay AS
SELECT DISTINCT ON (pb.tai_khoan_id, (pb.thoi_gian_server AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
       pb.tai_khoan_id,
       (pb.thoi_gian_server AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS ngay,
       pb.tuyen_id,
       pb.id AS phien_ban_id,
       pb.so_phien_ban,
       pb.loai_luu,
       pb.thoi_gian_thiet_bi,
       pb.thoi_gian_server
FROM tuyen_phien_ban pb
ORDER BY pb.tai_khoan_id,
         (pb.thoi_gian_server AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
         pb.thoi_gian_server DESC;

-- Cot co gia tri khong nam trong danh muc dm_gia_tri (kiem tra chat luong du lieu).
CREATE VIEW v_cot_sai_danh_muc AS
SELECT c.id AS cot_id, c.tuyen_id, 'chung_loai_odf'::text AS truong, c.chung_loai_odf AS gia_tri
  FROM cot c WHERE c.xoa_luc IS NULL AND c.chung_loai_odf IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dm_gia_tri g WHERE g.nhom = 'chung_loai_odf' AND g.ma = c.chung_loai_odf)
UNION ALL
SELECT c.id, c.tuyen_id, 'chung_loai_splitter', c.chung_loai_splitter
  FROM cot c WHERE c.xoa_luc IS NULL AND c.chung_loai_splitter IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dm_gia_tri g WHERE g.nhom = 'chung_loai_splitter' AND g.ma = c.chung_loai_splitter)
UNION ALL
SELECT c.id, c.tuyen_id, 'adss_treo_neo', c.adss_treo_neo
  FROM cot c WHERE c.xoa_luc IS NULL AND c.adss_treo_neo IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dm_gia_tri g WHERE g.nhom = 'treo_neo' AND g.ma = c.adss_treo_neo)
UNION ALL
SELECT c.id, c.tuyen_id, 'adss_udj', c.adss_udj
  FROM cot c WHERE c.xoa_luc IS NULL AND c.adss_udj IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dm_gia_tri g WHERE g.nhom = 'udj' AND g.ma = c.adss_udj)
UNION ALL
SELECT c.id, c.tuyen_id, 'adss_gong', c.adss_gong
  FROM cot c WHERE c.xoa_luc IS NULL AND c.adss_gong IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dm_gia_tri g WHERE g.nhom = 'gong' AND g.ma = c.adss_gong)
UNION ALL
SELECT c.id, c.tuyen_id, 'adss_chung_loai', c.adss_chung_loai
  FROM cot c WHERE c.xoa_luc IS NULL AND c.adss_chung_loai IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dm_gia_tri g WHERE g.nhom = 'chung_loai_cap' AND g.ma = c.adss_chung_loai)
UNION ALL
SELECT c.id, c.tuyen_id, 'ac_treo_ham', c.ac_treo_ham
  FROM cot c WHERE c.xoa_luc IS NULL AND c.ac_treo_ham IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dm_gia_tri g WHERE g.nhom = 'treo_ham' AND g.ma = c.ac_treo_ham)
UNION ALL
SELECT c.id, c.tuyen_id, 'ac_de_u', c.ac_de_u
  FROM cot c WHERE c.xoa_luc IS NULL AND c.ac_de_u IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dm_gia_tri g WHERE g.nhom = 'de_u' AND g.ma = c.ac_de_u)
UNION ALL
SELECT c.id, c.tuyen_id, 'ac_dai', c.ac_dai
  FROM cot c WHERE c.xoa_luc IS NULL AND c.ac_dai IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dm_gia_tri g WHERE g.nhom = 'dai' AND g.ma = c.ac_dai)
UNION ALL
SELECT c.id, c.tuyen_id, 'ac_chung_loai', c.ac_chung_loai
  FROM cot c WHERE c.xoa_luc IS NULL AND c.ac_chung_loai IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dm_gia_tri g WHERE g.nhom = 'chung_loai_cap' AND g.ma = c.ac_chung_loai);

COMMIT;
