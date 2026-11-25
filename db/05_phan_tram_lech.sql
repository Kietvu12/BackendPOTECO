-- =====================================================================
-- POTECO - % chênh lệch tuyến theo hướng (Bắc / Nam / Đông / Tây)
-- Không nhập thì mặc định 0. Snapshot vào phiên bản khi lưu.
-- =====================================================================

BEGIN;

ALTER TABLE tuyen
  ADD COLUMN IF NOT EXISTS phan_tram_lech_bac  numeric(6,2) NOT NULL DEFAULT 0
    CHECK (phan_tram_lech_bac  >= 0 AND phan_tram_lech_bac  <= 100),
  ADD COLUMN IF NOT EXISTS phan_tram_lech_nam  numeric(6,2) NOT NULL DEFAULT 0
    CHECK (phan_tram_lech_nam  >= 0 AND phan_tram_lech_nam  <= 100),
  ADD COLUMN IF NOT EXISTS phan_tram_lech_dong numeric(6,2) NOT NULL DEFAULT 0
    CHECK (phan_tram_lech_dong >= 0 AND phan_tram_lech_dong <= 100),
  ADD COLUMN IF NOT EXISTS phan_tram_lech_tay  numeric(6,2) NOT NULL DEFAULT 0
    CHECK (phan_tram_lech_tay  >= 0 AND phan_tram_lech_tay  <= 100);

COMMENT ON COLUMN tuyen.phan_tram_lech_bac  IS '% chênh lệch tuyến theo hướng Bắc; không nhập = 0';
COMMENT ON COLUMN tuyen.phan_tram_lech_nam  IS '% chênh lệch tuyến theo hướng Nam; không nhập = 0';
COMMENT ON COLUMN tuyen.phan_tram_lech_dong IS '% chênh lệch tuyến theo hướng Đông; không nhập = 0';
COMMENT ON COLUMN tuyen.phan_tram_lech_tay  IS '% chênh lệch tuyến theo hướng Tây; không nhập = 0';

ALTER TABLE tuyen_phien_ban
  ADD COLUMN IF NOT EXISTS phan_tram_lech_bac  numeric(6,2) NOT NULL DEFAULT 0
    CHECK (phan_tram_lech_bac  >= 0 AND phan_tram_lech_bac  <= 100),
  ADD COLUMN IF NOT EXISTS phan_tram_lech_nam  numeric(6,2) NOT NULL DEFAULT 0
    CHECK (phan_tram_lech_nam  >= 0 AND phan_tram_lech_nam  <= 100),
  ADD COLUMN IF NOT EXISTS phan_tram_lech_dong numeric(6,2) NOT NULL DEFAULT 0
    CHECK (phan_tram_lech_dong >= 0 AND phan_tram_lech_dong <= 100),
  ADD COLUMN IF NOT EXISTS phan_tram_lech_tay  numeric(6,2) NOT NULL DEFAULT 0
    CHECK (phan_tram_lech_tay  >= 0 AND phan_tram_lech_tay  <= 100);

COMMIT;
