--
-- PostgreSQL database dump
--


-- Dumped from database version 17.10
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: fn_chieu_dai_tuyen_m(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_chieu_dai_tuyen_m(p_tuyen_id uuid) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
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


--
-- Name: fn_khoang_cach_m(numeric, numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_khoang_cach_m(lon1 numeric, lat1 numeric, lon2 numeric, lat2 numeric) RETURNS double precision
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $$
    SELECT 2 * 6371009.0 * asin(sqrt(
               power(sin(radians((lat2 - lat1)::double precision) / 2), 2) +
               cos(radians(lat1::double precision)) * cos(radians(lat2::double precision)) *
               power(sin(radians((lon2 - lon1)::double precision) / 2), 2)
           ));
$$;


--
-- Name: fn_set_cap_nhat_luc(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_set_cap_nhat_luc() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.cap_nhat_luc := now();
    RETURN NEW;
END;
$$;


--
-- Name: fn_tinh_lai_tuyen(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_tinh_lai_tuyen(p_tuyen_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: FUNCTION fn_tinh_lai_tuyen(p_tuyen_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_tinh_lai_tuyen(p_tuyen_id uuid) IS 'Tinh lai so_cot, chieu_dai_tuyen_m, he_so_n, chieu_dai_cap_m. Goi trong giao dich luu tuyen.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: cau_hinh_he_thong; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cau_hinh_he_thong (
    khoa character varying(80) NOT NULL,
    gia_tri jsonb NOT NULL,
    mo_ta text,
    cap_nhat_luc timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tuyen_id uuid NOT NULL,
    thu_tu integer NOT NULL,
    ten_cot character varying(120) NOT NULL,
    ky_hieu character varying(60),
    so_thu_tu integer,
    dia_diem text,
    kinh_do numeric(10,7) NOT NULL,
    vi_do numeric(10,7) NOT NULL,
    cao_do_m numeric(8,2),
    ly_trinh character varying(60),
    hien_ly_trinh boolean DEFAULT false NOT NULL,
    nhan_doi_phu_kien boolean DEFAULT false NOT NULL,
    dat_bien_bao boolean DEFAULT false NOT NULL,
    hien_trang_cot character varying(2),
    ma_loai_cot character varying(30),
    chieu_cao_m numeric(4,1),
    hien_trang_vat_tu character varying(2),
    ma_vat_tu character varying(30),
    chung_loai_odf character varying(60),
    chung_loai_splitter character varying(60),
    hien_trang_be_cap character varying(2),
    ma_be_cap character varying(30),
    ma_phu_kien character varying(30),
    adss_treo_neo character varying(60),
    adss_udj character varying(60),
    adss_gong character varying(60),
    adss_chung_loai character varying(60),
    ac_treo_ham character varying(60),
    ac_de_u character varying(60),
    ac_dai character varying(60),
    ac_chung_loai character varying(60),
    nguon_diem character varying(20),
    thuoc_tinh_khac jsonb DEFAULT '{}'::jsonb NOT NULL,
    tao_boi uuid NOT NULL,
    tao_luc timestamp with time zone DEFAULT now() NOT NULL,
    cap_nhat_luc timestamp with time zone DEFAULT now() NOT NULL,
    xoa_luc timestamp with time zone,
    CONSTRAINT cot_hien_trang_be_cap_check CHECK (((hien_trang_be_cap)::text = ANY ((ARRAY['tm'::character varying, 'cs'::character varying])::text[]))),
    CONSTRAINT cot_hien_trang_cot_check CHECK (((hien_trang_cot)::text = ANY ((ARRAY['tm'::character varying, 'cs'::character varying])::text[]))),
    CONSTRAINT cot_hien_trang_vat_tu_check CHECK (((hien_trang_vat_tu)::text = ANY ((ARRAY['tm'::character varying, 'cs'::character varying])::text[]))),
    CONSTRAINT cot_kinh_do_check CHECK (((kinh_do >= ('-180'::integer)::numeric) AND (kinh_do <= (180)::numeric))),
    CONSTRAINT cot_nguon_diem_check CHECK (((nguon_diem)::text = ANY ((ARRAY['gps'::character varying, 'cham_ban_do'::character varying, 'keo_tha'::character varying, 'chen_giua'::character varying, 'nhap_kml'::character varying])::text[]))),
    CONSTRAINT cot_thu_tu_check CHECK ((thu_tu >= 1)),
    CONSTRAINT cot_vi_do_check CHECK (((vi_do >= ('-90'::integer)::numeric) AND (vi_do <= (90)::numeric)))
);


--
-- Name: COLUMN cot.thu_tu; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cot.thu_tu IS 'Thu tu cot trong tuyen. Khong rang buoc UNIQUE de doi cho/chen cot bang mot lenh UPDATE; ung dung giu thu tu lien tuc.';


--
-- Name: COLUMN cot.thuoc_tinh_khac; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cot.thuoc_tinh_khac IS 'Truong cu khong co trong mo hinh moi (vi du dinh dang JSON cu: HinhDangCot, BoTroNeo, DonViChuQuan ...), giu lai khi nhap de khong mat du lieu.';


--
-- Name: dm_be_cap; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dm_be_cap (
    ma character varying(30) NOT NULL,
    hien_trang character varying(2) NOT NULL,
    ten character varying(150),
    icon_key character varying(60),
    thu_tu smallint DEFAULT 0 NOT NULL,
    hoat_dong boolean DEFAULT true NOT NULL,
    ghi_chu text,
    CONSTRAINT dm_be_cap_hien_trang_check CHECK (((hien_trang)::text = ANY ((ARRAY['tm'::character varying, 'cs'::character varying])::text[])))
);


--
-- Name: dm_chieu_cao_cot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dm_chieu_cao_cot (
    gia_tri_m numeric(4,1) NOT NULL,
    ten character varying(10) NOT NULL,
    thu_tu smallint DEFAULT 0 NOT NULL,
    hoat_dong boolean DEFAULT true NOT NULL,
    CONSTRAINT dm_chieu_cao_cot_gia_tri_m_check CHECK ((gia_tri_m > (0)::numeric))
);


--
-- Name: dm_gia_tri; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dm_gia_tri (
    nhom character varying(40) NOT NULL,
    ma character varying(60) NOT NULL,
    ten character varying(120) NOT NULL,
    thu_tu smallint DEFAULT 0 NOT NULL,
    hoat_dong boolean DEFAULT true NOT NULL
);


--
-- Name: TABLE dm_gia_tri; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.dm_gia_tri IS 'Danh muc gia tri don gian, phan nhom theo cot nhom. Cot cot.* tham chieu bang ma, kiem tra o tang ung dung va view v_cot_sai_danh_muc.';


--
-- Name: dm_loai_cong_trinh; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dm_loai_cong_trinh (
    id smallint NOT NULL,
    ma character varying(40) NOT NULL,
    ten character varying(150) NOT NULL,
    he_so_n numeric(6,3) NOT NULL,
    hoat_dong boolean DEFAULT true NOT NULL,
    cap_nhat_boi uuid,
    cap_nhat_luc timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dm_loai_cong_trinh_he_so_n_check CHECK ((he_so_n > (0)::numeric))
);


--
-- Name: TABLE dm_loai_cong_trinh; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.dm_loai_cong_trinh IS 'Chi quan ly cap 2 tro len duoc sua (IV.2). He so n duoc chup lai vao tuyen_phien_ban khi luu.';


--
-- Name: dm_loai_cong_trinh_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.dm_loai_cong_trinh ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.dm_loai_cong_trinh_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: dm_loai_cot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dm_loai_cot (
    ma character varying(30) NOT NULL,
    hien_trang character varying(2) NOT NULL,
    ten character varying(150),
    icon_key character varying(60),
    thu_tu smallint DEFAULT 0 NOT NULL,
    hoat_dong boolean DEFAULT true NOT NULL,
    ghi_chu text,
    CONSTRAINT dm_loai_cot_hien_trang_check CHECK (((hien_trang)::text = ANY ((ARRAY['tm'::character varying, 'cs'::character varying])::text[])))
);


--
-- Name: COLUMN dm_loai_cot.hien_trang; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.dm_loai_cot.hien_trang IS 'tm = Trong moi, cs = Co san.';


--
-- Name: COLUMN dm_loai_cot.ten; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.dm_loai_cot.ten IS 'Ten hien thi. Chua co trong code, nghiep vu bo sung.';


--
-- Name: dm_phu_kien_cot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dm_phu_kien_cot (
    ma character varying(30) NOT NULL,
    ten character varying(150),
    icon_key character varying(60),
    thu_tu smallint DEFAULT 0 NOT NULL,
    hoat_dong boolean DEFAULT true NOT NULL,
    ghi_chu text
);


--
-- Name: dm_vat_tu; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dm_vat_tu (
    ma character varying(30) NOT NULL,
    hien_trang_ap_dung character varying(8) NOT NULL,
    ten character varying(150),
    icon_key character varying(60),
    thu_tu smallint DEFAULT 0 NOT NULL,
    hoat_dong boolean DEFAULT true NOT NULL,
    ghi_chu text,
    CONSTRAINT dm_vat_tu_hien_trang_ap_dung_check CHECK (((hien_trang_ap_dung)::text = ANY ((ARRAY['tm'::character varying, 'cs'::character varying, 'ca_hai'::character varying])::text[])))
);


--
-- Name: du_an; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.du_an (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cha_id uuid,
    ten character varying(200) NOT NULL,
    tao_boi uuid NOT NULL,
    tao_luc timestamp with time zone DEFAULT now() NOT NULL,
    cap_nhat_luc timestamp with time zone DEFAULT now() NOT NULL,
    xoa_luc timestamp with time zone,
    CONSTRAINT ck_du_an_khong_tu_cha CHECK (((cha_id IS NULL) OR (cha_id <> id)))
);


--
-- Name: duong; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.duong (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tuyen_id uuid NOT NULL,
    loai character varying(20) DEFAULT 'do_duong'::character varying NOT NULL,
    ten character varying(200),
    toa_do jsonb NOT NULL,
    mau character varying(9),
    do_day smallint,
    tao_luc timestamp with time zone DEFAULT now() NOT NULL,
    cap_nhat_luc timestamp with time zone DEFAULT now() NOT NULL,
    xoa_luc timestamp with time zone,
    CONSTRAINT duong_do_day_check CHECK ((do_day > 0)),
    CONSTRAINT duong_loai_check CHECK (((loai)::text = ANY ((ARRAY['do_duong'::character varying, 've_tay'::character varying])::text[]))),
    CONSTRAINT duong_toa_do_check CHECK ((jsonb_typeof(toa_do) = 'array'::text))
);


--
-- Name: nhat_ky_thao_tac; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nhat_ky_thao_tac (
    id bigint NOT NULL,
    tai_khoan_id uuid NOT NULL,
    thiet_bi_id uuid,
    tuyen_id uuid,
    phien_ban_id uuid,
    hanh_dong character varying(20) NOT NULL,
    loai_luu character varying(20),
    thoi_gian_thiet_bi timestamp with time zone,
    thoi_gian_server timestamp with time zone DEFAULT now() NOT NULL,
    gps_kinh_do numeric(10,7),
    gps_vi_do numeric(10,7),
    gps_do_chinh_xac_m real,
    nguon_diem character varying(20),
    chi_tiet jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT nhat_ky_thao_tac_gps_do_chinh_xac_m_check CHECK ((gps_do_chinh_xac_m >= (0)::double precision)),
    CONSTRAINT nhat_ky_thao_tac_gps_kinh_do_check CHECK (((gps_kinh_do >= ('-180'::integer)::numeric) AND (gps_kinh_do <= (180)::numeric))),
    CONSTRAINT nhat_ky_thao_tac_gps_vi_do_check CHECK (((gps_vi_do >= ('-90'::integer)::numeric) AND (gps_vi_do <= (90)::numeric))),
    CONSTRAINT nhat_ky_thao_tac_hanh_dong_check CHECK (((hanh_dong)::text = ANY ((ARRAY['tao'::character varying, 'luu'::character varying, 'sua'::character varying, 'gui'::character varying, 'dong_bo'::character varying])::text[]))),
    CONSTRAINT nhat_ky_thao_tac_loai_luu_check CHECK (((loai_luu)::text = ANY ((ARRAY['hien_truong'::character varying, 'chinh_sua_sau'::character varying])::text[]))),
    CONSTRAINT nhat_ky_thao_tac_nguon_diem_check CHECK (((nguon_diem)::text = ANY ((ARRAY['gps'::character varying, 'cham_ban_do'::character varying, 'keo_tha'::character varying, 'chen_giua'::character varying, 'nhap_kml'::character varying])::text[])))
);


--
-- Name: COLUMN nhat_ky_thao_tac.hanh_dong; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.nhat_ky_thao_tac.hanh_dong IS 'Dung 5 hanh dong cua bao gia: tao, luu, sua, gui, dong_bo.';


--
-- Name: COLUMN nhat_ky_thao_tac.thoi_gian_thiet_bi; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.nhat_ky_thao_tac.thoi_gian_thiet_bi IS 'Gio tren thiet bi luc thao tac; khac thoi_gian_server (gio dong bo len Cloud) - III.1.';


--
-- Name: nhat_ky_thao_tac_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.nhat_ky_thao_tac ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.nhat_ky_thao_tac_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: phien_dang_nhap; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.phien_dang_nhap (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tai_khoan_id uuid NOT NULL,
    thiet_bi_id uuid,
    ma_bam character(64) NOT NULL,
    tao_luc timestamp with time zone DEFAULT now() NOT NULL,
    het_han_luc timestamp with time zone NOT NULL,
    thu_hoi_luc timestamp with time zone,
    CONSTRAINT ck_phien_dang_nhap_han CHECK ((het_han_luc > tao_luc))
);


--
-- Name: TABLE phien_dang_nhap; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.phien_dang_nhap IS 'Refresh token. ma_bam la SHA-256 cua token; token goc khong duoc luu.';


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    ten text NOT NULL,
    chay_luc timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tai_khoan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tai_khoan (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ten_dang_nhap character varying(60) NOT NULL,
    mat_khau_hash text NOT NULL,
    ho_ten character varying(150) NOT NULL,
    vai_tro_id smallint NOT NULL,
    quan_ly_id uuid,
    hoat_dong boolean DEFAULT true NOT NULL,
    tao_luc timestamp with time zone DEFAULT now() NOT NULL,
    cap_nhat_luc timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_tai_khoan_khong_tu_quan_ly CHECK (((quan_ly_id IS NULL) OR (quan_ly_id <> id)))
);


--
-- Name: COLUMN tai_khoan.quan_ly_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tai_khoan.quan_ly_id IS 'Quan ly truc tiep; dung de dung cay cap quan ly khi phan quyen xem lich su.';


--
-- Name: thiet_bi; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.thiet_bi (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tai_khoan_id uuid NOT NULL,
    ma_thiet_bi character varying(100) NOT NULL,
    ten character varying(150),
    kich_hoat_luc timestamp with time zone DEFAULT now() NOT NULL,
    het_han_luc timestamp with time zone,
    hoat_dong boolean DEFAULT true NOT NULL
);


--
-- Name: TABLE thiet_bi; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.thiet_bi IS 'Thiet bi Android. Thay the co che key kich hoat theo thiet bi dang luu trong file tren may.';


--
-- Name: track_diem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.track_diem (
    id bigint NOT NULL,
    tuyen_id uuid NOT NULL,
    thu_tu integer NOT NULL,
    kinh_do numeric(10,7) NOT NULL,
    vi_do numeric(10,7) NOT NULL,
    thoi_gian timestamp with time zone,
    do_chinh_xac_m real,
    nguon character varying(20),
    CONSTRAINT track_diem_do_chinh_xac_m_check CHECK ((do_chinh_xac_m >= (0)::double precision)),
    CONSTRAINT track_diem_kinh_do_check CHECK (((kinh_do >= ('-180'::integer)::numeric) AND (kinh_do <= (180)::numeric))),
    CONSTRAINT track_diem_nguon_check CHECK (((nguon)::text = ANY ((ARRAY['gps'::character varying, 'network'::character varying, 'fused'::character varying])::text[]))),
    CONSTRAINT track_diem_thu_tu_check CHECK ((thu_tu >= 1)),
    CONSTRAINT track_diem_vi_do_check CHECK (((vi_do >= ('-90'::integer)::numeric) AND (vi_do <= (90)::numeric)))
);


--
-- Name: track_diem_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.track_diem ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.track_diem_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tuyen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tuyen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    du_an_id uuid,
    ten_tuyen character varying(200) NOT NULL,
    loai_cong_trinh_id smallint,
    so_cot integer DEFAULT 0 NOT NULL,
    chieu_dai_tuyen_m numeric(12,2),
    he_so_n numeric(6,3),
    chieu_dai_cap_m numeric(12,2),
    trang_thai character varying(20) DEFAULT 'dang_khao_sat'::character varying NOT NULL,
    hoan_thien_luc timestamp with time zone,
    phien_ban_hien_tai integer DEFAULT 0 NOT NULL,
    nguon_tao character varying(20) DEFAULT 'android'::character varying NOT NULL,
    tao_boi uuid NOT NULL,
    tao_luc timestamp with time zone DEFAULT now() NOT NULL,
    cap_nhat_luc timestamp with time zone DEFAULT now() NOT NULL,
    xoa_luc timestamp with time zone,
    CONSTRAINT ck_tuyen_hoan_thien CHECK ((((trang_thai)::text = 'hoan_thien'::text) = (hoan_thien_luc IS NOT NULL))),
    CONSTRAINT tuyen_chieu_dai_cap_m_check CHECK ((chieu_dai_cap_m >= (0)::numeric)),
    CONSTRAINT tuyen_chieu_dai_tuyen_m_check CHECK ((chieu_dai_tuyen_m >= (0)::numeric)),
    CONSTRAINT tuyen_he_so_n_check CHECK ((he_so_n > (0)::numeric)),
    CONSTRAINT tuyen_nguon_tao_check CHECK (((nguon_tao)::text = ANY ((ARRAY['android'::character varying, 'web'::character varying, 'nhap_kml'::character varying])::text[]))),
    CONSTRAINT tuyen_phien_ban_hien_tai_check CHECK ((phien_ban_hien_tai >= 0)),
    CONSTRAINT tuyen_so_cot_check CHECK ((so_cot >= 0)),
    CONSTRAINT tuyen_trang_thai_check CHECK (((trang_thai)::text = ANY ((ARRAY['dang_khao_sat'::character varying, 'hoan_thien'::character varying])::text[])))
);


--
-- Name: COLUMN tuyen.chieu_dai_tuyen_m; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tuyen.chieu_dai_tuyen_m IS 'Gia tri tinh san (cache). Quy tac tinh xem tai lieu muc 3.4 (R4).';


--
-- Name: COLUMN tuyen.he_so_n; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tuyen.he_so_n IS 'He so n dang ap dung, lay tu loai cong trinh tai luc luu gan nhat.';


--
-- Name: tuyen_phien_ban; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tuyen_phien_ban (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tuyen_id uuid NOT NULL,
    so_phien_ban integer NOT NULL,
    loai_luu character varying(20) NOT NULL,
    la_ban_hoan_thien boolean DEFAULT false NOT NULL,
    tai_khoan_id uuid NOT NULL,
    thiet_bi_id uuid,
    thoi_gian_thiet_bi timestamp with time zone,
    thoi_gian_server timestamp with time zone DEFAULT now() NOT NULL,
    gps_kinh_do numeric(10,7),
    gps_vi_do numeric(10,7),
    gps_do_chinh_xac_m real,
    so_cot integer DEFAULT 0 NOT NULL,
    chieu_dai_tuyen_m numeric(12,2),
    loai_cong_trinh_id smallint,
    he_so_n numeric(6,3),
    chieu_dai_cap_m numeric(12,2),
    so_cot_them integer DEFAULT 0 NOT NULL,
    so_cot_sua integer DEFAULT 0 NOT NULL,
    so_cot_xoa integer DEFAULT 0 NOT NULL,
    hinh_dang jsonb NOT NULL,
    du_lieu_cot jsonb NOT NULL,
    ma_yeu_cau uuid,
    CONSTRAINT tuyen_phien_ban_gps_do_chinh_xac_m_check CHECK ((gps_do_chinh_xac_m >= (0)::double precision)),
    CONSTRAINT tuyen_phien_ban_gps_kinh_do_check CHECK (((gps_kinh_do >= ('-180'::integer)::numeric) AND (gps_kinh_do <= (180)::numeric))),
    CONSTRAINT tuyen_phien_ban_gps_vi_do_check CHECK (((gps_vi_do >= ('-90'::integer)::numeric) AND (gps_vi_do <= (90)::numeric))),
    CONSTRAINT tuyen_phien_ban_loai_luu_check CHECK (((loai_luu)::text = ANY ((ARRAY['hien_truong'::character varying, 'chinh_sua_sau'::character varying])::text[]))),
    CONSTRAINT tuyen_phien_ban_so_phien_ban_check CHECK ((so_phien_ban >= 1))
);


--
-- Name: COLUMN tuyen_phien_ban.loai_luu; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tuyen_phien_ban.loai_luu IS 'hien_truong = luu khi dang khao sat; chinh_sua_sau = sua lai sau do (III.4).';


--
-- Name: COLUMN tuyen_phien_ban.hinh_dang; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tuyen_phien_ban.hinh_dang IS 'Hinh dang tuyen tai thoi diem luu: day toa do cot theo thu tu, cac duong, track (III.2, III.3).';


--
-- Name: COLUMN tuyen_phien_ban.du_lieu_cot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tuyen_phien_ban.du_lieu_cot IS 'Toan bo thuoc tinh cot tai thoi diem luu, de xem lai va doi chieu khi du lieu hien tai bi sua.';


--
-- Name: COLUMN tuyen_phien_ban.ma_yeu_cau; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tuyen_phien_ban.ma_yeu_cau IS 'Ma yeu cau do ung dung gui (UUID). Gui lai cung ma tren cung tuyen thi tra ve phien ban da co.';


--
-- Name: v_cot_sai_danh_muc; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_cot_sai_danh_muc AS
 SELECT c.id AS cot_id,
    c.tuyen_id,
    'chung_loai_odf'::text AS truong,
    c.chung_loai_odf AS gia_tri
   FROM public.cot c
  WHERE ((c.xoa_luc IS NULL) AND (c.chung_loai_odf IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
           FROM public.dm_gia_tri g
          WHERE (((g.nhom)::text = 'chung_loai_odf'::text) AND ((g.ma)::text = (c.chung_loai_odf)::text))))))
UNION ALL
 SELECT c.id AS cot_id,
    c.tuyen_id,
    'chung_loai_splitter'::text AS truong,
    c.chung_loai_splitter AS gia_tri
   FROM public.cot c
  WHERE ((c.xoa_luc IS NULL) AND (c.chung_loai_splitter IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
           FROM public.dm_gia_tri g
          WHERE (((g.nhom)::text = 'chung_loai_splitter'::text) AND ((g.ma)::text = (c.chung_loai_splitter)::text))))))
UNION ALL
 SELECT c.id AS cot_id,
    c.tuyen_id,
    'adss_treo_neo'::text AS truong,
    c.adss_treo_neo AS gia_tri
   FROM public.cot c
  WHERE ((c.xoa_luc IS NULL) AND (c.adss_treo_neo IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
           FROM public.dm_gia_tri g
          WHERE (((g.nhom)::text = 'treo_neo'::text) AND ((g.ma)::text = (c.adss_treo_neo)::text))))))
UNION ALL
 SELECT c.id AS cot_id,
    c.tuyen_id,
    'adss_udj'::text AS truong,
    c.adss_udj AS gia_tri
   FROM public.cot c
  WHERE ((c.xoa_luc IS NULL) AND (c.adss_udj IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
           FROM public.dm_gia_tri g
          WHERE (((g.nhom)::text = 'udj'::text) AND ((g.ma)::text = (c.adss_udj)::text))))))
UNION ALL
 SELECT c.id AS cot_id,
    c.tuyen_id,
    'adss_gong'::text AS truong,
    c.adss_gong AS gia_tri
   FROM public.cot c
  WHERE ((c.xoa_luc IS NULL) AND (c.adss_gong IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
           FROM public.dm_gia_tri g
          WHERE (((g.nhom)::text = 'gong'::text) AND ((g.ma)::text = (c.adss_gong)::text))))))
UNION ALL
 SELECT c.id AS cot_id,
    c.tuyen_id,
    'adss_chung_loai'::text AS truong,
    c.adss_chung_loai AS gia_tri
   FROM public.cot c
  WHERE ((c.xoa_luc IS NULL) AND (c.adss_chung_loai IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
           FROM public.dm_gia_tri g
          WHERE (((g.nhom)::text = 'chung_loai_cap'::text) AND ((g.ma)::text = (c.adss_chung_loai)::text))))))
UNION ALL
 SELECT c.id AS cot_id,
    c.tuyen_id,
    'ac_treo_ham'::text AS truong,
    c.ac_treo_ham AS gia_tri
   FROM public.cot c
  WHERE ((c.xoa_luc IS NULL) AND (c.ac_treo_ham IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
           FROM public.dm_gia_tri g
          WHERE (((g.nhom)::text = 'treo_ham'::text) AND ((g.ma)::text = (c.ac_treo_ham)::text))))))
UNION ALL
 SELECT c.id AS cot_id,
    c.tuyen_id,
    'ac_de_u'::text AS truong,
    c.ac_de_u AS gia_tri
   FROM public.cot c
  WHERE ((c.xoa_luc IS NULL) AND (c.ac_de_u IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
           FROM public.dm_gia_tri g
          WHERE (((g.nhom)::text = 'de_u'::text) AND ((g.ma)::text = (c.ac_de_u)::text))))))
UNION ALL
 SELECT c.id AS cot_id,
    c.tuyen_id,
    'ac_dai'::text AS truong,
    c.ac_dai AS gia_tri
   FROM public.cot c
  WHERE ((c.xoa_luc IS NULL) AND (c.ac_dai IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
           FROM public.dm_gia_tri g
          WHERE (((g.nhom)::text = 'dai'::text) AND ((g.ma)::text = (c.ac_dai)::text))))))
UNION ALL
 SELECT c.id AS cot_id,
    c.tuyen_id,
    'ac_chung_loai'::text AS truong,
    c.ac_chung_loai AS gia_tri
   FROM public.cot c
  WHERE ((c.xoa_luc IS NULL) AND (c.ac_chung_loai IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
           FROM public.dm_gia_tri g
          WHERE (((g.nhom)::text = 'chung_loai_cap'::text) AND ((g.ma)::text = (c.ac_chung_loai)::text))))));


--
-- Name: v_tuyen_luu_cuoi_trong_ngay; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_tuyen_luu_cuoi_trong_ngay AS
 SELECT DISTINCT ON (tai_khoan_id, (((thoi_gian_server AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::date)) tai_khoan_id,
    ((thoi_gian_server AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::date AS ngay,
    tuyen_id,
    id AS phien_ban_id,
    so_phien_ban,
    loai_luu,
    thoi_gian_thiet_bi,
    thoi_gian_server
   FROM public.tuyen_phien_ban pb
  ORDER BY tai_khoan_id, (((thoi_gian_server AT TIME ZONE 'Asia/Ho_Chi_Minh'::text))::date), thoi_gian_server DESC;


--
-- Name: vai_tro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vai_tro (
    id smallint NOT NULL,
    ma character varying(40) NOT NULL,
    ten character varying(120) NOT NULL,
    cap_quan_ly smallint DEFAULT 0 NOT NULL,
    la_ke_toan boolean DEFAULT false NOT NULL,
    ghi_chu text,
    CONSTRAINT vai_tro_cap_quan_ly_check CHECK ((cap_quan_ly >= 0))
);


--
-- Name: TABLE vai_tro; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.vai_tro IS 'Vai tro nguoi dung. cap_quan_ly: 0 = nhan vien; >= 1 la cac cap quan ly.';


--
-- Name: COLUMN vai_tro.la_ke_toan; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.vai_tro.la_ke_toan IS 'Ke toan duoc xem track log thoi gian hoan thien tuyen (III.6).';


--
-- Name: vai_tro_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.vai_tro ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.vai_tro_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Data for Name: cau_hinh_he_thong; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cau_hinh_he_thong (khoa, gia_tri, mo_ta, cap_nhat_luc) FROM stdin;
nhat_ky.luu_tru_ngay	30	So ngay giu nhat_ky_thao_tac (III.7 - luu tru lich su 1 thang). Can xac nhan pham vi ap dung.	2026-11-20 11:15:13.07186+07
he_thong.mui_gio	"Asia/Ho_Chi_Minh"	Mui gio dung de tinh "ngay" trong tra cuu lich su.	2026-11-20 11:15:13.07186+07
\.


--
-- Data for Name: cot; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cot (id, tuyen_id, thu_tu, ten_cot, ky_hieu, so_thu_tu, dia_diem, kinh_do, vi_do, cao_do_m, ly_trinh, hien_ly_trinh, nhan_doi_phu_kien, dat_bien_bao, hien_trang_cot, ma_loai_cot, chieu_cao_m, hien_trang_vat_tu, ma_vat_tu, chung_loai_odf, chung_loai_splitter, hien_trang_be_cap, ma_be_cap, ma_phu_kien, adss_treo_neo, adss_udj, adss_gong, adss_chung_loai, ac_treo_ham, ac_de_u, ac_dai, ac_chung_loai, nguon_diem, thuoc_tinh_khac, tao_boi, tao_luc, cap_nhat_luc, xoa_luc) FROM stdin;
\.


--
-- Data for Name: dm_be_cap; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dm_be_cap (ma, hien_trang, ten, icon_key, thu_tu, hoat_dong, ghi_chu) FROM stdin;
bc1_cs	cs	\N	bc1_cs	1	t	\N
bc2_cs	cs	\N	bc2_cs	2	t	\N
bc3_cs	cs	\N	bc3_cs	3	t	\N
bc1_m	tm	\N	bc1_m	4	t	Chi co tren web; Android chua co.
bc2_m	tm	\N	bc2_m	5	t	Chi co tren web; Android chua co.
bc3_m	tm	\N	bc3_m	6	t	Chi co tren web; Android chua co.
\.


--
-- Data for Name: dm_chieu_cao_cot; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dm_chieu_cao_cot (gia_tri_m, ten, thu_tu, hoat_dong) FROM stdin;
6.0	6m	1	t
6.5	6.5m	2	t
7.0	7m	3	t
7.5	7.5m	4	t
8.0	8m	5	t
8.5	8.5m	6	t
10.0	10m	7	t
12.0	12m	8	t
\.


--
-- Data for Name: dm_gia_tri; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dm_gia_tri (nhom, ma, ten, thu_tu, hoat_dong) FROM stdin;
chung_loai_odf	6Fo	6Fo	1	t
chung_loai_odf	12Fo	12Fo	2	t
chung_loai_odf	24Fo	24Fo	3	t
chung_loai_odf	48Fo	48Fo	4	t
chung_loai_odf	96Fo	96Fo	5	t
chung_loai_splitter	1:2	1:2	1	t
chung_loai_splitter	1:4	1:4	2	t
chung_loai_splitter	1:8	1:8	3	t
chung_loai_splitter	1:16	1:16	4	t
treo_neo	Treo	Treo	1	t
treo_neo	Néo	Néo	2	t
treo_neo	Néo 2 hướng	Néo 2 hướng	3	t
udj	Đế U	Đế U	1	t
udj	Đai	Đai	2	t
udj	Móc J	Móc J	3	t
gong	Gông C1	Gông C1	1	t
gong	Gông G0	Gông G0	2	t
chung_loai_cap	KV100	KV100	1	t
chung_loai_cap	KV200	KV200	2	t
chung_loai_cap	KV300	KV300	3	t
chung_loai_cap	KV400	KV400	4	t
chung_loai_cap	KV500	KV500	5	t
chung_loai_cap	KV600	KV600	6	t
treo_ham	Treo	Treo	1	t
treo_ham	Hãm	Hãm	2	t
de_u	Đế U	Đế U	1	t
dai	Đai	Đai	1	t
\.


--
-- Data for Name: dm_loai_cong_trinh; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dm_loai_cong_trinh (id, ma, ten, he_so_n, hoat_dong, cap_nhat_boi, cap_nhat_luc) FROM stdin;
\.


--
-- Data for Name: dm_loai_cot; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dm_loai_cot (ma, hien_trang, ten, icon_key, thu_tu, hoat_dong, ghi_chu) FROM stdin;
2lt_tm	tm	\N	2lt_tm	1	t	\N
2v_tm	tm	\N	2v_tm	2	t	\N
s_tm	tm	\N	s_tm	3	t	\N
v_tm	tm	\N	v_tm	4	t	\N
lt_tm	tm	\N	lt_tm	5	t	\N
b_lt	tm	\N	b_lt	6	t	\N
b_2lt	tm	\N	b_2lt	7	t	\N
b_v	tm	\N	b_v	8	t	\N
b_2v	tm	\N	b_2v	9	t	\N
v_cs_cn	cs	\N	v_cs_cn	10	t	\N
2v_cs_cn	cs	\N	2v_cs_cn	11	t	\N
lt_cs_cn	cs	\N	lt_cs_cn	12	t	\N
2lt_cs_cn	cs	\N	2lt_cs_cn	13	t	\N
b_v_cn	cs	\N	b_v_cn	14	t	\N
b_2v_cn	cs	\N	b_2v_cn	15	t	\N
b_lt_cn	cs	\N	b_lt_cn	16	t	\N
b_2lt_cn	cs	\N	b_2lt_cn	17	t	\N
lt_cs	cs	\N	lt_cs	18	t	\N
2lt_cs	cs	\N	2lt_cs	19	t	\N
v_cs	cs	\N	v_cs	20	t	\N
2v_cs	cs	\N	2v_cs	21	t	\N
dl_lt	cs	\N	dl_lt	22	t	\N
dl_2lt	cs	\N	dl_2lt	23	t	\N
dl_v	cs	\N	dl_v	24	t	\N
dl_2v	cs	\N	dl_2v	25	t	\N
s_cs	cs	\N	s_cs	26	t	\N
vt_lt	cs	\N	vt_lt	27	t	\N
vt_v	cs	\N	vt_v	28	t	\N
\.


--
-- Data for Name: dm_phu_kien_cot; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dm_phu_kien_cot (ma, ten, icon_key, thu_tu, hoat_dong, ghi_chu) FROM stdin;
duphong	\N	\N	1	t	\N
satnoi	\N	satnoi	2	t	\N
chinhnghieng	\N	\N	3	t	Chi co tren web; Android chua co.
rr	\N	rr	4	f	Chi co anh trong Const_Images.js, khong co trong form nao. Tam tat.
\.


--
-- Data for Name: dm_vat_tu; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dm_vat_tu (ma, hien_trang_ap_dung, ten, icon_key, thu_tu, hoat_dong, ghi_chu) FROM stdin;
ms_m	tm	\N	ms_m	1	t	\N
odf_indoor	tm	\N	odf_indoor	2	t	\N
odf_outdoor_m	tm	\N	odf_outdoor_m	3	t	\N
odfs1_m	tm	\N	odfs1_m	4	t	\N
s1s2_m	tm	\N	s1s2_m	5	t	\N
s1s3_m	tm	\N	s1s3_m	6	t	\N
s2_m	tm	\N	s2_m	7	t	\N
ms_cs	cs	\N	ms_cs	8	t	\N
odf_outdoor_cs	cs	\N	odf_outdoor_cs	9	t	\N
odfs1_cs	cs	\N	odfs1_cs	10	t	\N
s1_m_s2_cs	ca_hai	\N	s1_m_s2_cs	11	t	Web chi xep o Co san; Android co mat o CA HAI danh sach (Trong moi va Co san). De ca_hai cho den khi nghiep vu chot.
s1s2_cs	cs	\N	s1s2_cs	12	t	\N
s2_cs	cs	\N	s2_cs	13	t	\N
\.


--
-- Data for Name: du_an; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.du_an (id, cha_id, ten, tao_boi, tao_luc, cap_nhat_luc, xoa_luc) FROM stdin;
\.


--
-- Data for Name: duong; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.duong (id, tuyen_id, loai, ten, toa_do, mau, do_day, tao_luc, cap_nhat_luc, xoa_luc) FROM stdin;
\.


--
-- Data for Name: nhat_ky_thao_tac; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.nhat_ky_thao_tac (id, tai_khoan_id, thiet_bi_id, tuyen_id, phien_ban_id, hanh_dong, loai_luu, thoi_gian_thiet_bi, thoi_gian_server, gps_kinh_do, gps_vi_do, gps_do_chinh_xac_m, nguon_diem, chi_tiet) FROM stdin;
\.


--
-- Data for Name: phien_dang_nhap; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.phien_dang_nhap (id, tai_khoan_id, thiet_bi_id, ma_bam, tao_luc, het_han_luc, thu_hoi_luc) FROM stdin;
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.schema_migrations (ten, chay_luc) FROM stdin;
01_schema.sql	2026-11-20 11:15:13.061674+07
02_seed_danh_muc.sql	2026-11-20 11:15:13.083371+07
03_ham_tinh_toan.sql	2026-11-20 11:15:13.086393+07
04_backend_bo_sung.sql	2026-11-20 11:15:13.093224+07
\.


--
-- Data for Name: tai_khoan; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tai_khoan (id, ten_dang_nhap, mat_khau_hash, ho_ten, vai_tro_id, quan_ly_id, hoat_dong, tao_luc, cap_nhat_luc) FROM stdin;
6bef9f3b-174f-4072-99fa-dad4bb140fe9	he_thong	!	Hệ thống (dữ liệu di chuyển)	1	\N	f	2026-11-20 11:15:13.07186+07	2026-11-20 11:15:13.07186+07
\.


--
-- Data for Name: thiet_bi; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.thiet_bi (id, tai_khoan_id, ma_thiet_bi, ten, kich_hoat_luc, het_han_luc, hoat_dong) FROM stdin;
\.


--
-- Data for Name: track_diem; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.track_diem (id, tuyen_id, thu_tu, kinh_do, vi_do, thoi_gian, do_chinh_xac_m, nguon) FROM stdin;
\.


--
-- Data for Name: tuyen; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tuyen (id, du_an_id, ten_tuyen, loai_cong_trinh_id, so_cot, chieu_dai_tuyen_m, he_so_n, chieu_dai_cap_m, trang_thai, hoan_thien_luc, phien_ban_hien_tai, nguon_tao, tao_boi, tao_luc, cap_nhat_luc, xoa_luc) FROM stdin;
\.


--
-- Data for Name: tuyen_phien_ban; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tuyen_phien_ban (id, tuyen_id, so_phien_ban, loai_luu, la_ban_hoan_thien, tai_khoan_id, thiet_bi_id, thoi_gian_thiet_bi, thoi_gian_server, gps_kinh_do, gps_vi_do, gps_do_chinh_xac_m, so_cot, chieu_dai_tuyen_m, loai_cong_trinh_id, he_so_n, chieu_dai_cap_m, so_cot_them, so_cot_sua, so_cot_xoa, hinh_dang, du_lieu_cot, ma_yeu_cau) FROM stdin;
\.


--
-- Data for Name: vai_tro; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.vai_tro (id, ma, ten, cap_quan_ly, la_ke_toan, ghi_chu) FROM stdin;
1	nhan_vien	Nhân viên khảo sát	0	f	Tam thoi
2	quan_ly_cap_1	Quản lý cấp 1	1	f	Tam thoi
3	quan_ly_cap_2	Quản lý cấp 2	2	f	Tam thoi; duoc thiet lap loai cong trinh va he so n
4	ke_toan	Kế toán	0	t	Tam thoi; xem track log thoi gian hoan thien tuyen
5	quan_tri	Quản trị hệ thống	9	f	Tam thoi; tao tai khoan, sua danh muc, cau hinh he thong
\.


--
-- Name: dm_loai_cong_trinh_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.dm_loai_cong_trinh_id_seq', 1, false);


--
-- Name: nhat_ky_thao_tac_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.nhat_ky_thao_tac_id_seq', 1, false);


--
-- Name: track_diem_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.track_diem_id_seq', 1, false);


--
-- Name: vai_tro_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.vai_tro_id_seq', 5, true);


--
-- Name: cau_hinh_he_thong cau_hinh_he_thong_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cau_hinh_he_thong
    ADD CONSTRAINT cau_hinh_he_thong_pkey PRIMARY KEY (khoa);


--
-- Name: cot cot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cot
    ADD CONSTRAINT cot_pkey PRIMARY KEY (id);


--
-- Name: dm_be_cap dm_be_cap_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_be_cap
    ADD CONSTRAINT dm_be_cap_pkey PRIMARY KEY (ma);


--
-- Name: dm_chieu_cao_cot dm_chieu_cao_cot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_chieu_cao_cot
    ADD CONSTRAINT dm_chieu_cao_cot_pkey PRIMARY KEY (gia_tri_m);


--
-- Name: dm_gia_tri dm_gia_tri_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_gia_tri
    ADD CONSTRAINT dm_gia_tri_pkey PRIMARY KEY (nhom, ma);


--
-- Name: dm_loai_cong_trinh dm_loai_cong_trinh_ma_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_loai_cong_trinh
    ADD CONSTRAINT dm_loai_cong_trinh_ma_key UNIQUE (ma);


--
-- Name: dm_loai_cong_trinh dm_loai_cong_trinh_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_loai_cong_trinh
    ADD CONSTRAINT dm_loai_cong_trinh_pkey PRIMARY KEY (id);


--
-- Name: dm_loai_cot dm_loai_cot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_loai_cot
    ADD CONSTRAINT dm_loai_cot_pkey PRIMARY KEY (ma);


--
-- Name: dm_phu_kien_cot dm_phu_kien_cot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_phu_kien_cot
    ADD CONSTRAINT dm_phu_kien_cot_pkey PRIMARY KEY (ma);


--
-- Name: dm_vat_tu dm_vat_tu_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_vat_tu
    ADD CONSTRAINT dm_vat_tu_pkey PRIMARY KEY (ma);


--
-- Name: du_an du_an_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.du_an
    ADD CONSTRAINT du_an_pkey PRIMARY KEY (id);


--
-- Name: duong duong_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duong
    ADD CONSTRAINT duong_pkey PRIMARY KEY (id);


--
-- Name: nhat_ky_thao_tac nhat_ky_thao_tac_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nhat_ky_thao_tac
    ADD CONSTRAINT nhat_ky_thao_tac_pkey PRIMARY KEY (id);


--
-- Name: phien_dang_nhap phien_dang_nhap_ma_bam_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phien_dang_nhap
    ADD CONSTRAINT phien_dang_nhap_ma_bam_key UNIQUE (ma_bam);


--
-- Name: phien_dang_nhap phien_dang_nhap_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phien_dang_nhap
    ADD CONSTRAINT phien_dang_nhap_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (ten);


--
-- Name: tai_khoan tai_khoan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tai_khoan
    ADD CONSTRAINT tai_khoan_pkey PRIMARY KEY (id);


--
-- Name: thiet_bi thiet_bi_ma_thiet_bi_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thiet_bi
    ADD CONSTRAINT thiet_bi_ma_thiet_bi_key UNIQUE (ma_thiet_bi);


--
-- Name: thiet_bi thiet_bi_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thiet_bi
    ADD CONSTRAINT thiet_bi_pkey PRIMARY KEY (id);


--
-- Name: track_diem track_diem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track_diem
    ADD CONSTRAINT track_diem_pkey PRIMARY KEY (id);


--
-- Name: tuyen_phien_ban tuyen_phien_ban_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tuyen_phien_ban
    ADD CONSTRAINT tuyen_phien_ban_pkey PRIMARY KEY (id);


--
-- Name: tuyen_phien_ban tuyen_phien_ban_tuyen_id_so_phien_ban_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tuyen_phien_ban
    ADD CONSTRAINT tuyen_phien_ban_tuyen_id_so_phien_ban_key UNIQUE (tuyen_id, so_phien_ban);


--
-- Name: tuyen tuyen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tuyen
    ADD CONSTRAINT tuyen_pkey PRIMARY KEY (id);


--
-- Name: vai_tro vai_tro_ma_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vai_tro
    ADD CONSTRAINT vai_tro_ma_key UNIQUE (ma);


--
-- Name: vai_tro vai_tro_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vai_tro
    ADD CONSTRAINT vai_tro_pkey PRIMARY KEY (id);


--
-- Name: ix_cot_ma_loai_cot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cot_ma_loai_cot ON public.cot USING btree (ma_loai_cot);


--
-- Name: ix_cot_ma_vat_tu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cot_ma_vat_tu ON public.cot USING btree (ma_vat_tu);


--
-- Name: ix_cot_tuyen_thu_tu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cot_tuyen_thu_tu ON public.cot USING btree (tuyen_id, thu_tu) WHERE (xoa_luc IS NULL);


--
-- Name: ix_du_an_cha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_du_an_cha ON public.du_an USING btree (cha_id);


--
-- Name: ix_duong_tuyen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_duong_tuyen ON public.duong USING btree (tuyen_id) WHERE (xoa_luc IS NULL);


--
-- Name: ix_nhat_ky_tai_khoan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_nhat_ky_tai_khoan ON public.nhat_ky_thao_tac USING btree (tai_khoan_id, thoi_gian_server DESC);


--
-- Name: ix_nhat_ky_thoi_gian; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_nhat_ky_thoi_gian ON public.nhat_ky_thao_tac USING btree (thoi_gian_server);


--
-- Name: ix_nhat_ky_tuyen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_nhat_ky_tuyen ON public.nhat_ky_thao_tac USING btree (tuyen_id, thoi_gian_server DESC);


--
-- Name: ix_phien_ban_tai_khoan_ngay; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_phien_ban_tai_khoan_ngay ON public.tuyen_phien_ban USING btree (tai_khoan_id, thoi_gian_server DESC);


--
-- Name: ix_phien_ban_thoi_gian; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_phien_ban_thoi_gian ON public.tuyen_phien_ban USING btree (thoi_gian_server);


--
-- Name: ix_phien_dang_nhap_tai_khoan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_phien_dang_nhap_tai_khoan ON public.phien_dang_nhap USING btree (tai_khoan_id) WHERE (thu_hoi_luc IS NULL);


--
-- Name: ix_tai_khoan_quan_ly; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tai_khoan_quan_ly ON public.tai_khoan USING btree (quan_ly_id);


--
-- Name: ix_thiet_bi_tai_khoan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_thiet_bi_tai_khoan ON public.thiet_bi USING btree (tai_khoan_id);


--
-- Name: ix_track_diem_tuyen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_track_diem_tuyen ON public.track_diem USING btree (tuyen_id, thu_tu);


--
-- Name: ix_tuyen_du_an; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tuyen_du_an ON public.tuyen USING btree (du_an_id);


--
-- Name: ix_tuyen_tao_boi; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tuyen_tao_boi ON public.tuyen USING btree (tao_boi);


--
-- Name: ux_phien_ban_ma_yeu_cau; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_phien_ban_ma_yeu_cau ON public.tuyen_phien_ban USING btree (tuyen_id, ma_yeu_cau) WHERE (ma_yeu_cau IS NOT NULL);


--
-- Name: ux_tai_khoan_ten_dang_nhap; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_tai_khoan_ten_dang_nhap ON public.tai_khoan USING btree (lower((ten_dang_nhap)::text));


--
-- Name: ux_tuyen_ten_trong_du_an; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_tuyen_ten_trong_du_an ON public.tuyen USING btree (COALESCE(du_an_id, '00000000-0000-0000-0000-000000000000'::uuid), lower((ten_tuyen)::text)) WHERE (xoa_luc IS NULL);


--
-- Name: cot tg_cot_cap_nhat; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tg_cot_cap_nhat BEFORE UPDATE ON public.cot FOR EACH ROW EXECUTE FUNCTION public.fn_set_cap_nhat_luc();


--
-- Name: dm_loai_cong_trinh tg_dm_loai_cong_trinh_cap_nhat; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tg_dm_loai_cong_trinh_cap_nhat BEFORE UPDATE ON public.dm_loai_cong_trinh FOR EACH ROW EXECUTE FUNCTION public.fn_set_cap_nhat_luc();


--
-- Name: du_an tg_du_an_cap_nhat; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tg_du_an_cap_nhat BEFORE UPDATE ON public.du_an FOR EACH ROW EXECUTE FUNCTION public.fn_set_cap_nhat_luc();


--
-- Name: duong tg_duong_cap_nhat; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tg_duong_cap_nhat BEFORE UPDATE ON public.duong FOR EACH ROW EXECUTE FUNCTION public.fn_set_cap_nhat_luc();


--
-- Name: tai_khoan tg_tai_khoan_cap_nhat; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tg_tai_khoan_cap_nhat BEFORE UPDATE ON public.tai_khoan FOR EACH ROW EXECUTE FUNCTION public.fn_set_cap_nhat_luc();


--
-- Name: tuyen tg_tuyen_cap_nhat; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tg_tuyen_cap_nhat BEFORE UPDATE ON public.tuyen FOR EACH ROW EXECUTE FUNCTION public.fn_set_cap_nhat_luc();


--
-- Name: cot cot_chieu_cao_m_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cot
    ADD CONSTRAINT cot_chieu_cao_m_fkey FOREIGN KEY (chieu_cao_m) REFERENCES public.dm_chieu_cao_cot(gia_tri_m);


--
-- Name: cot cot_ma_be_cap_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cot
    ADD CONSTRAINT cot_ma_be_cap_fkey FOREIGN KEY (ma_be_cap) REFERENCES public.dm_be_cap(ma);


--
-- Name: cot cot_ma_loai_cot_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cot
    ADD CONSTRAINT cot_ma_loai_cot_fkey FOREIGN KEY (ma_loai_cot) REFERENCES public.dm_loai_cot(ma);


--
-- Name: cot cot_ma_phu_kien_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cot
    ADD CONSTRAINT cot_ma_phu_kien_fkey FOREIGN KEY (ma_phu_kien) REFERENCES public.dm_phu_kien_cot(ma);


--
-- Name: cot cot_ma_vat_tu_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cot
    ADD CONSTRAINT cot_ma_vat_tu_fkey FOREIGN KEY (ma_vat_tu) REFERENCES public.dm_vat_tu(ma);


--
-- Name: cot cot_tao_boi_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cot
    ADD CONSTRAINT cot_tao_boi_fkey FOREIGN KEY (tao_boi) REFERENCES public.tai_khoan(id);


--
-- Name: cot cot_tuyen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cot
    ADD CONSTRAINT cot_tuyen_id_fkey FOREIGN KEY (tuyen_id) REFERENCES public.tuyen(id) ON DELETE CASCADE;


--
-- Name: dm_loai_cong_trinh dm_loai_cong_trinh_cap_nhat_boi_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_loai_cong_trinh
    ADD CONSTRAINT dm_loai_cong_trinh_cap_nhat_boi_fkey FOREIGN KEY (cap_nhat_boi) REFERENCES public.tai_khoan(id);


--
-- Name: du_an du_an_cha_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.du_an
    ADD CONSTRAINT du_an_cha_id_fkey FOREIGN KEY (cha_id) REFERENCES public.du_an(id);


--
-- Name: du_an du_an_tao_boi_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.du_an
    ADD CONSTRAINT du_an_tao_boi_fkey FOREIGN KEY (tao_boi) REFERENCES public.tai_khoan(id);


--
-- Name: duong duong_tuyen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duong
    ADD CONSTRAINT duong_tuyen_id_fkey FOREIGN KEY (tuyen_id) REFERENCES public.tuyen(id) ON DELETE CASCADE;


--
-- Name: nhat_ky_thao_tac nhat_ky_thao_tac_phien_ban_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nhat_ky_thao_tac
    ADD CONSTRAINT nhat_ky_thao_tac_phien_ban_id_fkey FOREIGN KEY (phien_ban_id) REFERENCES public.tuyen_phien_ban(id) ON DELETE SET NULL;


--
-- Name: nhat_ky_thao_tac nhat_ky_thao_tac_tai_khoan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nhat_ky_thao_tac
    ADD CONSTRAINT nhat_ky_thao_tac_tai_khoan_id_fkey FOREIGN KEY (tai_khoan_id) REFERENCES public.tai_khoan(id);


--
-- Name: nhat_ky_thao_tac nhat_ky_thao_tac_thiet_bi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nhat_ky_thao_tac
    ADD CONSTRAINT nhat_ky_thao_tac_thiet_bi_id_fkey FOREIGN KEY (thiet_bi_id) REFERENCES public.thiet_bi(id);


--
-- Name: nhat_ky_thao_tac nhat_ky_thao_tac_tuyen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nhat_ky_thao_tac
    ADD CONSTRAINT nhat_ky_thao_tac_tuyen_id_fkey FOREIGN KEY (tuyen_id) REFERENCES public.tuyen(id) ON DELETE SET NULL;


--
-- Name: phien_dang_nhap phien_dang_nhap_tai_khoan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phien_dang_nhap
    ADD CONSTRAINT phien_dang_nhap_tai_khoan_id_fkey FOREIGN KEY (tai_khoan_id) REFERENCES public.tai_khoan(id) ON DELETE CASCADE;


--
-- Name: phien_dang_nhap phien_dang_nhap_thiet_bi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.phien_dang_nhap
    ADD CONSTRAINT phien_dang_nhap_thiet_bi_id_fkey FOREIGN KEY (thiet_bi_id) REFERENCES public.thiet_bi(id);


--
-- Name: tai_khoan tai_khoan_quan_ly_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tai_khoan
    ADD CONSTRAINT tai_khoan_quan_ly_id_fkey FOREIGN KEY (quan_ly_id) REFERENCES public.tai_khoan(id);


--
-- Name: tai_khoan tai_khoan_vai_tro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tai_khoan
    ADD CONSTRAINT tai_khoan_vai_tro_id_fkey FOREIGN KEY (vai_tro_id) REFERENCES public.vai_tro(id);


--
-- Name: thiet_bi thiet_bi_tai_khoan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.thiet_bi
    ADD CONSTRAINT thiet_bi_tai_khoan_id_fkey FOREIGN KEY (tai_khoan_id) REFERENCES public.tai_khoan(id);


--
-- Name: track_diem track_diem_tuyen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.track_diem
    ADD CONSTRAINT track_diem_tuyen_id_fkey FOREIGN KEY (tuyen_id) REFERENCES public.tuyen(id) ON DELETE CASCADE;


--
-- Name: tuyen tuyen_du_an_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tuyen
    ADD CONSTRAINT tuyen_du_an_id_fkey FOREIGN KEY (du_an_id) REFERENCES public.du_an(id);


--
-- Name: tuyen tuyen_loai_cong_trinh_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tuyen
    ADD CONSTRAINT tuyen_loai_cong_trinh_id_fkey FOREIGN KEY (loai_cong_trinh_id) REFERENCES public.dm_loai_cong_trinh(id);


--
-- Name: tuyen_phien_ban tuyen_phien_ban_loai_cong_trinh_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tuyen_phien_ban
    ADD CONSTRAINT tuyen_phien_ban_loai_cong_trinh_id_fkey FOREIGN KEY (loai_cong_trinh_id) REFERENCES public.dm_loai_cong_trinh(id);


--
-- Name: tuyen_phien_ban tuyen_phien_ban_tai_khoan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tuyen_phien_ban
    ADD CONSTRAINT tuyen_phien_ban_tai_khoan_id_fkey FOREIGN KEY (tai_khoan_id) REFERENCES public.tai_khoan(id);


--
-- Name: tuyen_phien_ban tuyen_phien_ban_thiet_bi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tuyen_phien_ban
    ADD CONSTRAINT tuyen_phien_ban_thiet_bi_id_fkey FOREIGN KEY (thiet_bi_id) REFERENCES public.thiet_bi(id);


--
-- Name: tuyen_phien_ban tuyen_phien_ban_tuyen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tuyen_phien_ban
    ADD CONSTRAINT tuyen_phien_ban_tuyen_id_fkey FOREIGN KEY (tuyen_id) REFERENCES public.tuyen(id) ON DELETE CASCADE;


--
-- Name: tuyen tuyen_tao_boi_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tuyen
    ADD CONSTRAINT tuyen_tao_boi_fkey FOREIGN KEY (tao_boi) REFERENCES public.tai_khoan(id);


--
-- PostgreSQL database dump complete
--


