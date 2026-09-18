# HƯỚNG DẪN THIẾT LẬP & VẬN HÀNH HỆ THỐNG QUẢN TRỊ KOL THỂ THAO TRÊN LARK BASE

> 🔗 **ĐƯỜNG LINK TRUY CẬP TRỰC TIẾP HỆ THỐNG BASE CỦA BẠN:**  
> **[https://ujpumxyv47ap.jp.larksuite.com/base/Ow1ab1cKxaOHTBs32zvjsg32phe](https://ujpumxyv47ap.jp.larksuite.com/base/Ow1ab1cKxaOHTBs32zvjsg32phe)**  
> *(Hệ thống đã được tự động khởi tạo hoàn tất với đầy đủ 3 bảng và dữ liệu mẫu)*

---

### THÔNG TIN KỸ THUẬT CỦA CƠ SỞ DỮ LIỆU:
- **Base App Token**: `Ow1ab1cKxaOHTBs32zvjsg32phe`
- **Bảng 1 (Danh Bạ KOLs Thể Thao)**: `tbllpqJ68WvvqHL4`
- **Bảng 2 (Cộng Đồng & Group Thể Thao)**: `tblMYU5kXPhKV6X5`
- **Bảng 3 (Chiến Dịch & Dự Án)**: `tblwhbLdY72KA3D3`
- **Bảng 4 (Đánh Giá Sau Dự Án)**: `tblz9lj9JCxMwJE3`
- **Bảng 5 (Yêu Cầu Scout Tự Động)**: `tbl7JHIEfZNQRaD3`
- **Bảng 6 (Bài Viết & Nội Dung Scout Được)**: `tblwhj2W4W8LOuVu`

---

## QUY TRÌNH SCOUT TỰ ĐỘNG DÀNH CHO NHÂN VIÊN MARKETING (100% TRÊN LARK BASE)

Nhân viên không cần mở terminal hay gõ lệnh. Chỉ cần:
1. Mở Bảng **`5. Yêu Cầu Scout Tự Động`** trên Lark Base.
2. Bấm **+ Thêm bản ghi mới**:
   - **Từ khóa tìm kiếm**: Nhập từ khóa (ví dụ: `tennis hanoi`, `marathon saigon`, `pickleball vietnam`).
   - **Đối tượng cần Scout**: Chọn `KOLs cá nhân` hoặc `Cộng đồng / Group`.
   - **Nền tảng**: Chọn `Instagram` hoặc `Facebook`.
   - **Số lượng cần lấy**: 5, 10 hoặc 20.
   - **Khu vực mong muốn**: Hà Nội, TP.HCM, Toàn quốc...
   - **Trạng thái xử lý**: Chọn **`Chờ xử lý`**.
3. Hệ thống chạy ngầm sẽ tự động quét qua Apify, lấy thông tin hồ sơ và đổ thẳng vào **Bảng 1** (nếu là KOL) hoặc **Bảng 2** (nếu là Group).
4. Khi hoàn tất, cột **Trạng thái xử lý** sẽ tự nhảy thành **`Đã hoàn thành`** kèm báo cáo số lượng hồ sơ đã thêm!

## PHẦN 1: KÍCH HOẠT QUYỀN TRÊN LARK DEVELOPER (CHỈ MẤT 1 PHÚT)

Ứng dụng của bạn (`cli_aa212243acf89e15`) đã kết nối thành công với Lark API. Để script có thể tự động tạo Base và các Bảng dữ liệu, bạn cần bật quyền **Bitable** theo 3 bước sau:

1. **Truy cập trang cấp quyền**:
   - Mở trình duyệt và truy cập: [https://open.larksuite.com/app/cli_aa212243acf89e15/auth](https://open.larksuite.com/app/cli_aa212243acf89e15/auth)
2. **Tìm và thêm quyền (Add Permissions)**:
   - Trong thanh tìm kiếm quyền, gõ: `bitable`
   - Đánh dấu tick chọn vào:
     - `bitable:app` *(Xem, tạo và chỉnh sửa ứng dụng Base)*
     - `bitable:app:readonly` *(Xem thông tin Base)*
   - Bấm **Confirm** / **Save**.
3. **Phát hành phiên bản mới (Bắt buộc)**:
   - Ở cột menu bên trái, chọn **Version Management & Release** (Quản lý phiên bản & Phát hành).
   - Bấm nút **Create a version** (Tạo phiên bản), điền số phiên bản (ví dụ `1.0.0`) và mô tả.
   - Bấm **Save** và bấm **Publish** (hoặc gửi duyệt nội bộ nếu tổ chức yêu cầu).

---

## PHẦN 2: CHẠY SCRIPT KHỞI TẠO TỰ ĐỘNG CƠ SỞ DỮ LIỆU

Sau khi đã Publish quyền ở Phần 1, bạn chỉ cần mở terminal và chạy đúng 1 câu lệnh duy nhất:

```bash
python3 scripts/setup_lark_base.py
```

### Script sẽ tự động thực hiện:
1. **Tạo Base mới** mang tên: `"Hệ Thống Quản Trị KOL & Community Thể Thao"`.
2. **Tạo Bảng 1**: `1. Danh Bạ KOLs & Community` với đầy đủ các cột: Tên, Phân loại, Bộ môn thể thao (Pickleball, Tennis, Running, Gym...), Khu vực, Followers, Link mạng xã hội, Bio, Rating sao, Bảng giá, Trạng thái.
3. **Tạo Bảng 2**: `2. Chiến Dịch & Dự Án` để quản lý các chiến dịch đang chạy, ngân sách và người phụ trách.
4. **Tạo Bảng 3**: `3. Đánh Giá Hiệu Suất Sau Dự Án` phục vụ việc chấm điểm KOL, đánh giá thái độ, tiến độ deadline, đạt KPI thực tế và ghi chú "phốt" cho các dự án sau.
5. **Nạp sẵn 5 hồ sơ mẫu thực tế** (Đỗ Kim Phúc, Hana Giang Anh, Group Pickleball Việt Nam...) để bạn mở ra là thấy ngay dữ liệu trực quan.
6. **In ra đường link truy cập trực tiếp Base** ngay trên màn hình.

> **Trường hợp dự phòng**: Nếu bạn muốn tạo Base thủ công trên Lark rồi để script tự tạo bảng, chỉ cần copy `app_token` trên thanh địa chỉ URL của Base và chạy:
> ```bash
> python3 scripts/setup_lark_base.py <APP_TOKEN_CỦA_BASE>
> ```

---

## PHẦN 3: CÁCH TẠO FORM VIEW ĐỂ NHÂN VIÊN ĐIỀN ĐÁNH GIÁ TRÊN ĐIỆN THOẠI

Để nhân sự sau khi kết thúc dự án có thể mở điện thoại ra điền form nghiệm thu trong 30 giây:

1. Mở Base trên Lark -> Vào Bảng **"3. Đánh Giá Hiệu Suất Sau Dự Án"**.
2. Ở thanh công cụ trên cùng (chỗ chuyển đổi các View), bấm dấu **`+`** -> Chọn **Form View (Chế độ xem Biểu mẫu)**.
3. Đặt tên biểu mẫu: *"Biểu Mẫu Nghiệm Thu & Đánh Giá KOL Sau Chiến Dịch"*.
4. Lark sẽ tự động biến các cột dữ liệu thành các câu hỏi trắc nghiệm / thang điểm sao. Bạn có thể kéo thả để ẩn/hiện hoặc đổi thứ tự câu hỏi tùy ý.
5. Bấm nút **Share Form** ở góc phải:
   - Bạn có thể copy link form gửi vào nhóm chat của team.
   - Nhân viên chỉ cần bấm vào link trên máy tính hoặc mở app Lark trên điện thoại là điền được ngay.

---

## PHẦN 4: CÀI ĐẶT TỰ ĐỘNG THÔNG BÁO VỀ NHÓM CHAT (LARK AUTOMATION)

Để mỗi khi có ai nộp form đánh giá, cả team đều nhận được thông báo:

1. Trong Base, bấm vào nút **Automations (Tự động hóa)** ở góc trên bên phải.
2. Chọn **Add workflow (Thêm quy trình)**.
3. **Khi nào (Trigger)**: Chọn *"When a record is created"* -> Chọn Bảng *"3. Đánh Giá Hiệu Suất Sau Dự Án"*.
4. **Hành động (Action)**: Chọn *"Send message to bot/chat"* -> Chọn nhóm chat công ty trên Lark.
5. Nội dung tin nhắn:
   > *"📢 Đã có đánh giá mới sau dự án!*  
   > *KOL: [Tên KOL] | Điểm đánh giá: [Đánh giá chung] sao*  
   > *Người đánh giá: [Người thực hiện đánh giá]"*
6. Bấm **Activate (Kích hoạt)**.

---

## PHẦN 5: CHẠY TÍCH HỢP CÀO DỮ LIỆU TỰ ĐỘNG TỪ META QUA APIFY (MODULE 2)

Khi bạn đã có **Apify API Token** (lấy từ [console.apify.com](https://console.apify.com) -> Settings -> Integrations):

Chạy lệnh scout tự động với từ khóa bạn mong muốn:

```bash
python3 scripts/apify_lark_sync.py <APIFY_TOKEN> <LARK_APP_TOKEN> <LARK_TABLE_ID> "pickleball vietnam"
```

Hệ thống sẽ:
1. Gọi Apify cào các profile Instagram/Facebook công khai liên quan đến môn thể thao bạn chọn.
2. Bóc tách số lượng followers, bio, link cá nhân, tự động nhận diện môn thể thao (Pickleball, Tennis...).
3. Tự động ghi thẳng các KOL mới này vào Bảng `1. Danh Bạ KOLs & Community` trên Lark Base ở trạng thái *"Tiềm năng"*.
