# BÁO CÁO PHÂN TÍCH GIẢI PHÁP & CHI PHÍ VẬN HÀNH
## DỰ ÁN: HỆ THỐNG QUẢN LÝ & TÌM KIẾM KOL / COMMUNITY THỂ THAO (STANDALONE PLATFORM)

---

## 1. TỔNG QUAN & TÓM TẮT ĐỀ XUẤT (EXECUTIVE SUMMARY)

Tài liệu này được biên soạn nhằm phân tích tính khả thi kỹ thuật, chi phí đầu tư ban đầu và chi phí vận hành định kỳ cho 2 module nghiệp vụ mới khi tách thành một nền tảng độc lập:
1. **Module 1**: Không gian quản lý dữ liệu KOL & Community thể thao, lịch sử dự án và form đánh giá hiệu suất sau mỗi chiến dịch.
2. **Module 2**: Công cụ tìm kiếm & tổng hợp thông tin tự động (Scout) trên Facebook, Instagram và Threads.

### Tóm tắt khuyến nghị chiến lược (Strategic Recommendation):

| Module | Đề xuất giải pháp tối ưu | Lý do cốt lõi | Chi phí vận hành định kỳ |
| :--- | :--- | :--- | :--- |
| **Module 1 (KOL Hub)** | **Sử dụng nền tảng Lark Base (No-Code Database)** | Tiết kiệm 100% thời gian dev ban đầu; form đánh giá cực kỳ linh hoạt; hỗ trợ mobile app sẵn có; chi phí phần mềm **0 VNĐ**. | **0 VNĐ/tháng** (Free tier đến 50 người) |
| **Module 2 (Scout Meta)** | **Tích hợp dịch vụ Scraping chuyên nghiệp (Apify API)** | Meta siết chặt chính sách chống bot, đóng API tìm kiếm công khai. Tự build crawler sẽ gặp rủi ro chết IP, chi phí proxy đắt đỏ và gãy code liên tục. Dùng Apify đảm bảo dữ liệu ổn định và chi phí cố định. | **~$49/tháng** (~1.250.000 VNĐ) |
| **Hạ tầng nền tảng (Platform Infra)** | **Cloud VPS / PaaS kết hợp Cloudflare R2** | Đảm bảo tốc độ truy cập cao, bảo mật, chi phí lưu trữ ảnh/hợp đồng gần như bằng 0. | **~350.000 – 500.000 VNĐ/tháng** |

---

## 2. PHÂN TÍCH CHI TIẾT MODULE 1: KOL & COMMUNITY PERFORMANCE HUB

### 2.1. Yêu cầu nghiệp vụ
- Lưu trữ danh bạ KOLs và các Group/Cộng đồng trong lĩnh vực thể thao (chạy bộ, tennis, pickleball, gym, bóng đá...).
- Khi kết thúc mỗi chiến dịch/dự án, nhân sự phụ trách điền form đánh giá (hiệu quả thực tế vs cam kết, thái độ hợp tác, tính kỷ luật, rating sao, các lưu ý/phốt nếu có).
- Nhân sự khác khi bắt đầu dự án mới có thể tra cứu toàn bộ lịch sử làm việc trong quá khứ của KOL đó trước khi quyết định ký hợp đồng.

### 2.2. So sánh các phương án thực hiện

#### Phương án 1A: Tự lập trình (Custom Development) trên hệ thống riêng
- **Mô tả**: Thiết kế cơ sở dữ liệu (Postgres), viết API Backend và dựng giao diện Frontend (React/Next.js).
- **Thời gian triển khai**: 2.5 – 3.5 tuần (13 – 19 ngày công dev).
- **Chi phí dev ban đầu**: **~20.000.000 – 30.000.000 VNĐ**.
- **Nhược điểm lớn**:
  - **Kém linh hoạt**: Mỗi khi phòng Marketing muốn bổ sung một tiêu chí đánh giá mới vào form (ví dụ: *"KOL có hỗ trợ quay video ngắn không?"*), đội ngũ kỹ thuật phải sửa code, đổi migration database và deploy lại.
  - Tốn thêm chi phí thiết kế và tối ưu trải nghiệm trên điện thoại (Mobile Responsive).

#### Phương án 1B: Sử dụng nền tảng có sẵn – Lark Base (KHUYẾN NGHỊ SỐ 1)
- **Mô tả**: Xây dựng cơ sở dữ liệu quan hệ (Relational Base) trên Lark, thiết lập Form View tự động gửi thông báo về nhóm chat khi có người nộp đánh giá.
- **Thời gian triển khai**: **Chỉ mất 1 – 2 ngày** để thiết lập hoàn chỉnh.
- **Chi phí thiết lập ban đầu**: **~2.000.000 – 3.000.000 VNĐ** (hoặc nội bộ tự cấu hình 0đ).
- **Tại sao client nên chọn Lark Base?**:
  1. **Chi phí 0 đồng**: Gói Free của Lark hỗ trợ tối đa **50 tài khoản**, dung lượng **20.000 bản ghi/base**, tính năng Form nhập liệu không giới hạn và 200 lượt tự động hóa/tháng. Hoàn toàn miễn phí cho quy mô hiện tại.
  2. **Tùy biến form trong 30 giây**: Trưởng phòng hoặc nhân sự vận hành có thể tự tạo/thêm bớt các câu hỏi đánh giá bất cứ lúc nào mà không cần sự can thiệp của lập trình viên.
  3. **Ứng dụng di động (Mobile App) hoàn hảo**: Nhân sự đi sự kiện hoặc gặp trực tiếp KOL có thể mở app điện thoại để tra cứu lịch sử hoặc điền đánh giá ngay tại hiện trường.
  4. **Phân quyền và bảo mật**: Phân quyền chi tiết (ai được quyền xem báo cáo nhạy cảm, ai chỉ được điền form).
  5. **Khả năng mở rộng**: Nếu sau này muốn nhúng (Embed) bảng này vào Web Portal nội bộ hoặc đồng bộ về hệ thống riêng, Lark cung cấp sẵn Open API hoàn toàn miễn phí.

---

## 3. PHÂN TÍCH CHI TIẾT MODULE 2: SCOUT TRÊN FACEBOOK, INSTAGRAM, THREADS

### 3.1. Khó khăn cốt lõi: Tại sao KHÔNG THỂ tự viết Bot cào Meta hiện nay?

Hệ sinh thái của Meta (Facebook, Instagram, Threads) đang duy trì rào cản kỹ thuật chống thu thập dữ liệu (Anti-scraping) nghiêm ngặt nhất thế giới:

1. **Meta Graph API đã đóng hoàn toàn tính năng tìm kiếm công khai**:
   - Kể từ sau các sự cố bảo mật quyền riêng tư, Meta **không cấp API** cho phép tìm kiếm hồ sơ người dùng hoặc quét thành viên nhóm công khai.
   - *Instagram Graph API*: Chỉ cho phép đọc số liệu của chính tài khoản doanh nghiệp được ủy quyền (phải đăng nhập tài khoản đó).
   - *Facebook Group API*: Chỉ đọc được bài viết nếu ứng dụng được cấp quyền trực tiếp bởi Admin của Group đó.
   - *Threads API (2024)*: Chỉ phục vụ đăng bài và phân tích cho chính chủ sở hữu tài khoản, không hỗ trợ công cụ tìm kiếm khám phá diện rộng (Global Discovery).
2. **Cơ chế phát hiện và chặn Bot tự động (Anti-bot Protection)**:
   - Nếu dùng các thư viện tự động hóa như Puppeteer, Playwright, Selenium để cào dữ liệu:
     - **Chặn dải IP Datacenter**: Các máy chủ thuê tại AWS, Google Cloud, DigitalOcean, Hetzner... bị Meta chặn ngay lập tức tại cổng mạng.
     - **Khóa tài khoản (Checkpoint)**: Bất kỳ tài khoản ảo (clone) nào dùng để đăng nhập quét dữ liệu đều sẽ bị Meta phát hiện và khóa vĩnh viễn chỉ sau vài chục yêu cầu.
     - **Thay đổi giao diện liên tục**: Meta liên tục xáo trộn mã HTML/CSS. Bộ cào tự viết hôm nay có thể ngừng hoạt động hoàn toàn vào tuần sau.
3. **Chi phí "bẫy bảo trì" nếu tự làm**:
   - Cần mua mạng Proxy Dân Cư xoay vòng (Residential Proxies): Tối thiểu $100 – $300/tháng.
   - Cần 1 lập trình viên tốn 15 – 20 giờ mỗi tháng chỉ để trực và sửa lỗi mỗi khi Meta đổi thuật toán.

---

### 3.2. Giải pháp tối ưu: Sử dụng Dịch vụ Quản lý Scraping Chuyên Nghiệp (APIFY API)

Để giải quyết bài toán cào dữ liệu trên Meta mà không phải "đốt tiền" duy trì hạ tầng máy chủ và đối mặt với rủi ro bị chặn, **giải pháp khả thi và kinh tế nhất là tích hợp thông qua Apify**.

#### Apify hoạt động như thế nào?
- Apify là nền tảng chuyên nghiệp hàng đầu thế giới về dữ liệu mạng xã hội. Họ duy trì sẵn hàng trăm "Actors" (Bộ cào chuẩn hóa) cho Instagram, Facebook Groups và Threads.
- Đội ngũ kỹ sư của Apify chịu trách nhiệm liên tục cập nhật mã nguồn chống chặn, duy trì hàng triệu IP dân cư sạch trên toàn cầu và tự động vượt qua Captcha của Meta.
- Phía chúng ta chỉ cần viết API gọi sang Apify bằng một dòng lệnh, Apify sẽ quét và trả về định dạng JSON chuẩn:
  - Tên, Bio, Hashtag, Link ảnh đại diện.
  - Vị trí địa lý (trích xuất từ Bio/Địa điểm check-in).
  - Số lượng người theo dõi (Followers), lượt thích, thành viên nhóm.
  - Số lượng bài viết, lượt tương tác trung bình (Engagement Rate).

#### Bảng so sánh chi phí giữa Tự Viết Crawler và Dùng Apify:

| Tiêu chí | Tự phát triển Bot Crawler | Sử dụng Apify API (Đề xuất) |
| :--- | :--- | :--- |
| **Chi phí lập trình ban đầu** | 20.000.000 – 35.000.000 VNĐ (4 – 6 tuần) | 5.000.000 – 8.000.000 VNĐ (1 tuần tích hợp) |
| **Chi phí máy chủ Worker** | 500.000 – 1.000.000 VNĐ/tháng (RAM lớn) | **0 VNĐ** (Apify chạy trên cloud của họ) |
| **Chi phí Proxy Dân Cư** | 2.500.000 – 5.000.000 VNĐ/tháng ($100 – $200) | **Đã bao gồm sẵn trong gói Apify** |
| **Chi phí dịch vụ giải Captcha** | 200.000 – 400.000 VNĐ/tháng | **Đã bao gồm sẵn** |
| **Gói dịch vụ API** | 0 VNĐ | **~$49/tháng** (~1.250.000 VNĐ) |
| **Độ ổn định hệ thống** | Thấp (Dễ chết bot bất thình lình) | Rất cao (Được bảo đảm bởi Apify SLA) |
| **TỔNG CHI PHÍ VẬN HÀNH/THÁNG** | **~3.200.000 – 6.400.000 VNĐ/tháng** | **~1.250.000 VNĐ/tháng** ($49/tháng) |

---

## 4. TỔNG HỢP CHI PHÍ HẠ TẦNG & VẬN HÀNH HÀNG THÁNG (INFRA COSTS)

Khi tách thành một Platform riêng biệt phục vụ cho 2 module trên, dự toán chi phí vận hành hàng tháng theo mô hình tối ưu được khuyến nghị như sau:

| Hạng mục | Dịch vụ đề xuất | Chi phí ước tính / Tháng | Ghi chú |
| :--- | :--- | :---: | :--- |
| **Module 1 (KOL Hub)** | Lark Base (Bản Free) | **0 VNĐ** | Đủ dùng cho tối đa 50 nhân viên, 20.000 bản ghi dữ liệu. |
| **Module 2 (Scout Engine)** | Apify Starter Plan | **~1.250.000 VNĐ** *(~$49)* | Đủ cào từ 3.000 – 8.000 profile/nhóm mỗi tháng. |
| **Máy chủ Web & API Platform** | VPS 2 vCPU - 4GB RAM (Hetzner / Vietnix) | **~350.000 VNĐ** *(~$14)* | Đủ chạy giao diện web độc lập, backend kết nối database. |
| **Cơ sở dữ liệu (Database)** | PostgreSQL (Host trên VPS) | **0 VNĐ** | Chạy kèm trên cùng cụm VPS tối ưu chi phí. |
| **Lưu trữ hình ảnh/tệp đính kèm** | Cloudflare R2 Storage | **0 – 30.000 VNĐ** | Miễn phí 10GB dung lượng đầu và 0đ phí băng thông tải về. |
| **Tên miền & Bảo mật (SSL/CDN)** | Domain `.vn` + Cloudflare Free | **~35.000 VNĐ** | Tương đương ~400.000 VNĐ/năm. |
| **TỔNG CHI PHÍ VẬN HÀNG THÁNG** | | **~1.650.000 VNĐ / tháng** *(~$65 / tháng)* | |
| **TỔNG CHI PHÍ VẬN HÀNH CẢ NĂM** | | **~19.800.000 VNĐ / năm** *(~$780 / năm)* | |

*(Nếu so sánh với phương án tự build toàn bộ từ đầu, chi phí hạ tầng và vận hành đã được tiết kiệm hơn **65%**, đồng thời triệt tiêu hoàn toàn rủi ro bị khóa hệ thống).*

---

## 5. LỘ TRÌNH TRIỂN KHAI ĐỀ XUẤT (ACTION ROADMAP)

Để dự án đạt hiệu quả cao nhất và giải ngân ngân sách hợp lý, lộ trình triển khai nên chia làm 2 giai đoạn:

### Giai đoạn 1: Đưa Module 1 vào hoạt động ngay (Tuần 1)
- Thiết lập cấu trúc dữ liệu trên **Lark Base**:
  - Bảng 1: Danh bạ KOL & Community thể thao (phân loại môn, khu vực, liên hệ, rate card).
  - Bảng 2: Danh sách chiến dịch / Dự án.
  - Bảng 3: Form đánh giá sau dự án (KPI cam kết, KPI thực tế, đánh giá thái độ, rating sao, ảnh nghiệm thu).
- Tổ chức bàn giao và hướng dẫn nhân viên điền thử nghiệm ngay sau các dự án đang chạy.
- **Thời gian**: 2 – 3 ngày làm việc.
- **Lợi ích**: Doanh nghiệp có ngay công cụ quản lý mà không cần chờ đợi code, dữ liệu bắt đầu được tích lũy ngay lập tức.

### Giai đoạn 2: Tích hợp Module 2 (Scout qua Apify) & Đóng gói Platform (Tuần 2 – Tuần 3)
- Đăng ký tài khoản và thiết lập các kịch bản cào dữ liệu trên **Apify** cho Facebook, Instagram và Threads.
- Xây dựng giao diện tìm kiếm (Scout Dashboard) trên Web Platform:
  - Cho phép người dùng nhập từ khóa môn thể thao hoặc khu vực.
  - Nút bấm *"Tìm kiếm & Quét dữ liệu"*: Hệ thống gọi sang Apify, tiếp nhận danh sách và hiển thị dạng danh thiếp kèm số liệu followers/ER.
  - Nút *"Lưu vào Database"*: Bấm 1 click để chuyển thẳng thông tin KOL vừa scout vào cơ sở dữ liệu (Lark Base hoặc Web DB).
- Kiểm thử và bàn giao hoàn thiện toàn bộ nền tảng độc lập.
