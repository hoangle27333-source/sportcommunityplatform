# BẢNG KHẢO SÁT & XÁC ĐỊNH YÊU CẦU CHI TIẾT (REQUIREMENTS SPECIFICATION QUESTIONNAIRE)
## DỰ ÁN: CỔNG QUẢN TRỊ & KHÁM PHÁ DỮ LIỆU KOL / COMMUNITY THỂ THAO TRÊN LARK BASE
**Mục tiêu**: Xây dựng một không gian làm việc (Portal) tập trung, trực quan, thao tác qua các nút bấm (Action Buttons) và Chế độ xem linh hoạt (Multi-views), hạn chế tối đa việc người dùng phải thao tác trực tiếp trên bảng dữ liệu thô (Raw Data).

---

### Kính gửi: Ban Quản lý Dự án & Quý Khách hàng,
Để đảm bảo hệ thống trên Lark Base được cấu hình đúng 100% với nhu cầu sử dụng thực tế và thói quen làm việc của đội ngũ, kính mời Quý khách hàng cùng định nghĩa các yêu cầu chi tiết thông qua bảng khảo sát dưới đây:

---

## PHẦN 1: THIẾT KẾ TRANG CHỦ TRUNG TÂM (PORTAL HOMEPAGE) & CÁC NÚT HÀNH ĐỘNG (ACTION BUTTONS)

**Định hướng**: Người dùng (nhân viên/quản lý) khi truy cập hệ thống sẽ chỉ nhìn thấy một **Màn hình điều khiển trung tâm (Dashboard Portal)**. Tại đây có sẵn các nút bấm hành động nhanh và bảng tra cứu, không cần vào các bảng tính thô.

### Câu 1.1: Quý khách muốn đặt những Nút Bấm Hành Động Nhanh (Quick Action Buttons) nào tại trang chủ?
*(Vui lòng tick chọn các nút mong muốn xuất hiện hoặc bổ sung thêm)*
- [ ] **Nút 1: "🔍 Yêu Cầu Scout Tự Động"**  
  *Hành động*: Bấm vào sẽ mở ra Biểu mẫu (Form) để nhân viên nhập từ khóa (ví dụ: *Pickleball Hà Nội*), chọn số lượng -> Bot tự động chạy ngầm cào dữ liệu về hệ thống.
- [ ] **Nút 2: "⭐ Đánh Giá KOL Sau Dự Án"**  
  *Hành động*: Bấm vào sẽ mở ra Form chấm điểm nghiệm thu sau chiến dịch (chấm điểm sao, thái độ, deadline, KPI cam kết vs thực tế, ảnh hợp đồng/nghiệm thu).
- [ ] **Nút 3: "➕ Thêm Nhanh 1 KOL Mới"**  
  *Hành động*: Dành cho nhân sự khi gặp một KOL ngoài đời hoặc có contact riêng, bấm vào mở form điền thông tin nhanh lưu vào hệ thống.
- [ ] **Nút 4: "👥 Thêm Nhanh 1 Group / Cộng Đồng Mới"**  
  *Hành động*: Mở form nhập nhanh thông tin một Group/CLB thể thao mới.
- [ ] **Nút 5: "📁 Tải Lên Danh Sách (Import File Excel/CSV)"**  
  *Hành động*: Nút bấm hướng dẫn và kích hoạt luồng tải file Excel danh bạ cũ đưa vào hệ thống trong 5 giây.
- [ ] **Nút 6: Khác (Quý khách ghi rõ nếu có)**: ............................................................................

---

## PHẦN 2: ĐỊNH NGHĨA CÁC CHẾ ĐỘ XEM ĐA CHIỀU (MULTI-VIEWS)

Người dùng có thể chuyển đổi linh hoạt giữa các góc nhìn dữ liệu mà không cần lọc bằng tay:

### Câu 2.1: View theo Bộ Môn Thể Thao (Sport Niche Views)
Quý khách muốn giao diện xem theo bộ môn hiển thị dưới hình thức nào?
- [ ] **Lựa chọn A (Khuyên dùng)**: Dạng **Thẻ Danh Thiếp (Gallery View)** — Mỗi KOL/Group là một card hình ảnh đẹp mắt, có tab chuyển đổi trên đầu: *[Tất cả] | [Pickleball] | [Tennis] | [Chạy bộ / Marathon] | [Gym & Fitness] | [Cầu lông] | [Bóng đá] | [Golf]*.
- [ ] **Lựa chọn B**: Dạng **Bảng Lưới Phân Cụm (Grouped Grid View)** — Danh sách bảng nhưng tự động gom nhóm theo từng môn.
- [ ] **Danh mục các bộ môn thể thao chính cần quản lý** *(bỏ bớt hoặc thêm mới)*:
  * Pickleball
  * Tennis
  * Chạy bộ / Marathon / Trail
  * Gym / Fitness / Yoga / Pilates
  * Cầu lông
  * Bóng đá
  * Đạp xe (Cycling)
  * Golf
  * Môn khác (bổ sung): ............................................................................

### Câu 2.2: View theo Vùng Miền & Địa Lý (Geography Views)
Tiêu chí phân chia khu vực địa lý để phục vụ các sự kiện/chiến dịch địa phương:
- [ ] Phân chia theo **Vùng miền**: *Toàn quốc, Miền Bắc, Miền Trung, Miền Nam*.
- [ ] Phân chia theo **Thành phố trọng điểm**: *Hà Nội, TP. Hồ Chí Minh, Đà Nẵng, Hải Phòng, Cần Thơ, Khác*.
- [ ] Cả hai cách trên (Có thể lọc kết hợp cả Vùng và Tỉnh thành).

### Câu 2.3: View theo Kênh Mạng Xã Hội (Channel Views)
Quý khách muốn có sẵn các tab lọc nhanh theo từng kênh truyền thông không?
- [ ] Tab **Instagram Influencers** (Tập trung vào hình ảnh đẹp, Reels, lifestyle thể thao).
- [ ] Tab **Facebook & Fanpages** (Tập trung vào bài viết dài, livestream, cộng đồng tương tác).
- [ ] Tab **Threads Creators** (Tập trung vào thảo luận chuyên sâu, chữ, quan điểm cá nhân).
- [ ] Tab **TikTok Sport Creators** (Tập trung vào video ngắn viral).
- [ ] Tab **YouTube Sport Channels** (Tập trung vào video dài, hướng dẫn kỹ thuật, review chuyên sâu).

### Câu 2.4: View theo Phân Khúc Quy Mô (Tier Views)
Tiêu chí phân nhóm KOLs theo lượng người theo dõi (Followers) của công ty:
- [ ] **Nano-Influencer**: Dưới 10.000 followers (chi phí rẻ/miễn phí, độ thân thiết cao).
- [ ] **Micro-Influencer**: 10.000 – 50.000 followers (tương tác rất tốt, phù hợp lan tỏa phong trào).
- [ ] **Macro-Influencer**: 50.000 – 200.000 followers (uy tín cao, chuyên môn tốt).
- [ ] **Mega-Influencer / Ngôi sao**: Trên 200.000 followers (VĐV nổi tiếng, quán quân giải đấu).
- [ ] *Quý khách có muốn điều chỉnh lại các mốc số lượng này không?*: .....................................................

---

## PHẦN 3: HỒ SƠ TỔNG HỢP 360° CỦA MỘT KOL (KOL 360° DOSSIER)

Khi một nhân sự bắt đầu dự án mới và bấm chọn xem 1 KOL cụ thể (ví dụ: *Đỗ Kim Phúc* hoặc *Hana Giang Anh*), màn hình tổng hợp sẽ hiện ra.

### Câu 3.1: Quý khách muốn những khối thông tin nào xuất hiện trên Hồ Sơ 360° này?
- [ ] **Khối 1: Thông tin định danh & Liên hệ**: Avatar, Tên thật, Nickname, Giới tính, Năm sinh, Vị trí địa lý, Email, SĐT/Zalo quản lý.
- [ ] **Khối 2: Ma trận đa kênh (Multi-channel Performance)**: Bảng thống kê Followers, Lượt xem trung bình (Avg Views), Tỷ lệ tương tác (ER %) trên từng kênh (Insta, FB, Threads, TikTok).
- [ ] **Khối 3: Bảng giá tham khảo (Rate Card & Deliverables)**: Mức giá ước tính theo từng gói: *1 Bài post ảnh / 1 Video Reels / 1 Video TikTok / 1 Buổi tham gia sự kiện offline (Check-in/Thi đấu)*.
- [ ] **Khối 4: Lịch sử hợp tác & Điểm đánh giá (Project Performance History)**: Danh sách các dự án công ty đã từng chạy với KOL này, hiển thị trực quan:
  * Điểm Rating trung bình: ⭐⭐⭐⭐⭐ (1 – 5 sao)
  * Điểm thái độ làm việc: ⭐⭐⭐⭐⭐ (1 – 5 sao)
  * Đánh giá tiến độ (Đúng hạn deadline / Chậm trễ)
  * Tỷ lệ hoàn thành KPI cam kết (%)
  * Toàn bộ ghi chú kinh nghiệm thực tế của các bạn phụ trách trước (Lưu ý về tính cách, các điểm cần cẩn trọng).
- [ ] **Khối 5: Các bài viết / Video Reels gần đây (Scouted Posts)**: Các bài viết nổi bật gần nhất đã cào được từ mạng xã hội kèm số view, số like và link xem trực tiếp.
- [ ] Bổ sung trường khác: ............................................................................

---

## PHẦN 4: BIỂU MẪU ĐÁNH GIÁ SAU DỰ ÁN (POST-PROJECT REVIEW FORM)

Đây là biểu mẫu nhân sự phụ trách dự án sẽ điền (trên máy tính hoặc app điện thoại) mỗi khi kết thúc một chiến dịch.

### Câu 4.1: Các tiêu chí cần có trong Form đánh giá sau chiến dịch:
1. **Dự án áp dụng**: Chọn từ danh sách dự án công ty đang chạy.
2. **KOL / Đối tác nghiệm thu**: Chọn từ danh bạ KOLs.
3. **Chi phí thực tế thanh toán (VNĐ)**: Số tiền thực chi.
4. **Hạng mục đã thực hiện**: [ ] Bài đăng Fanpage [ ] Video Reels [ ] Check-in sự kiện [ ] Livestream.
5. **Đánh giá chung về hiệu quả**: Thang điểm 1 – 5 sao (⭐⭐⭐⭐⭐).
6. **Đánh giá thái độ hợp tác**: Thang điểm 1 – 5 sao.
7. **Đảm bảo tiến độ / Deadline**:
   * ( ) Rất đúng hạn (Giao bài trước deadline)
   * ( ) Đúng hạn
   * ( ) Chậm trễ có lý do và báo trước
   * ( ) Vi phạm nghiêm trọng deadline
8. **Chỉ số KPI đạt được**:
   * Số lượng View cam kết vs View thực tế đạt được.
   * Số lượng Lượt tương tác (Like/Share/Cmt) cam kết vs Thực tế.
   * Số lượng Khách đăng ký / Lead cam kết vs Thực tế (nếu có).
9. **Ghi chú quan trọng cho các dự án sau**: Ô điền tự do để note các kinh nghiệm làm việc thực tế (thói quen, tính cách, có phát sinh chi phí gì không).
10. **Tệp đính kèm**: Chỗ tải lên ảnh chụp bài đăng nghiệm thu, hóa đơn hoặc hợp đồng thanh lý.

*Quý khách có muốn thêm hoặc bớt câu hỏi nào trong form trên không?*: .....................................................

---

## PHẦN 5: PHÂN QUYỀN TRUY CẬP & BẢO MẬT DỮ LIỆU (PERMISSIONS & SECURITY)

Để đảm bảo tính bảo mật nội bộ trong công ty:

### Câu 5.1: Phân quyền xem Bảng giá (Rate card) và Chi phí hợp đồng:
- [ ] **Phương án 1 (Công khai nội bộ)**: Tất cả nhân viên trong team Marketing/Vận hành đều được xem Bảng giá và Chi phí dự án để tiện lên kế hoạch.
- [ ] **Phương án 2 (Bảo mật theo cấp bậc)**: Nhân viên bình thường chỉ được xem thông tin liên hệ và chỉ số social; Chỉ có cấp Quản lý (PM, Marketing Lead, Ban Giám đốc) mới xem được cột Bảng giá và Chi phí thực chi.

### Câu 5.2: Phân quyền Chỉnh sửa dữ liệu:
- [ ] Tất cả nhân viên đều được quyền thêm KOL mới và nộp form đánh giá sau dự án.
- [ ] Chỉ có Quản trị viên (Admin) mới có quyền Xóa hồ sơ KOL hoặc Sửa cấu trúc cột của hệ thống.

---

### XÁC NHẬN CỦA KHÁCH HÀNG / ĐƠN VỊ PHÊ DUYỆT:
- **Người đại diện phê duyệt**: ............................................................................
- **Chức vụ**: ............................................................................................
- **Ngày xác nhận**: ...... / ...... / 2026
