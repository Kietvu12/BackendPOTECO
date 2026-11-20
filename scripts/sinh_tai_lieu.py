# -*- coding: utf-8 -*-
"""
Sinh hai tài liệu .docx từ chính mã nguồn backend:
  - docs/Tai-lieu-API-Backend.docx   (danh sách API)
  - docs/Ma-tran-phan-quyen.docx     (ma trận phân quyền)

Nguồn dữ liệu: `node scripts/xuat-api.js <json>` (registry route + src/permissions.js),
nên tài liệu luôn khớp với code. Chạy:  npm run tai-lieu
Yêu cầu: pip install python-docx
"""
import json
import os
import sys

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

FONT = "Times New Roman"
XANH = (0x1F, 0x3A, 0x5F)

API_JSON = sys.argv[1]
OUT_DIR = sys.argv[2]

with open(API_JSON, encoding="utf-8") as f:
    DATA = json.load(f)

TIEN_TO = DATA["tien_to"]
VAI_TRO = DATA["vai_tro"]            # [{ma, ten}]
QUYEN = DATA["quyen"]                # [{ma, nhom, mo_ta, ma_tran}]
API = DATA["api"]
QUYEN_THEO_MA = {q["ma"]: q for q in QUYEN}
TEN_VT = {v["ma"]: v["ten"] for v in VAI_TRO}
MA_VT = [v["ma"] for v in VAI_TRO]
TEN_VT_NGAN = {
    "nhan_vien": "Nhân viên",
    "quan_ly_cap_1": "Quản lý cấp 1",
    "quan_ly_cap_2": "Quản lý cấp 2",
    "ke_toan": "Kế toán",
    "quan_tri": "Quản trị",
}


# ---------------------------------------------------------------- khung tài liệu
class Tl:
    def __init__(self, ngang=False):
        self.md = []          # bản Markdown, ghi song song với .docx
        self.doc = Document()
        s = self.doc.sections[0]
        if ngang:
            s.orientation = WD_ORIENT.LANDSCAPE
            s.page_width, s.page_height = Cm(29.7), Cm(21)
            s.left_margin = Cm(2); s.right_margin = Cm(2); s.top_margin = Cm(2); s.bottom_margin = Cm(1.8)
            self.rong = 25.7
        else:
            s.page_width, s.page_height = Cm(21), Cm(29.7)
            s.left_margin = Cm(2.5); s.right_margin = Cm(2); s.top_margin = Cm(2); s.bottom_margin = Cm(2)
            self.rong = 16.5
        st = self.doc.styles
        self._font(st["Normal"], 12)
        st["Normal"].paragraph_format.space_after = Pt(4)
        st["Normal"].paragraph_format.line_spacing = 1.15
        self._font(st["Heading 1"], 15, True, XANH)
        self._font(st["Heading 2"], 13, True, XANH)
        self._font(st["Heading 3"], 12, True, (0, 0, 0))
        for h, b, a in (("Heading 1", 14, 6), ("Heading 2", 10, 4), ("Heading 3", 8, 3)):
            st[h].paragraph_format.space_before = Pt(b)
            st[h].paragraph_format.space_after = Pt(a)
            st[h].paragraph_format.keep_with_next = True
        self._font(st["List Bullet"], 12)
        self._font(st["List Number"], 12)

    @staticmethod
    def _font(style, size, bold=False, color=None):
        style.font.name = FONT
        style.font.size = Pt(size)
        style.font.bold = bold
        style.font.color.rgb = RGBColor(*(color or (0, 0, 0)))
        rpr = style.element.get_or_add_rPr()
        rf = rpr.find(qn("w:rFonts"))
        if rf is None:
            rf = OxmlElement("w:rFonts"); rpr.append(rf)
        for a in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
            rf.set(qn(a), FONT)

    @staticmethod
    def shade(cell, hexcolor):
        tcPr = cell._tc.get_or_add_tcPr()
        shd = OxmlElement("w:shd")
        shd.set(qn("w:val"), "clear"); shd.set(qn("w:color"), "auto"); shd.set(qn("w:fill"), hexcolor)
        tcPr.append(shd)

    @staticmethod
    def runs(p, text, size=None, bold=None, italic=None, mono=False):
        """Hỗ trợ **đậm** và `mã` trong chuỗi."""
        parts = text.split("**")
        for i, part in enumerate(parts):
            if not part:
                continue
            sub = part.split("`")
            for j, s in enumerate(sub):
                if not s:
                    continue
                r = p.add_run(s)
                code = mono or j % 2 == 1
                fn = "Consolas" if code else FONT
                r.font.name = fn
                r._element.rPr.rFonts.set(qn("w:eastAsia"), fn)
                if size:
                    r.font.size = Pt(size - 1 if code and not mono else size)
                if i % 2 == 1 or bold:
                    r.bold = True
                if italic:
                    r.italic = True

    def P(self, text, size=None, bold=None, italic=None, align=None, after=None, md_cap=None):
        self.md.append(("#" * md_cap + " " if md_cap else "") + text + "\n")
        p = self.doc.add_paragraph()
        self.runs(p, text, size, bold, italic)
        if align == "c":
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        if after is not None:
            p.paragraph_format.space_after = Pt(after)
        return p

    def H(self, text, level=1):
        self.md.append("#" * (level + 1) + " " + text + "\n")
        return self.doc.add_heading(text, level=level)

    def B(self, items, style="List Bullet"):
        for i, it in enumerate(items, 1):
            self.md.append(f"{i}. {it}" if style == "List Number" else f"- {it}")
        self.md.append("")
        for it in items:
            p = self.doc.add_paragraph(style=style)
            self.runs(p, it)
            p.paragraph_format.space_after = Pt(2)

    def N(self, items):
        self.B(items, "List Number")

    def CODE(self, text, size=8.5):
        self.md.append("```\n" + text.strip("\n") + "\n```\n")
        for line in text.strip("\n").split("\n"):
            p = self.doc.add_paragraph()
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.left_indent = Cm(0.4)
            r = p.add_run(line if line else " ")
            r.font.name = "Consolas"; r.font.size = Pt(size)
            r._element.rPr.rFonts.set(qn("w:eastAsia"), "Consolas")
            pPr = p._p.get_or_add_pPr()
            shd = OxmlElement("w:shd")
            shd.set(qn("w:val"), "clear"); shd.set(qn("w:color"), "auto"); shd.set(qn("w:fill"), "F2F2F2")
            pPr.append(shd)
        self.doc.add_paragraph().paragraph_format.space_after = Pt(2)

    def T(self, headers, rows, widths, size=9.5, first_bold=False, mau=None, canh_giua=()):
        """mau(i_cot, gia_tri) -> màu nền hex hoặc None. canh_giua: các cột canh giữa."""
        def o(v):
            return str(v).replace("|", "\\|").replace("\n", "<br>")
        self.md.append("| " + " | ".join(o(h) for h in headers) + " |")
        self.md.append("|" + "|".join("---" for _ in headers) + "|")
        for row in rows:
            self.md.append("| " + " | ".join(o(v) for v in row) + " |")
        self.md.append("")
        t = self.doc.add_table(rows=1, cols=len(headers))
        t.style = "Table Grid"
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        t.autofit = False
        hdr = t.rows[0]
        th = OxmlElement("w:tblHeader"); th.set(qn("w:val"), "true"); hdr._tr.get_or_add_trPr().append(th)
        for i, h in enumerate(headers):
            c = hdr.cells[i]; c.width = Cm(widths[i]); self.shade(c, "D9E2F3")
            c.paragraphs[0].paragraph_format.space_after = Pt(0)
            if i in canh_giua:
                c.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            self.runs(c.paragraphs[0], h, size, True)
        for row in rows:
            cells = t.add_row().cells
            cs = OxmlElement("w:cantSplit"); cs.set(qn("w:val"), "true")
            t.rows[-1]._tr.get_or_add_trPr().append(cs)
            for i, v in enumerate(row):
                cells[i].width = Cm(widths[i])
                para = cells[i].paragraphs[0]
                para.paragraph_format.space_after = Pt(0)
                para.paragraph_format.line_spacing = 1.0
                if i in canh_giua:
                    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                self.runs(para, str(v), size, bold=(first_bold and i == 0))
                if mau:
                    m = mau(i, v)
                    if m:
                        self.shade(cells[i], m)
        self.doc.add_paragraph().paragraph_format.space_after = Pt(2)
        return t

    def tieu_de(self, tren, chinh, duoi):
        self.md.append(f"# {chinh}\n\n**{tren}**\n\n*{duoi}*\n")
        n = len(self.md)
        self.P(tren, 12, True, align="c", after=2)
        self.P(chinh, 20, True, align="c", after=2)
        self.P(duoi, 12, italic=True, align="c", after=10)
        del self.md[n:]       # P() ở trên đã thêm bản md thừa

    def luu(self, ten):
        os.makedirs(OUT_DIR, exist_ok=True)
        duong_dan = os.path.join(OUT_DIR, ten)
        self.doc.save(duong_dan)
        print("Đã ghi", duong_dan)
        duong_md = os.path.splitext(duong_dan)[0] + ".md"
        with open(duong_md, "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(self.md).rstrip() + "\n")
        print("Đã ghi", duong_md)


# ---------------------------------------------------------------- tiện ích
def bo_tien_to(path):
    return path[len(TIEN_TO):] if path.startswith(TIEN_TO) else path


def nhan_quyen(q):
    if q == "cong_khai":
        return "Công khai"
    if q == "dang_nhap":
        return "Đăng nhập"
    return q


def pham_vi_chu(m):
    return {"T": "Toàn hệ thống", "C": "Bản thân và cấp dưới", "B": "Chỉ bản thân"}.get(m, "")


def mau_pham_vi(_i, v):
    return {"T": "C6E0B4", "C": "FFE699", "B": "F8CBAD", "—": "EDEDED"}.get(v)


def nhom_theo_thu_tu(ds, khoa):
    thu_tu, kq = [], {}
    for x in ds:
        k = x[khoa]
        if k not in kq:
            kq[k] = []
            thu_tu.append(k)
        kq[k].append(x)
    return [(k, kq[k]) for k in thu_tu]


def ma_tran_dong(q):
    return [q["ma_tran"].get(v, "—") for v in MA_VT]


def pham_vi_api(a):
    """Phạm vi từng vai trò cho một API: T/C/B/—; cong_khai/dang_nhap: tất cả vai trò."""
    if a["quyen"] in ("cong_khai", "dang_nhap"):
        return ["✓"] * len(MA_VT)
    return ma_tran_dong(QUYEN_THEO_MA[a["quyen"]])


# ================================================================ TÀI LIỆU 1: API
def tai_lieu_api():
    d = Tl()
    d.tieu_de("HỆ THỐNG KHẢO SÁT TUYẾN CÁP POTECO", "TÀI LIỆU DANH SÁCH API BACKEND",
              "Backend Node.js (Express + PostgreSQL), phiên bản API v1. Tài liệu sinh từ mã nguồn.")

    # ---- 1
    d.H("1. Phạm vi và cách dùng tài liệu")
    d.P(f"Tài liệu mô tả **{len(API)} API** của backend, dùng chung cho ứng dụng Android và ứng dụng web. "
        "Backend hiện thực các hạng mục III.1–III.7 và IV.1–IV.5 của báo giá phase nâng cấp (xem mục 6), "
        "cùng nhập và xuất KML để chuyển dữ liệu từ hệ thống cũ.")
    d.B([
        f"Địa chỉ gốc: `{TIEN_TO}` (ví dụ `https://<tên-miền>{TIEN_TO}/tuyen`). Mọi đường dẫn trong tài liệu viết tắt bỏ phần gốc này.",
        "Định dạng dữ liệu: JSON UTF-8; riêng nhập KML nhận XML, xuất KML và Excel trả tệp.",
        "Tên trường và mã lỗi dùng tiếng Việt không dấu, viết thường có gạch dưới (ví dụ `ten_tuyen`, `chieu_dai_cap_m`).",
        "Ma trận phân quyền chi tiết nằm ở tài liệu riêng `Ma-tran-phan-quyen.docx`. Cột **Quyền** ở mục 5 là mã quyền trong ma trận đó.",
        "Danh mục API và ma trận được sinh từ chính registry route trong code (`npm run tai-lieu`), nên khớp với những gì máy chủ thực sự kiểm tra.",
    ])

    # ---- 2
    d.H("2. Quy ước chung")
    d.H("2.1. Xác thực", 2)
    d.B([
        "Gửi header `Authorization: Bearer <access_token>` ở mọi API trừ nhóm **Công khai** (`/auth/dang-nhap`, `/auth/lam-moi`, `/suc-khoe`).",
        "Access token là JWT HS256, mặc định sống 3600 giây (`JWT_TTL_GIAY`). Token chứa mã tài khoản, vai trò và thiết bị.",
        "Refresh token sống 30 ngày (`REFRESH_TTL_NGAY`), **dùng một lần**: mỗi lần `/auth/lam-moi` trả cặp token mới. Dùng lại refresh token cũ bị coi là bị lộ và thu hồi mọi phiên của tài khoản.",
        "Mỗi request, máy chủ kiểm tra lại tài khoản còn hoạt động và thiết bị còn hợp lệ, nên khóa tài khoản hoặc khóa thiết bị có hiệu lực ngay ở lần gọi kế tiếp.",
        "Android gửi `ma_thiet_bi` khi đăng nhập. Thiết bị gắn với đúng một tài khoản; thiết bị đang thuộc tài khoản khác bị từ chối (403). Quản trị khóa hoặc chuyển thiết bị bằng `PATCH /thiet-bi/:id`.",
        "Đăng nhập sai quá 5 lần (`DANG_NHAP_SAI_TOI_DA`) với cùng tên đăng nhập và IP bị khóa 15 phút (`DANG_NHAP_KHOA_PHUT`), trả 429.",
        "Mật khẩu lưu bằng scrypt có muối riêng. Mật khẩu mới tối thiểu 8 ký tự, có cả chữ và số.",
    ])
    d.H("2.2. Định dạng lỗi", 2)
    d.P("Mọi lỗi có cùng cấu trúc:")
    d.CODE('''{
  "loi": {
    "ma": "XUNG_DOT_PHIEN_BAN",
    "thong_diep": "Tuyến đã có phiên bản mới hơn (7). Tải lại dữ liệu hoặc gửi ghi_de = true",
    "chi_tiet": { "phien_ban_hien_tai": 7 }
  }
}''')
    d.T(["HTTP", "Mã lỗi (`loi.ma`)", "Ý nghĩa"], [
        ["400", "YEU_CAU_KHONG_HOP_LE", "Sai cú pháp: JSON hỏng, UUID hoặc tham số query sai định dạng, tham số thừa không được phép"],
        ["401", "CHUA_DANG_NHAP", "Thiếu, sai hoặc hết hạn access token; tài khoản đã bị khóa; thiết bị đã bị khóa hoặc hết hạn"],
        ["401", "SAI_THONG_TIN_DANG_NHAP", "Sai tên đăng nhập, mật khẩu hoặc refresh token"],
        ["403", "KHONG_CO_QUYEN", "Vai trò không có quyền; hoặc đăng nhập bằng thiết bị đã thuộc tài khoản khác; hoặc tìm theo tài khoản ngoài phạm vi (`tai_khoan_id`)"],
        ["404", "KHONG_TIM_THAY", "Không có đối tượng, **hoặc đối tượng nằm ngoài phạm vi của người gọi** (không tiết lộ là có tồn tại)"],
        ["409", "XUNG_DOT", "Trùng tên, còn dữ liệu phụ thuộc, vi phạm ràng buộc, trạng thái không cho phép thao tác"],
        ["409", "XUNG_DOT_PHIEN_BAN", "Tuyến đã có phiên bản mới hơn phiên bản mà máy gửi đang giữ (`chi_tiet.phien_ban_hien_tai`)"],
        ["413", "NOI_DUNG_QUA_LON", "Nội dung gửi lên vượt giới hạn (JSON 20 MB, KML 50 MB)"],
        ["415", "YEU_CAU_KHONG_HOP_LE", "Bảng mã ký tự không hỗ trợ"],
        ["422", "DU_LIEU_KHONG_HOP_LE", "Đúng cú pháp nhưng sai nghiệp vụ: mã ngoài danh mục, tọa độ ngoài phạm vi, hiện trạng không khớp mã..."],
        ["429", "QUA_NHIEU_LAN_THU", "Đăng nhập sai quá số lần cho phép"],
        ["500", "LOI_MAY_CHU", "Lỗi không lường trước. Thông điệp chung, chi tiết chỉ ghi log phía máy chủ"],
    ], [1.4, 5.2, 9.9], 9.5)
    d.H("2.3. Quy ước dữ liệu", 2)
    d.B([
        "**Mã định danh**: UUID. Trường `id` của cột có thể do máy khách sinh để làm việc ngoại tuyến.",
        "**Thời gian**: ISO 8601 UTC (ví dụ `2026-11-18T03:25:10.123Z`). `thoi_gian_thiet_bi` do máy khách gửi và chỉ để tham khảo; `thoi_gian_server` do cơ sở dữ liệu đóng dấu, máy khách không gửi được.",
        "**Ngày** trong bộ lọc (`ngay`, `tu_ngay`, `den_ngay`) dạng `YYYY-MM-DD` tính theo giờ Việt Nam (Asia/Ho_Chi_Minh), `den_ngay` bao gồm cả ngày đó.",
        "**Tọa độ**: `kinh_do` -180..180, `vi_do` -90..90, độ WGS84. **GPS lúc thao tác**: `gps` = `{ kinh_do, vi_do, do_chinh_xac_m }`.",
        "**Độ dài**: mét, làm tròn 2 chữ số thập phân. Chiều dài tuyến = tổng khoảng cách haversine giữa các cột liên tiếp theo thứ tự cột (bán kính 6.371.009 m, không làm tròn từng đoạn).",
        "**Chiều dài cáp** = chiều dài tuyến × hệ số n của loại công trình. Tuyến chưa chọn loại công trình thì hệ số n và chiều dài cáp để rỗng (`null`), máy chủ không đoán.",
        "**Phân trang**: query `trang` (từ 1) và `so_luong` (1..200, mặc định 50). Kết quả `{ du_lieu: [...], phan_trang: { trang, so_luong, tong } }`.",
        "**Xóa**: xóa mềm. Tuyến và cột bị xóa biến khỏi danh sách nhưng phiên bản và nhật ký vẫn được giữ.",
        "**Chống lưu trùng**: `POST /tuyen/:id/luu` nhận `ma_yeu_cau` (UUID do máy khách sinh). Gửi lại cùng mã trả lại kết quả cũ với HTTP 200 và `trung_lap = true`, không tạo phiên bản mới. Dùng cho đồng bộ khi mạng chập chờn.",
        "**Phạm vi dữ liệu**: nhân viên chỉ thấy dữ liệu của mình, quản lý thấy cả nhánh cấp dưới, quản trị và kế toán (báo cáo) thấy toàn hệ thống. Xem tài liệu ma trận phân quyền.",
    ])
    d.H("2.4. Mô hình cột (`cot[]` trong lưu tuyến và `POST /tuyen/:id/cot`)", 2)
    d.P("Trường nào không gửi thì để rỗng. Máy chủ không tự gán mã mặc định nào cho cột (kiểm chứng bằng kiểm thử); "
        "đây là phần backend của lỗi \"bấm cột ra mặc định S2\".")
    d.T(["Trường", "Kiểu", "Quy tắc"], [
        ["`id`", "UUID", "Tùy chọn. Đã tồn tại trong tuyến thì cập nhật, chưa có thì tạo mới"],
        ["`ten_cot`", "chuỗi ≤ 120", "Bắt buộc"],
        ["`kinh_do`, `vi_do`", "số", "Bắt buộc, trong phạm vi tọa độ"],
        ["`ky_hieu`, `so_thu_tu`, `dia_diem`, `ly_trinh`, `cao_do_m`", "chuỗi/số", "Thông tin mô tả cột"],
        ["`hien_ly_trinh`, `nhan_doi_phu_kien`, `dat_bien_bao`", "boolean", "Chấp nhận cả chuỗi \"true\"/\"false\" (KML cũ)"],
        ["`ma_loai_cot`", "mã danh mục", "Thuộc danh mục loại cột đang dùng"],
        ["`hien_trang_cot`", "`tm` | `cs`", "Trồng mới hoặc có sẵn. Bỏ trống thì suy ra từ mã loại cột; gửi khác mã thì 422"],
        ["`chieu_cao_m`", "số", "Phải thuộc danh mục chiều cao. Chấp nhận \"6.5\", \"6,5\", \"6.5m\""],
        ["`hien_trang_vat_tu`, `ma_vat_tu`", "`tm`/`cs`, mã", "Hiện trạng tự suy từ mã vật tư; vật tư `ca_hai` thì phải gửi hiện trạng"],
        ["`hien_trang_be_cap`, `ma_be_cap`", "`tm`/`cs`, mã", "Tương tự vật tư"],
        ["`ma_phu_kien`", "mã danh mục", "Phụ kiện"],
        ["`chung_loai_odf`, `chung_loai_splitter`", "mã danh mục", "Nhóm giá trị chủng loại"],
        ["`adss_treo_neo`, `adss_udj`, `adss_gong`, `adss_chung_loai`", "mã danh mục", "Cáp ADSS (Gông nằm trong danh mục giá trị `gong`)"],
        ["`ac_treo_ham`, `ac_de_u`, `ac_dai`, `ac_chung_loai`", "mã danh mục", "Cáp AC. `ac_de_u` (Đế U) khác `ac_dai` (Dài)"],
        ["`nguon_diem`", "`gps` | `cham_ban_do` | `keo_tha` | `chen_giua` | `nhap_kml`", "Cách điểm được tạo, phục vụ hạng mục III.4"],
        ["`thuoc_tinh_khac`", "object", "Giá trị gốc không nhận ra khi nhập KML được giữ lại ở đây"],
        ["`thu_tu`, `tao_luc`, `cap_nhat_luc`, `xoa_luc`, `tao_boi`", "chỉ đọc", "Máy chủ chấp nhận khi gửi lại đối tượng vừa nhận về nhưng bỏ qua giá trị"],
    ], [5.2, 3.6, 7.7], 9)
    d.P("Mọi mã danh mục được đối chiếu với `GET /danh-muc`. Mục đã bị tắt vẫn đọc được ở dữ liệu cũ, nhưng không chọn được cho dữ liệu mới.")

    # ---- 3
    d.H("3. Luồng sử dụng chính")
    d.H("3.1. Ứng dụng Android khảo sát", 2)
    d.N([
        "`POST /auth/dang-nhap` kèm `ma_thiet_bi`, nhận token và bản đồ quyền.",
        "`GET /danh-muc` tải danh mục cột, vật tư, bể cáp, phụ kiện, chiều cao, giá trị và loại công trình. Lưu cục bộ, tải lại khi mở ứng dụng.",
        "`POST /tuyen` tạo tuyến, chọn `loai_cong_trinh_id` (IV.1).",
        "Khảo sát ngoại tuyến. Mỗi lần lưu gọi `POST /tuyen/:id/luu` với toàn bộ `cot[]`, `ma_yeu_cau`, `phien_ban_co_so`, `thoi_gian_thiet_bi` và `gps` (III.1, III.2, III.4).",
        "Gặp 409 `XUNG_DOT_PHIEN_BAN`: tải lại `GET /tuyen/:id?kem=cot` rồi hợp nhất, hoặc gửi lại với `ghi_de = true`.",
        "Hoàn tất khảo sát gọi `POST /tuyen/:id/hoan-thien`. Từ đó mọi lần lưu là `chinh_sua_sau`.",
        "Khi gửi hoặc đồng bộ lên Cloud, gọi `POST /nhat-ky` với `hanh_dong = gui` hoặc `dong_bo` (III.1).",
    ])
    d.H("3.2. Ứng dụng web", 2)
    d.N([
        "Quản lý: `GET /lich-su?ngay=...` xem nhân viên đã lưu tuyến nào và tuyến cuối cùng trong ngày (III.5); `GET /nhat-ky` tra nhật ký theo tài khoản (III.1); `GET /nhat-ky/excel` xuất lịch sử (III.7).",
        "Xem lại tuyến: `GET /tuyen/:id/phien-ban` lấy danh sách, `GET /tuyen/:id/phien-ban/:so` lấy hình dạng để vẽ trên bản đồ, `GET /tuyen/:id/phien-ban/so-sanh` xem khác biệt (III.3).",
        "Quản lý cấp 2 trở lên: `GET/POST/PATCH /danh-muc/loai-cong-trinh` thiết lập loại công trình và hệ số n (IV.2).",
        "Kế toán: `GET /bao-cao/hoan-thien-tuyen` và `/bao-cao/khoi-luong-cap` cùng bản Excel (III.6, IV.3, IV.5).",
        "Chuyển dữ liệu cũ: `POST /tuyen/nhap-kml?thu=true` chạy thử, xem `canh_bao`, rồi bỏ `thu` để ghi thật.",
    ])

    # ---- 4
    d.H("4. Một số mô hình trả về")
    d.H("4.1. Đăng nhập", 2)
    d.CODE('''POST /api/v1/auth/dang-nhap
{ "ten_dang_nhap": "nv01", "mat_khau": "********", "ma_thiet_bi": "android-7f3c", "ten_thiet_bi": "Samsung A54" }

200 OK
{
  "access_token": "eyJhbGciOi...",
  "refresh_token": "b1f0...",
  "het_han_giay": 3600,
  "thiet_bi_id": "0b7e...",
  "tai_khoan": { "id": "5d2a...", "ten_dang_nhap": "nv01", "ho_ten": "Nguyễn Văn A",
                 "vai_tro": "nhan_vien", "vai_tro_ten": "Nhân viên khảo sát" },
  "quyen": { "tuyen.xem": "B", "tuyen.luu": "B", "danh_muc.xem": "T", "...": "..." }
}''')
    d.H("4.2. Lưu tuyến (tạo phiên bản)", 2)
    d.CODE('''POST /api/v1/tuyen/{id}/luu
{
  "ma_yeu_cau": "6f1c9d2e-8a3b-4c51-9b0e-2f7d5a1c4e88",
  "phien_ban_co_so": 2,
  "loai_cong_trinh_id": "c3a1...",
  "thoi_gian_thiet_bi": "2026-11-18T03:25:08.000Z",
  "gps": { "kinh_do": 106.700981, "vi_do": 10.776889, "do_chinh_xac_m": 6.5 },
  "cot": [
    { "id": "9a41...", "ten_cot": "C1", "kinh_do": 106.7010, "vi_do": 10.7769,
      "ma_loai_cot": "lt_cs", "chieu_cao_m": 8.5, "nguon_diem": "gps" },
    { "ten_cot": "C2", "kinh_do": 106.7021, "vi_do": 10.7775, "nguon_diem": "cham_ban_do" }
  ]
}

201 Created
{
  "trung_lap": false,
  "tuyen": { "id": "...", "ten_tuyen": "Tuyen A", "so_cot": 2, "chieu_dai_tuyen_m": 134.21,
             "he_so_n": 1.05, "chieu_dai_cap_m": 140.92, "phien_ban_hien_tai": 3 },
  "phien_ban": { "so_phien_ban": 3, "loai_luu": "hien_truong", "thoi_gian_thiet_bi": "...",
                 "thoi_gian_server": "...", "gps_kinh_do": 106.700981, "gps_vi_do": 10.776889,
                 "so_cot_them": 1, "so_cot_sua": 0, "so_cot_xoa": 0 }
}''')
    d.H("4.3. Tra cứu theo ngày (III.5)", 2)
    d.CODE('''GET /api/v1/lich-su?ngay=2026-11-18

200 OK
{ "ngay": "2026-11-18",
  "nhan_vien": [ {
      "tai_khoan_id": "5d2a...", "ho_ten": "Nguyễn Văn A", "tuyen_cuoi_trong_ngay": "Tuyen A",
      "tuyen": [ { "ten_tuyen": "Tuyen A", "so_lan_luu": 3, "phien_ban_cuoi": 3,
                   "loai_luu_cuoi": "hien_truong", "luu_luc_cuoi": "2026-11-18T09:40:12.000Z",
                   "la_tuyen_cuoi_trong_ngay": true } ] } ] }''')

    # ---- 5
    d.H("5. Danh sách API")
    d.P("Phạm vi (T, C, B) của từng vai trò cho mỗi mã quyền xem ở tài liệu ma trận phân quyền. Đường dẫn bỏ tiền tố "
        f"`{TIEN_TO}`. Cột Quyền: **Công khai** không cần token, **Đăng nhập** chỉ cần token hợp lệ.")
    d.H("5.1. Tổng hợp", 2)
    rows = []
    for i, a in enumerate(API, 1):
        rows.append([i, a["method"], f"`{bo_tien_to(a['path'])}`", nhan_quyen(a["quyen"]), a["tom_tat"]])
    d.T(["#", "Phương thức", "Đường dẫn", "Quyền", "Mô tả"], rows, [0.8, 1.9, 5.0, 3.4, 5.4], 8.5)

    d.H("5.2. Chi tiết từng API", 2)
    stt = 0
    for nhom, ds in nhom_theo_thu_tu(API, "nhom"):
        d.H(nhom, 3)
        for a in ds:
            stt += 1
            d.P(f"**{stt}. {a['method']} `{bo_tien_to(a['path'])}`**", 11, after=1, md_cap=5)
            hang = [["Mô tả", a["tom_tat"]], ["Quyền", nhan_quyen(a["quyen"])]]
            if a["quyen"] not in ("cong_khai", "dang_nhap"):
                q = QUYEN_THEO_MA[a["quyen"]]
                cho = [f"{TEN_VT_NGAN[v]}: {pham_vi_chu(q['ma_tran'][v])}" for v in MA_VT if v in q["ma_tran"]]
                hang.append(["Ai được gọi", "; ".join(cho)])
            if a["tham_so"]:
                hang.append(["Tham số", a["tham_so"]])
            if a["ket_qua"]:
                hang.append(["Kết quả", a["ket_qua"]])
            if a["ghi_chu"]:
                hang.append(["Ghi chú", a["ghi_chu"]])
            t = d.T(["Mục", "Nội dung"], hang, [2.6, 13.9], 9.5, first_bold=True)
    # ---- 6
    d.H("6. Đối chiếu hạng mục báo giá với API")
    d.T(["Hạng mục", "Nội dung", "API và cơ chế"], [
        ["III.1", "Log thao tác theo tài khoản; phân biệt giờ thiết bị và giờ Cloud",
         "Máy chủ tự ghi `tao`, `luu`, `sua` trong cùng giao dịch với thao tác. Ứng dụng ghi `gui`, `dong_bo` bằng `POST /nhat-ky`. Xem bằng `GET /nhat-ky` (có `thoi_gian_thiet_bi` và `thoi_gian_server`)."],
        ["III.2", "Lưu hình dạng tuyến từng phiên bản; thời gian hoàn thiện",
         "`POST /tuyen/:id/luu` chụp `hinh_dang` (cột, đường, track) và `du_lieu_cot` vào phiên bản. `POST /tuyen/:id/hoan-thien` đặt mốc hoàn thiện; báo cáo ở `/bao-cao/hoan-thien-tuyen`."],
        ["III.3", "Xem lại từng phiên bản trên bản đồ",
         "`GET /tuyen/:id/phien-ban`, `/phien-ban/:so`, `/phien-ban/so-sanh`. Backend trả dữ liệu; hiển thị bản đồ thuộc ứng dụng web."],
        ["III.4", "Phân biệt lưu hiện trường và chỉnh sửa sau: GPS, mức thay đổi, nguồn điểm, giờ server",
         "Mỗi phiên bản có `loai_luu`, `gps_*`, `so_cot_them/sua/xoa`, `thoi_gian_server`; mỗi cột có `nguon_diem`. Tuyến đã hoàn thiện mặc định lưu là `chinh_sua_sau` và không nhận `hien_truong`."],
        ["III.5", "Tra cứu theo nhân viên và theo ngày", "`GET /lich-su` (tuyến cuối cùng trong ngày, danh sách tuyến đã lưu). Lấy từ phiên bản nên không phụ thuộc hạn lưu nhật ký."],
        ["III.6", "Phân quyền xem lịch sử theo cấp quản lý; kế toán xem track log hoàn thiện",
         "Phạm vi T/C/B trên mọi API lịch sử. Vai trò kế toán chỉ có `bao_cao.*` (toàn hệ thống), không xem dữ liệu tuyến, cột, nhật ký."],
        ["III.7", "Lưu trữ lịch sử 1 tháng; xuất Excel",
         "Cấu hình `nhat_ky.luu_tru_ngay` (mặc định 30), tự dọn mỗi ngày khi `DON_NHAT_KY_TU_DONG=1` hoặc `POST /he-thong/don-nhat-ky`. Xuất bằng `GET /nhat-ky/excel`."],
        ["IV.1", "Chọn loại công trình khi tạo hoặc lưu tuyến", "`loai_cong_trinh_id` trong `POST /tuyen`, `PATCH /tuyen/:id`, `POST /tuyen/:id/luu`."],
        ["IV.2", "Thiết lập loại công trình và hệ số n (cấp 2 trở lên)", "`/danh-muc/loai-cong-trinh` (quyền `danh_muc.sua_loai_cong_trinh`)."],
        ["IV.3", "Chiều dài cáp = chiều dài tuyến × n; tính lại khi tuyến đổi",
         "Máy chủ tính lại mỗi lần lưu, thêm, sửa, xóa, sắp xếp cột hoặc đổi loại công trình (hàm `fn_tinh_lai_tuyen`). Hiển thị trên thanh thông tin thuộc ứng dụng Android. Báo cáo ở `/bao-cao/khoi-luong-cap`."],
        ["IV.5", "Đưa chiều dài tuyến, n, chiều dài cáp vào Excel", "`GET /tuyen/:id/excel`, `GET /bao-cao/khoi-luong-cap/excel`."],
        ["Ngoài báo giá", "Nhập và xuất KML (chuyển dữ liệu từ hệ thống cũ, hai định dạng web và Android)", "`POST /tuyen/nhap-kml`, `GET /tuyen/:id/kml`."],
    ], [1.8, 4.9, 9.8], 9)

    # ---- 7
    d.H("7. Giả định, hạn chế và điểm cần xác nhận")
    d.H("7.1. Giả định nghiệp vụ cần khách hàng xác nhận", 2)
    d.N([
        "**Vai trò và phạm vi**: báo giá chỉ nêu \"cấp quản lý\", \"quản lý cấp 2 trở lên\" và \"kế toán\". Backend giả định 5 vai trò (nhân viên, quản lý cấp 1, quản lý cấp 2, kế toán, quản trị) và 3 mức phạm vi. Cần xác nhận số cấp, quan hệ cấp trên cấp dưới và quyền từng cấp.",
        "**Lưu trữ 1 tháng (III.7)**: backend chỉ xóa `nhat_ky_thao_tac` quá 30 ngày. Phiên bản tuyến giữ vĩnh viễn vì cần cho xem lại (III.3) và tra cứu theo ngày (III.5). Cần xác nhận có phải \"lịch sử\" gồm cả phiên bản hay không.",
        "**Tiêu chí \"lưu tại hiện trường\" (III.4)**: backend ghi GPS lúc lưu, nguồn điểm, giờ server và mặc định `hien_truong` khi tuyến chưa hoàn thiện. Chưa có tiêu chí so khoảng cách giữa GPS lúc lưu và vị trí tuyến để tự quyết \"có ở hiện trường\" hay không.",
        "**Kế toán (III.6)**: chỉ xem báo cáo hoàn thiện tuyến và khối lượng cáp của mọi tuyến, không xem dữ liệu chi tiết. Cần xác nhận phạm vi.",
        "**Đổi hệ số n**: không tính lại các tuyến đã lưu; tuyến nhận hệ số mới ở lần lưu kế tiếp. Nếu cần tính lại hàng loạt phải bổ sung API.",
        "**Nhập KML**: phiên bản đầu của tuyến nhập có `nguon_diem = nhap_kml`, không có GPS; có thể bị hiểu nhầm là lưu hiện trường nếu chỉ xem `loai_luu`.",
        "**KML Android** không mang được ký hiệu, số thứ tự và trường hợp hiện trạng \"cả hai\". Gông chưa có trong danh mục nên nhập vào thành rỗng, giá trị gốc giữ ở `thuoc_tinh_khac`.",
    ])
    d.H("7.2. Hạn chế kỹ thuật", 2)
    d.B([
        "Khóa đăng nhập sai lưu trong bộ nhớ tiến trình: chạy nhiều bản backend thì mỗi bản đếm riêng. Bộ nhớ đệm danh mục (60 giây) cũng theo từng bản.",
        "Đăng xuất hoặc đổi mật khẩu không vô hiệu access token đang còn hạn (tối đa 1 giờ), nhưng khóa tài khoản hoặc thiết bị có hiệu lực ngay.",
        "Xuất Excel nhật ký tối đa 50.000 dòng; vượt thì thêm trang \"Lưu ý\". Chuỗi bắt đầu bằng `=`, `+`, `-`, `@` được ghi dạng văn bản, không thành công thức.",
        "Chưa đo tải thực tế. Kiểm thử mới chạy trên PostgreSQL 18, một máy.",
        "Lỗi GPS không sát và tải chậm phía ứng dụng chưa xử lý ở backend; backend cung cấp `do_chinh_xac_m` và log GPS để đo. Nguyên nhân lỗi \"bấm cột ra S2\" phía ứng dụng chưa xác định.",
        "Phụ thuộc `exceljs` kéo theo `uuid` bị cảnh báo `npm audit` mức vừa; lỗ hổng chỉ ảnh hưởng khi truyền buffer vào hàm `uuid`, backend không dùng theo cách đó.",
    ])

    # ---- 8
    d.H("8. Phụ lục: cài đặt, chạy, kiểm thử")
    d.H("8.1. Thứ tự dựng cơ sở dữ liệu", 2)
    d.P("PostgreSQL 13 trở lên. Cách nhanh: `npm run db:migrate` chạy các tệp `docs/database/NN_*.sql` theo thứ tự tên, "
        "mỗi tệp một lần (ghi vào bảng `schema_migrations`). Hoặc chạy tay:")
    d.CODE('''psql -d poteco -f docs/database/01_schema.sql
psql -d poteco -f docs/database/02_seed_danh_muc.sql
psql -d poteco -f docs/database/03_ham_tinh_toan.sql
psql -d poteco -f docs/database/04_backend_bo_sung.sql''')
    d.H("8.2. Biến môi trường", 2)
    d.T(["Biến", "Mặc định", "Ý nghĩa"], [
        ["`DATABASE_URL`", "—", "Chuỗi kết nối PostgreSQL (bắt buộc)"],
        ["`PORT`", "4000", "Cổng lắng nghe"],
        ["`JWT_SECRET`", "—", "Bắt buộc ở môi trường thật, chuỗi ngẫu nhiên từ 32 ký tự"],
        ["`JWT_TTL_GIAY`", "3600", "Thời hạn access token (giây)"],
        ["`REFRESH_TTL_NGAY`", "30", "Thời hạn refresh token (ngày)"],
        ["`CORS_ORIGINS`", "rỗng", "Danh sách origin được gọi từ trình duyệt, cách nhau dấu phẩy. Rỗng là không cho origin nào (Android không cần CORS)"],
        ["`DON_NHAT_KY_TU_DONG`", "1", "1: tự dọn nhật ký quá hạn mỗi 24 giờ"],
        ["`DANG_NHAP_SAI_TOI_DA`", "5", "Số lần đăng nhập sai tối đa trước khi khóa"],
        ["`DANG_NHAP_KHOA_PHUT`", "15", "Thời gian khóa (phút)"],
        ["`TRUST_PROXY`", "tắt", "Đặt khi chạy sau reverse proxy để lấy đúng IP khách"],
    ], [4.6, 2.2, 9.7], 9.5)
    d.H("8.3. Lệnh thường dùng (thư mục `BackendPOTECO`)", 2)
    d.CODE('''npm install
npm run db:migrate                          # dựng/cập nhật cơ sở dữ liệu
npm start                                   # chạy máy chủ
npm test                                    # 56 kiểm thử, cần PostgreSQL (TEST_ADMIN_URL)
MAT_KHAU=... node scripts/tao-tai-khoan.js  # tạo tài khoản quản trị đầu tiên
npm run tai-lieu                            # sinh lại hai tài liệu này từ mã nguồn''')
    d.luu("Tai-lieu-API-Backend.docx")


# ================================================================ TÀI LIỆU 2: MA TRẬN
def tai_lieu_ma_tran():
    d = Tl(ngang=True)
    d.tieu_de("HỆ THỐNG KHẢO SÁT TUYẾN CÁP POTECO", "MA TRẬN PHÂN QUYỀN",
              "Backend Node.js, sinh từ src/permissions.js. Vai trò và phạm vi là giả định cần khách hàng xác nhận (mục 7).")

    d.H("1. Mô hình phân quyền")
    d.P("Quyền = **vai trò** × **mã quyền** → **phạm vi dữ liệu**. Mỗi API gắn đúng một mã quyền (hoặc Công khai, hoặc Đăng nhập). "
        "Máy chủ kiểm tra ở mọi request; ứng dụng chỉ ẩn nút theo bản đồ quyền trả về ở `GET /auth/toi` chứ không thay thế kiểm tra này.")
    d.T(["Ký hiệu", "Phạm vi", "Ý nghĩa"], [
        ["T", "Toàn hệ thống", "Mọi dữ liệu thuộc loại đó"],
        ["C", "Cây quản lý", "Dữ liệu của bản thân và mọi cấp dưới (theo `quan_ly_id`, đệ quy nhiều tầng)"],
        ["B", "Bản thân", "Chỉ dữ liệu do chính tài khoản tạo hoặc sở hữu"],
        ["—", "Không có quyền", "API trả 403 `KHONG_CO_QUYEN`"],
    ], [2.2, 4.0, 19.5], 10, mau=lambda i, v: mau_pham_vi(i, v) if i == 0 else None, canh_giua=(0,))
    d.B([
        "**Ngoài phạm vi thì 404**, không phải 403: người gọi không biết đối tượng có tồn tại hay không (chống dò mã).",
        "Quyền ghi dùng cùng ký hiệu: `C` nghĩa là được thao tác lên dữ liệu của bản thân và cấp dưới; `B` chỉ lên dữ liệu của mình.",
        "Phạm vi cây tính theo quan hệ `quan_ly_id` của tài khoản **hiện tại**, đổi người quản lý có hiệu lực ngay.",
        "Người quản lý trực tiếp phải đang hoạt động, có cấp quản lý cao hơn và không phải quản trị; không cho tạo vòng quản lý.",
        "Thiết bị Android gắn một tài khoản: đăng nhập bằng thiết bị của tài khoản khác bị từ chối (403); thiết bị bị khóa hoặc hết hạn thì mọi API trả 401 kể từ lần gọi kế tiếp.",
    ])

    d.H("2. Vai trò")
    d.T(["Mã", "Tên", "Vị trí trong cây", "Mô tả (giả định)"], [
        ["`nhan_vien`", "Nhân viên khảo sát", "Cấp thấp nhất", "Khảo sát, lưu, hoàn thiện tuyến của mình; xem lịch sử của mình. Đăng ký thiết bị Android."],
        ["`quan_ly_cap_1`", "Quản lý cấp 1", "Quản lý nhân viên", "Xem và sửa dữ liệu nhánh dưới, tra cứu nhật ký, xuất Excel nhật ký. Không thiết lập loại công trình."],
        ["`quan_ly_cap_2`", "Quản lý cấp 2", "Quản lý cấp 1 và nhân viên", "Như cấp 1 và được thiết lập loại công trình, hệ số n (IV.2)."],
        ["`ke_toan`", "Kế toán", "Ngoài cây quản lý", "Chỉ xem báo cáo thời gian hoàn thiện tuyến (III.6) và khối lượng cáp, trên toàn hệ thống. Không xem tuyến, cột, nhật ký, dự án."],
        ["`quan_tri`", "Quản trị hệ thống", "Ngoài cây quản lý", "Toàn quyền: tài khoản, thiết bị, danh mục, cấu hình, dọn nhật ký. Là vai trò duy nhất tạo được tài khoản."],
    ], [3.6, 4.0, 5.1, 13.0], 10, first_bold=True)

    d.H("3. Ma trận quyền theo vai trò")
    d.P(f"Có {len(QUYEN)} mã quyền. Ô trống là không có quyền.")
    ten_cot = [TEN_VT_NGAN[v] for v in MA_VT]
    rows = []
    for nhom, ds in nhom_theo_thu_tu(QUYEN, "nhom"):
        rows.append([f"**{nhom}**", "", *[""] * len(MA_VT)])
        for q in ds:
            rows.append([f"`{q['ma']}`", q["mo_ta"], *ma_tran_dong(q)])
    t = d.T(["Mã quyền", "Mô tả", *ten_cot], rows, [6.0, 8.7, 2.2, 2.2, 2.2, 2.2, 2.2], 9.5,
            mau=lambda i, v: mau_pham_vi(i, v) if i >= 2 else None, canh_giua=(2, 3, 4, 5, 6))
    # dòng tiêu đề nhóm: gộp ô, tô nhạt
    for r in t.rows[1:]:
        if r.cells[1].text == "" and r.cells[2].text == "" and r.cells[0].text and "." not in r.cells[0].text:
            gop = r.cells[0].merge(r.cells[-1])
            Tl.shade(gop, "EDEDED")

    d.H("4. Ma trận API theo vai trò")
    d.P("Mỗi API và phạm vi của từng vai trò. **✓** là API chỉ yêu cầu đăng nhập hoặc công khai, không phân biệt vai trò.")
    rows = []
    for nhom, ds in nhom_theo_thu_tu(API, "nhom"):
        rows.append([f"**{nhom}**", "", "", *[""] * len(MA_VT)])
        for a in ds:
            rows.append([f"{a['method']} `{bo_tien_to(a['path'])}`", a["tom_tat"], nhan_quyen(a["quyen"]), *pham_vi_api(a)])
    t = d.T(["API", "Mô tả", "Quyền", *ten_cot], rows, [6.6, 6.7, 3.8, 1.7, 1.7, 1.7, 1.7, 1.7], 8.5,
            mau=lambda i, v: (mau_pham_vi(i, v) or ("E2EFDA" if v == "✓" else None)) if i >= 3 else None,
            canh_giua=(3, 4, 5, 6, 7))
    for r in t.rows[1:]:
        if r.cells[1].text == "" and r.cells[2].text == "" and r.cells[3].text == "":
            gop = r.cells[0].merge(r.cells[-1])
            Tl.shade(gop, "EDEDED")

    d.H("5. Quy tắc áp dụng phạm vi")
    d.T(["Đối tượng", "Cách xác định chủ sở hữu", "Phạm vi C và B"], [
        ["Tuyến, cột, phiên bản", "`tuyen.tao_boi` (người tạo tuyến)", "B: tuyến mình tạo. C: tuyến của mình và của mọi cấp dưới. Cột và phiên bản đi theo tuyến."],
        ["Dự án", "Người tạo dự án; dự án con lồng nhau", "Dự án thấy được theo người tạo trong phạm vi. Xóa chỉ khi không còn tuyến và dự án con."],
        ["Nhật ký thao tác", "`tai_khoan_id` (người thực hiện)", "B: nhật ký của mình. C: của mình và cấp dưới. Không lọc thì chỉ trả phần trong phạm vi; lọc `tai_khoan_id` ngoài phạm vi trả 403."],
        ["Lịch sử theo ngày", "Người lưu phiên bản", "Cùng quy tắc nhật ký."],
        ["Báo cáo", "Người tạo tuyến", "Kế toán và quản trị: T. Quản lý: C. Nhân viên: B."],
        ["Tài khoản", "Chính tài khoản và cây `quan_ly_id`", "Nhân viên và kế toán chỉ thấy mình; quản lý thấy cả nhánh; quản trị thấy tất cả. Tạo, sửa, đặt lại mật khẩu chỉ quản trị."],
        ["Thiết bị", "Tài khoản sở hữu thiết bị", "Mọi vai trò xem và đăng ký thiết bị của mình (trừ kế toán không đăng ký). Khóa, chuyển thiết bị chỉ quản trị."],
        ["Danh mục", "Dùng chung", "Mọi vai trò đọc. Loại công trình và hệ số n: quản lý cấp 2 trở lên. Danh mục khác: quản trị."],
    ], [4.3, 7.3, 14.1], 9.5, first_bold=True)

    d.H("6. Ví dụ về phạm vi")
    d.P("Cây: Quản lý cấp 2 (Lan) → Quản lý cấp 1 (Hùng) → Nhân viên (An, Bình); Nhân viên (Chi) trực tiếp dưới Lan.")
    d.P("Cột \"Nhật ký của Hùng\" là gọi `GET /nhat-ky?tai_khoan_id=<Hùng>`.")
    d.T(["Người gọi", "Tuyến của An (`GET /tuyen/:id`)", "Tuyến của Chi", "Nhật ký của Hùng", "Báo cáo hoàn thiện"], [
        ["An", "Có (của mình)", "404", "403", "Chỉ tuyến của An"],
        ["Hùng", "Có (cấp dưới)", "404", "Có (của mình)", "Tuyến của Hùng, An, Bình"],
        ["Bình", "404", "404", "403", "Chỉ tuyến của Bình"],
        ["Lan", "Có", "Có", "Có", "Tuyến của cả cây"],
        ["Kế toán", "403 (không có quyền tuyến)", "403", "403", "Mọi tuyến đã hoàn thiện"],
        ["Quản trị", "Có", "Có", "Có", "Toàn bộ"],
    ], [3.5, 5.6, 5.0, 5.8, 5.8], 10, first_bold=True)

    d.H("7. Điểm cần khách hàng xác nhận")
    d.N([
        "Số vai trò và tên gọi chính thức; có tách \"quản lý cấp 1\" và \"cấp 2\" như giả định hay còn nhiều cấp hơn.",
        "Quản lý cấp 1 có được xuất Excel nhật ký (đang cho phép, chỉ trong nhánh dưới) hay chỉ cấp 2 trở lên.",
        "Kế toán xem toàn bộ tuyến đã hoàn thiện hay chỉ theo dự án được giao.",
        "Quản lý có được sửa, lưu, hoàn thiện thay tuyến của cấp dưới (đang cho phép) hay chỉ xem.",
        "Xóa tuyến và xóa dự án: đang giới hạn quản lý trở lên; nhân viên không tự xóa được.",
        "Ai được tạo tài khoản: đang chỉ quản trị. Nếu quản lý được tạo nhân viên cấp dưới thì cần đổi ma trận.",
    ])

    d.H("8. Đã kiểm thử")
    d.B([
        f"Kiểm thử tự động gọi **mọi API × 5 vai trò** và đối chiếu kết quả với ma trận ở mục 3 (file `test/phanquyen.test.js`).",
        "Kiểm thử phạm vi: nhân viên không đọc được tuyến của người khác (404), quản lý không đọc ngoài nhánh, kế toán đọc báo cáo nhưng bị chặn ở dữ liệu tuyến.",
        "Kiểm thử không có API nào trả 5xx với dữ liệu rác; không còn mã quyền nào không được API nào dùng.",
        "Toàn bộ 56 kiểm thử đạt trên PostgreSQL thật. Ma trận trong tài liệu này sinh trực tiếp từ `src/permissions.js`, nên đổi code thì chạy lại `npm run tai-lieu` để cập nhật.",
    ])
    d.luu("Ma-tran-phan-quyen.docx")


if __name__ == "__main__":
    tai_lieu_api()
    tai_lieu_ma_tran()
