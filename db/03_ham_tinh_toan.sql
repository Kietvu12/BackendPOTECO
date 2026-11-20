-- =====================================================================
-- POTECO - Phan mem khao sat tuyen cap
-- 03_ham_tinh_toan.sql : Ham tinh toan tham chieu (chay sau 01, 02)
--
-- Muc dich:
--   * Mot cong thuc duy nhat cho chieu dai tuyen / chieu dai cap, de
--     Android, Web va bao cao Excel cung ra mot ket qua (loi "chieu dai
--     tuyen sai" trong bien ban hop).
--   * Cap nhat cac cot cache cua bang tuyen (so_cot, chieu_dai_tuyen_m,
--     he_so_n, chieu_dai_cap_m). Cac cot nay KHONG tu cap nhat khi them/
--     sua cot; ung dung phai goi fn_tinh_lai_tuyen() trong cung giao dich
--     voi lenh luu (xem tai lieu muc 3.4, quy tac R4, R5, R10).
--
-- Cong thuc (quy tac R4):
--   * Khoang cach giua hai cot lien tiep = haversine, ban kinh 6371009 m
--     (cung ban kinh voi SphericalUtil cua Google Maps utils dang dung
--     tren Android).
--   * Chieu dai tuyen = tong khoang cach theo thu_tu cot, KHONG lam tron
--     tung doan; chi lam tron 2 chu so thap phan o ket qua cuoi.
--   * Chi tinh cot chua bi xoa mem (xoa_luc IS NULL).
-- =====================================================================

BEGIN;

CREATE FUNCTION fn_khoang_cach_m(lon1 numeric, lat1 numeric, lon2 numeric, lat2 numeric)
RETURNS double precision
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
    SELECT 2 * 6371009.0 * asin(sqrt(
               power(sin(radians((lat2 - lat1)::double precision) / 2), 2) +
               cos(radians(lat1::double precision)) * cos(radians(lat2::double precision)) *
               power(sin(radians((lon2 - lon1)::double precision) / 2), 2)
           ));
$$;

CREATE FUNCTION fn_chieu_dai_tuyen_m(p_tuyen_id uuid)
RETURNS numeric
LANGUAGE sql STABLE AS $$
    SELECT round(coalesce(sum(d.khoang_cach), 0)::numeric, 2)
    FROM (
        SELECT fn_khoang_cach_m(
                   lag(c.kinh_do) OVER w, lag(c.vi_do) OVER w,
                   c.kinh_do, c.vi_do) AS khoang_cach
        FROM cot c
        WHERE c.tuyen_id = p_tuyen_id AND c.xoa_luc IS NULL
        WINDOW w AS (ORDER BY c.thu_tu, c.tao_luc, c.id)
    ) d;
$$;

-- Tinh lai cac cot cache cua mot tuyen. Goi trong cung giao dich voi lenh luu.
-- he_so_n lay tu loai cong trinh hien tai cua tuyen; neu tuyen chua chon loai
-- cong trinh thi he_so_n va chieu_dai_cap_m de NULL (khong doan).
CREATE FUNCTION fn_tinh_lai_tuyen(p_tuyen_id uuid)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_so_cot  integer;
    v_chieu_dai numeric(12,2);
    v_n       numeric(6,3);
BEGIN
    SELECT count(*) INTO v_so_cot
      FROM cot WHERE tuyen_id = p_tuyen_id AND xoa_luc IS NULL;

    v_chieu_dai := fn_chieu_dai_tuyen_m(p_tuyen_id);

    SELECT l.he_so_n INTO v_n
      FROM tuyen t JOIN dm_loai_cong_trinh l ON l.id = t.loai_cong_trinh_id
     WHERE t.id = p_tuyen_id;

    UPDATE tuyen
       SET so_cot            = v_so_cot,
           chieu_dai_tuyen_m = v_chieu_dai,
           he_so_n           = v_n,
           chieu_dai_cap_m   = CASE WHEN v_n IS NULL THEN NULL
                                    ELSE round(v_chieu_dai * v_n, 2) END
     WHERE id = p_tuyen_id;
END;
$$;

COMMENT ON FUNCTION fn_tinh_lai_tuyen(uuid) IS
  'Tinh lai so_cot, chieu_dai_tuyen_m, he_so_n, chieu_dai_cap_m. Goi trong giao dich luu tuyen.';

COMMIT;
