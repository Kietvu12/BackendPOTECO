-- =====================================================================
-- POTECO - Phan mem khao sat tuyen cap
-- 04_backend_bo_sung.sql : Bo sung cho backend Node.js (chay sau 01, 02, 03)
--
--   1. Vai tro quan_tri (can co de tao tai khoan dau tien, cap nhat danh muc).
--   2. Bang phien_dang_nhap: luu refresh token (chi luu ma bam SHA-256).
--   3. tuyen_phien_ban.ma_yeu_cau: ma do ung dung gui khi luu, de dong bo
--      lai (mat mang, gui trung) khong tao hai phien ban giong nhau.
-- =====================================================================

BEGIN;

INSERT INTO vai_tro (ma, ten, cap_quan_ly, la_ke_toan, ghi_chu) VALUES
    ('quan_tri', 'Quản trị hệ thống', 9, false,
     'Tam thoi; tao tai khoan, sua danh muc, cau hinh he thong')
ON CONFLICT DO NOTHING;

CREATE TABLE phien_dang_nhap (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tai_khoan_id    uuid        NOT NULL REFERENCES tai_khoan(id) ON DELETE CASCADE,
    thiet_bi_id     uuid        REFERENCES thiet_bi(id),
    ma_bam          char(64)    NOT NULL UNIQUE,
    tao_luc         timestamptz NOT NULL DEFAULT now(),
    het_han_luc     timestamptz NOT NULL,
    thu_hoi_luc     timestamptz,
    CONSTRAINT ck_phien_dang_nhap_han CHECK (het_han_luc > tao_luc)
);
CREATE INDEX ix_phien_dang_nhap_tai_khoan ON phien_dang_nhap (tai_khoan_id) WHERE thu_hoi_luc IS NULL;
COMMENT ON TABLE phien_dang_nhap IS 'Refresh token. ma_bam la SHA-256 cua token; token goc khong duoc luu.';

ALTER TABLE tuyen_phien_ban ADD COLUMN ma_yeu_cau uuid;
CREATE UNIQUE INDEX ux_phien_ban_ma_yeu_cau ON tuyen_phien_ban (tuyen_id, ma_yeu_cau)
    WHERE ma_yeu_cau IS NOT NULL;
COMMENT ON COLUMN tuyen_phien_ban.ma_yeu_cau IS 'Ma yeu cau do ung dung gui (UUID). Gui lai cung ma tren cung tuyen thi tra ve phien ban da co.';

COMMIT;
