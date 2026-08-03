# Automated Content Hub — Requirements

> Phiên bản: 1.0 · Ngày: 2026-07-29 · Trạng thái: Draft chờ duyệt
> Nguồn: `Detailed_Product_Roadmap_English.csv`, `Product_Roadmap_Auto_Content.csv`, `proposal.html`

## 1. Bối cảnh & mục tiêu

Content Hub là bảng điều khiển nội bộ cho team marketing thể thao tại Việt Nam. Hệ thống tự động hoá vòng đời nội dung: thu thập tín hiệu xu hướng → tạo nội dung bằng AI → duyệt → lên lịch đăng lên Fanpage/Instagram mình sở hữu → đo lường → rút ra bài học cho lần sau.

Mục tiêu định lượng cho MVP:
- Giảm thời gian từ ý tưởng đến bài đăng đã lên lịch xuống dưới 5 phút cho nội dung ảnh + caption.
- Một nội dung fan-out được ra ≥ 5 channel (Fanpage + IG) trong một lần duyệt.
- Chi phí tạo nội dung ≤ 500₫/ảnh, ≤ 900₫/video 30s, ~0₫/banner.

## 2. Phạm vi

**Trong phạm vi:** Ứng dụng 1 — Automated Content Hub (Stage 1–3 của roadmap CSV, sau khi lọc bỏ phần vi phạm ToS).

**Ngoài phạm vi (spec riêng, sau này):** Sports Challenge Platform, chi thưởng VNĐ, booking sân, leaderboard, huy hiệu.

## 3. Người dùng & vai trò

| Vai trò | Quyền |
|---|---|
| `admin` | Toàn quyền. Kết nối/ngắt channel, quản lý user, xem chi phí AI, xem audit log, cấu hình `auto_approve`. |
| `editor` | Tạo/sửa/xoá nội dung của mình, chạy AI generation, lên lịch. **Không** tự duyệt bài của chính mình khi channel bật chế độ duyệt chéo. |
| `viewer` | Chỉ đọc: calendar, analytics, trending library. Không tạo, không duyệt, không đăng. |

Chỉ một team duy nhất (single-tenant). Không có khái niệm tổ chức/workspace nhiều cấp.

## 4. Ký hiệu

Acceptance criteria viết theo EARS: `WHEN <điều kiện> THEN hệ thống SHALL <hành vi>`. Mỗi tiêu chí có ID dạng `R<vùng>.<số>` để `tasks.md` tham chiếu.

---

## R1. Auth & phân quyền

**User story:** Là admin, tôi muốn kiểm soát ai truy cập được Content Hub và ai được đăng bài, để nội dung không lên trang khi chưa qua kiểm duyệt.

- **R1.1** — WHEN người dùng chưa đăng nhập truy cập bất kỳ route nào ngoài `/login` THEN hệ thống SHALL redirect về `/login`.
- **R1.2** — Hệ thống SHALL hỗ trợ đăng nhập bằng email + password và Google OAuth qua Supabase Auth.
- **R1.3** — WHEN một user mới đăng ký THEN hệ thống SHALL gán role `viewer` mặc định và yêu cầu admin nâng quyền thủ công.
- **R1.4** — Hệ thống SHALL thực thi phân quyền ở tầng database bằng RLS, không chỉ ở tầng UI. WHEN một `viewer` gọi trực tiếp API tạo post THEN request SHALL bị từ chối với 403.
- **R1.5** — WHEN role của user bị thay đổi THEN session hiện tại của user đó SHALL phản ánh role mới trong tối đa 60 giây.
- **R1.6** — Hệ thống SHALL ghi mọi thay đổi role vào audit log (xem R9.1).

## R2. Kết nối channel (Meta OAuth & token)

**User story:** Là admin, tôi muốn kết nối các Fanpage và tài khoản Instagram Business của công ty một lần, rồi quên nó đi — hệ thống tự lo việc gia hạn token và báo tôi khi có vấn đề.

- **R2.1** — Hệ thống SHALL cho phép admin kết nối qua Facebook Login với scope: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_read_user_content`, `pages_manage_engagement`, `read_insights`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights`, `business_management`.
- **R2.2** — WHEN OAuth thành công THEN hệ thống SHALL đổi short-lived user token sang long-lived token, lấy danh sách Page kèm Page access token, và hiển thị danh sách để admin chọn Page nào đưa vào hệ thống.
- **R2.3** — WHEN một Page được chọn THEN hệ thống SHALL tự phát hiện IG Business account liên kết (`connected_instagram_account` / `instagram_business_account`) và tạo channel IG tương ứng nếu có.
- **R2.4** — Hệ thống SHALL lưu mọi access token ở dạng mã hoá at-rest và SHALL KHÔNG trả token về client dưới bất kỳ hình thức nào (kể cả dạng rút gọn).
- **R2.5** — Hệ thống SHALL chạy health check token mỗi 24 giờ bằng `GET /debug_token`, lưu `expires_at` và `scopes` thực tế.
- **R2.6** — WHEN token sắp hết hạn trong ≤ 7 ngày, hoặc bị thu hồi, hoặc thiếu scope cần thiết THEN hệ thống SHALL đánh dấu channel là `needs_reauth`, hiện banner đỏ trong UI, và gửi email cho toàn bộ admin.
- **R2.7** — WHEN một channel ở trạng thái `needs_reauth` THEN hệ thống SHALL KHÔNG cố đăng bài lên channel đó, và SHALL giữ các post đã lên lịch ở trạng thái `scheduled` thay vì để chúng `failed`.
- **R2.8** — Hệ thống SHALL cho phép admin ngắt kết nối channel; WHEN ngắt kết nối THEN token SHALL bị xoá khỏi database còn dữ liệu lịch sử (post, metrics) SHALL được giữ lại.
- **R2.9** — Mọi request tới Meta SHALL dùng version cố định `v25.0` khai báo ở một hằng số duy nhất, không dùng URL không có version.

## R3. Trending Library (nguồn dữ liệu hợp pháp)

**User story:** Là editor, tôi muốn thấy nội dung nào đang chạy tốt để lấy cảm hứng, mà không phải mở 20 tab Facebook.

Ba nguồn được phép, không có nguồn thứ tư:

- **R3.1** — Nguồn A (own insights): Hệ thống SHALL nạp các post hiệu suất cao nhất từ chính Page/IG đã kết nối vào Trending Library, tự động, mỗi ngày.
- **R3.2** — Nguồn B (IG Hashtag Search): Hệ thống SHALL cho phép admin cấu hình danh sách hashtag theo môn thể thao (pickleball, cầu lông, bóng đá…) và nạp `top_media` / `recent_media` qua `ig_hashtag_search` chính thức.
- **R3.3** — Nguồn B giới hạn: Hệ thống SHALL theo dõi số hashtag unique đã query trong cửa sổ 7 ngày cho mỗi IG account và SHALL từ chối thêm hashtag mới khi sắp đạt hạn mức, kèm thông báo rõ lý do và thời điểm hạn mức reset.
- **R3.4** — Nguồn C (manual): Hệ thống SHALL cho phép editor thêm item thủ công bằng cách dán URL post công khai (dùng oEmbed để lấy metadata) hoặc nhập tay tiêu đề + ảnh + ghi chú.
- **R3.5** — Hệ thống SHALL dedupe trending item theo `(source_type, external_id)` và theo URL đã chuẩn hoá; WHEN item trùng THEN hệ thống SHALL cập nhật metric thay vì tạo bản ghi mới.
- **R3.6** — Hệ thống SHALL tính `engagement_score` cho mỗi item theo công thức có thể cấu hình, mặc định `(reactions + comments*3 + shares*5) / max(views, 1)` chuẩn hoá theo tuổi của post; công thức SHALL được lưu kèm version để so sánh về sau vẫn hiểu.
- **R3.7** — Hệ thống SHALL hiển thị library dạng lưới ảnh, filter theo môn thể thao / nguồn / khoảng thời gian / điểm engagement, sort theo score hoặc ngày.
- **R3.8** — Hệ thống SHALL cho phép editor shortlist một item và tạo post nháp từ nó; WHEN tạo từ trending item THEN post SHALL lưu `inspired_by_trending_item_id` để về sau đo được nội dung lấy cảm hứng có chạy tốt hơn không.
- **R3.9** — Hệ thống SHALL lưu **URL và metadata** của item ở nguồn B, và SHALL KHÔNG tải/lưu lại file media gốc của người khác lên storage của mình.

## R4. AI Content Generation

**User story:** Là editor, tôi muốn từ một ý tưởng ngắn tạo ra caption tiếng Việt tự nhiên, một banner đẹp và một video 30 giây, không cần mở Photoshop.

- **R4.1** — Hệ thống SHALL tạo caption tiếng Việt từ brief (chủ đề, môn thể thao, CTA, độ dài mong muốn, tone), kèm bộ hashtag đề xuất và một CTA.
- **R4.2** — WHEN tạo caption THEN prompt SHALL được bổ sung bằng insight đang có từ R7 (ví dụ độ dài caption nào đang chạy tốt, hashtag nào hiệu quả), và hệ thống SHALL ghi lại `prompt_version` đã dùng.
- **R4.3** — Hệ thống SHALL tạo banner / social card bằng Satori + Sharp từ template có tham số (tiêu đề, phụ đề, logo, ảnh nền, màu theo môn), xuất PNG/JPG đúng tỷ lệ cho từng nền tảng (1:1, 4:5, 9:16, 1.91:1).
- **R4.4** — Hệ thống SHALL tạo ảnh bằng hosted AI API (fal.ai hoặc Replicate) qua một lớp provider trừu tượng; WHEN provider chính lỗi hoặc timeout THEN hệ thống SHALL thử provider dự phòng trước khi báo lỗi cho người dùng.
- **R4.5** — Hệ thống SHALL tạo video ngắn (6–60s) bằng Remotion từ template nhận data đầu vào (ảnh, text overlay, nhạc, logo), render ở worker, xuất MP4 H.264 phù hợp Reels (1080×1920, ≤ 90s).
- **R4.6** — WHEN một job generation chạy THEN UI SHALL hiển thị tiến độ theo trạng thái (`queued`, `running`, `succeeded`, `failed`) và SHALL KHÔNG chặn người dùng làm việc khác.
- **R4.7** — Hệ thống SHALL ghi lại mỗi lần gọi AI: provider, model, input token/params, thời gian, chi phí quy đổi VNĐ, asset đầu ra.
- **R4.8** — Hệ thống SHALL chạy brand-safety check trên mọi nội dung AI tạo ra: chặn danh sách từ khoá cấm cấu hình được, phát hiện claim y tế/cá cược/tài chính, và cảnh báo khi caption chứa số liệu không có trong brief. WHEN check fail THEN nội dung SHALL vào `pending_review` kèm cảnh báo, KHÔNG bị tự động đăng dù channel bật `auto_approve`.
- **R4.9** — Hệ thống SHALL cho phép editor regenerate với brief đã sửa, giữ lại các phiên bản trước để so sánh.

## R5. Composer & Approval

**User story:** Là admin, tôi muốn chắc chắn không có bài nào lên trang mà chưa ai đọc qua.

- **R5.1** — Hệ thống SHALL cung cấp composer cho phép: chọn/upload media, sửa caption, chọn nhiều channel đích, xem preview theo đúng khung của từng nền tảng.
- **R5.2** — Post SHALL đi theo state machine: `draft → generating → pending_review → approved → scheduled → publishing → published`, với nhánh `failed` và `cancelled`. Mọi chuyển trạng thái không nằm trong bảng hợp lệ SHALL bị từ chối ở tầng service.
- **R5.3** — WHEN một post ở trạng thái `pending_review` THEN chỉ user có quyền duyệt trên channel đó SHALL approve hoặc request-changes được.
- **R5.4** — Hệ thống SHALL cho phép cấu hình `auto_approve` **theo từng channel**; WHEN channel bật `auto_approve` và brand-safety check pass THEN post SHALL đi thẳng từ `generating` sang `approved`.
- **R5.5** — WHEN post đã `approved` mà caption hoặc media bị sửa THEN post SHALL tự động quay về `pending_review`.
- **R5.6** — Hệ thống SHALL validate theo ràng buộc từng nền tảng trước khi cho lên lịch: độ dài caption, số hashtag, kích thước/tỷ lệ/độ dài media, số ảnh trong carousel. WHEN validate fail THEN hệ thống SHALL chỉ rõ channel nào và lý do gì.
- **R5.7** — Hệ thống SHALL hỗ trợ comment nội bộ trên post để team trao đổi khi duyệt.

## R6. Lịch & Đăng bài

**User story:** Là editor, tôi muốn kéo thả bài trên calendar và tin rằng nó sẽ lên đúng giờ, không bị đăng hai lần.

- **R6.1** — Hệ thống SHALL cung cấp calendar (tháng/tuần) hiển thị post theo channel, hỗ trợ kéo thả để đổi thời gian đăng.
- **R6.2** — Mọi thời gian SHALL lưu ở UTC trong database và hiển thị theo `Asia/Ho_Chi_Minh` trên UI.
- **R6.3** — WHEN một post `approved` được lên lịch THEN hệ thống SHALL tạo một `publish_job` **cho mỗi channel đích** (fan-out), độc lập nhau.
- **R6.4** — WHEN một channel trong fan-out thất bại THEN các channel còn lại SHALL vẫn đăng bình thường, và post SHALL ở trạng thái tổng hợp `partially_published`.
- **R6.5** — Hệ thống SHALL đảm bảo **idempotency**: mỗi `publish_job` có key `(post_id, channel_id, attempt_group)`; WHEN job bị retry sau khi Meta đã nhận bài THEN hệ thống SHALL KHÔNG tạo bài trùng. Trước khi retry, hệ thống SHALL kiểm tra xem `external_post_id` đã tồn tại chưa.
- **R6.6** — Hệ thống SHALL retry lỗi tạm thời (rate limit, 5xx, timeout) với exponential backoff, tối đa 5 lần; lỗi vĩnh viễn (sai scope, media không hợp lệ, token thu hồi) SHALL fail ngay không retry.
- **R6.7** — Hệ thống SHALL đăng lên Facebook Page: ảnh đơn, nhiều ảnh, video, Reels, và bài chỉ có text + link.
- **R6.8** — Hệ thống SHALL đăng lên Instagram theo luồng 2 bước (tạo media container → publish), hỗ trợ ảnh đơn, carousel và Reels.
- **R6.9** — Hệ thống SHALL thực thi rate limit phía mình trước khi gọi Meta: ≤ 100 bài IG/24h cho mỗi tài khoản, và một token bucket cho FB Page theo hạn mức giờ. WHEN vượt hạn mức THEN job SHALL được hoãn tới cửa sổ tiếp theo thay vì fail.
- **R6.10** — Hệ thống SHALL cho phép huỷ post đã lên lịch trước thời điểm đăng, và SHALL cho phép retry thủ công post đã `failed`.
- **R6.11** — Hệ thống SHALL KHÔNG hỗ trợ đăng tự động vào Facebook Group (Meta đã ngừng hỗ trợ từ 04/2024). UI SHALL không đưa ra lựa chọn này.

## R7. Analytics & AI Learning Loop

**User story:** Là admin, tôi muốn biết loại nội dung nào đang hiệu quả và muốn hệ thống tự học từ đó, không phải tôi ngồi đọc báo cáo rồi nhắc AI.

- **R7.1** — Hệ thống SHALL nạp metric cho mọi post đã published mỗi ngày một lần, lưu snapshot theo ngày (không ghi đè) để dựng được đường xu hướng.
- **R7.2** — Hệ thống SHALL dùng **họ metric mới** của Meta: post-level `post_total_media_view` (Views) và `post_total_media_view_unique` khi khả dụng; page-level Page Content Views (`page_total_media_view`, `page_total_media_view_unique`). Hệ thống SHALL KHÔNG gọi các metric đã bị khai tử ngày 15/06/2026 (`post_impressions*`, `page_impressions*` và 11 biến thể paid/viral/story-type, video impressions, 3-second view).
- **R7.3** — WHEN Meta trả lỗi invalid metric THEN hệ thống SHALL log rõ tên metric bị từ chối, bỏ qua metric đó và vẫn lưu phần còn lại, KHÔNG làm fail toàn bộ job ingest.
- **R7.4** — Hệ thống SHALL hiển thị dashboard: views, unique views, engagement (reactions/comments/shares/saves), engagement rate theo viewer, chia theo channel / môn thể thao / loại nội dung / thời điểm đăng.
- **R7.5** — Hệ thống SHALL đánh dấu rõ mốc **15/06/2026** trên mọi chart chuỗi thời gian đi qua mốc này, và SHALL KHÔNG tính chỉ số tổng hoặc so sánh phần trăm bắc qua mốc đó, vì Meta đo bằng phương pháp khác nhau ở hai phía.
- **R7.6** — Hệ thống SHALL sinh insight định kỳ (tuần) bằng AI từ dữ liệu thật, ví dụ: khung giờ đăng tốt nhất theo channel, độ dài caption hiệu quả, hashtag mang lại engagement cao, định dạng nào đang thắng.
- **R7.7** — Mỗi insight SHALL kèm số liệu chứng minh, kích thước mẫu, và SHALL bị ẩn khi mẫu quá nhỏ (< 10 post) kèm ghi chú "chưa đủ dữ liệu".
- **R7.8** — WHEN editor tạo nội dung mới THEN hệ thống SHALL đưa insight liên quan vào prompt (R4.2) và hiển thị chúng dưới dạng gợi ý có thể tắt.
- **R7.9** — Hệ thống SHALL cho phép export dữ liệu analytics ra CSV.

## R8. Comment Management & AI Reply

**User story:** Là editor, tôi muốn trả lời comment trên bài của công ty nhanh và đúng giọng thương hiệu.

Phạm vi giới hạn nghiêm ngặt: **chỉ trên Page/IG mà hệ thống sở hữu**.

- **R8.1** — Hệ thống SHALL đăng ký webhook nhận comment mới trên các Page/IG đã kết nối, và SHALL xác thực `X-Hub-Signature-256` trên mọi webhook trước khi xử lý.
- **R8.2** — Hệ thống SHALL hiển thị inbox comment gộp theo post, kèm phân loại sentiment và phát hiện câu hỏi.
- **R8.3** — Hệ thống SHALL sinh gợi ý trả lời bằng AI theo persona/tone-of-voice cấu hình được **ở cấp thương hiệu** (không phải để giả làm nhiều người khác nhau).
- **R8.4** — Mặc định gợi ý trả lời SHALL cần người xác nhận mới gửi. Hệ thống SHALL cho phép bật auto-reply cho các nhóm ý định an toàn (ví dụ chào hỏi, hỏi giá đã có câu trả lời cố định), và SHALL KHÔNG auto-reply với comment mang sentiment âm hoặc chứa khiếu nại.
- **R8.5** — Hệ thống SHALL hỗ trợ ẩn/xoá comment spam và trả lời riêng (Private Reply) trong cửa sổ 7 ngày Meta cho phép; WHEN quá cửa sổ THEN UI SHALL vô hiệu hoá nút và nói rõ lý do.
- **R8.6** — Mọi reply do hệ thống gửi SHALL được ghi audit kèm ai duyệt, nội dung gì, lúc nào.

## R9. Admin, Cost & Observability

- **R9.1** — Hệ thống SHALL ghi audit log cho: đăng nhập, kết nối/ngắt channel, đổi role, duyệt post, đăng bài, gửi reply, đổi cấu hình. Mỗi entry gồm actor, hành động, đối tượng, thời gian, IP.
- **R9.2** — Hệ thống SHALL hiển thị chi phí AI theo ngày/tuần/tháng, bóc tách theo loại nội dung và theo provider, quy đổi VNĐ.
- **R9.3** — Hệ thống SHALL cảnh báo admin khi chi phí AI tháng vượt ngưỡng cấu hình được.
- **R9.4** — Hệ thống SHALL hiển thị dashboard sức khoẻ: trạng thái token từng channel, độ sâu queue, job đang fail, mức tiêu thụ rate limit theo channel.
- **R9.5** — Hệ thống SHALL cho phép admin xem chi tiết một `publish_job` thất bại: payload đã gửi (đã che token), lỗi Meta trả về, số lần retry.

## R10. Compliance Guardrails

Mục này là ràng buộc sản phẩm, không phải khuyến nghị. Ghi ra để phạm vi đã loại bỏ không bị thêm lại về sau.

- **R10.1** — Hệ thống SHALL KHÔNG vận hành nhiều tài khoản người dùng cá nhân để tương tác tự động (react/comment/share hộ). Không có anti-detect browser, không có residential proxy pool, không có quản lý session tài khoản cá nhân.
- **R10.2** — Hệ thống SHALL KHÔNG scrape Facebook Page/Group/kết quả tìm kiếm, và SHALL KHÔNG gọi endpoint nội bộ không công khai hay dùng cookie người dùng để lấy dữ liệu.
- **R10.3** — Mọi hành động ghi (đăng bài, comment, reply, ẩn comment) SHALL chỉ thực hiện trên tài sản mà team sở hữu và đã cấp quyền qua OAuth chính thức.
- **R10.4** — Hệ thống SHALL KHÔNG tạo nội dung mạo danh người thật hoặc thương hiệu khác.
- **R10.5** — Mọi dữ liệu ở nguồn B (hashtag search) SHALL chỉ dùng để tham khảo nội bộ; hệ thống SHALL KHÔNG tái đăng lại nội dung của người khác mà không có nguồn/được phép, và UI SHALL nhắc điều này khi editor tạo post từ trending item nguồn B.

### Thay thế cho phạm vi bị loại bỏ

| Roadmap gốc | Lý do loại | Được thay bằng |
|---|---|---|
| Anti-detect seeding 50+ tài khoản, proxy, auto engagement (Stage 1, Day 4–6) | Coordinated inauthentic behavior. Rủi ro mất app Business đã verify → sập luôn phần auto-posting hợp pháp | Multi-Page/IG fan-out publishing (R6.3, R6.4) |
| Persona/tone-of-voice cho từng tài khoản seeding (Stage 1, Day 7) | Cùng lý do trên | Brand-level tone-of-voice cho AI caption (R4.1) và AI reply (R8.3) |
| Scraping FB Page/Group/keyword (Stage 3, Day 12–13) | Vi phạm ToS, chặn bởi rate limit, rủi ro pháp lý | Trending Library 3 nguồn hợp pháp (R3.1–R3.4) |

## 11. Ràng buộc phi chức năng

- **NFR1** — Trang list và calendar SHALL load trong ≤ 2s ở kết nối 4G Việt Nam (P75).
- **NFR2** — Job đăng bài SHALL thực thi trong vòng ±2 phút so với thời gian đã lên lịch.
- **NFR3** — Render video 30s SHALL hoàn tất trong ≤ 5 phút.
- **NFR4** — Token và secret SHALL mã hoá at-rest; SHALL không xuất hiện trong log hay response API.
- **NFR5** — UI SHALL đạt WCAG 2.1 AA: contrast, focus visible, điều hướng bàn phím, label cho form.
- **NFR6** — Toàn bộ UI SHALL là tiếng Việt, có i18n layer để thêm ngôn ngữ sau.
- **NFR7** — Chi phí vận hành MVP SHALL trong khoảng ~500.000₫/tháng ở mức < 1.000 nội dung/tháng.

## 12. Ánh xạ tới roadmap CSV

| Dòng CSV | Requirement |
|---|---|
| Scheduled Cross-posting (Day 1–2) | R2, R5, R6 |
| Performance Insights & AI Suggestions (Day 3) | R7 |
| Large-Scale Anti-detect Seeding (Day 4–6) | **Loại bỏ** → R6.3, R6.4, R10.1 |
| Persona & Tone of Voice Config (Day 7) | **Điều chỉnh** → R4.1, R8.3, R10.1 |
| Programmatic Video — Remotion (Day 8–9) | R4.5 |
| Dynamic Banners & Social Cards (Day 10) | R4.3, R4.4 |
| Contextual Captioning (Day 11) | R4.1, R4.2, R7.8 |
| FB Targeted Content Extraction (Day 12–13) | **Loại bỏ** → R3.1–R3.4, R10.2 |
| Raw Data Processing (Day 14) | R3.5, R3.6, R3.7 |

## 13. Câu hỏi mở

- **Q1** — Tên thương hiệu, logo, bộ màu và tone-of-voice chính thức? Cần trước khi làm template banner (R4.3).
- **Q2** — Danh sách Fanpage/IG cụ thể sẽ kết nối, và Business Manager nào sở hữu chúng?
- **Q3** — App Meta đã ở chế độ Live và đã qua App Review cho các scope ở R2.1 chưa? Đây là đường găng cho Phase 1.
- **Q4** — Ngưỡng cảnh báo chi phí AI hàng tháng (R9.3)?
