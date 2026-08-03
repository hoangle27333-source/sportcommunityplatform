# Notes for Review — Content Automation Hub

> Ngày: 2026-07-29 · Trạng thái: P3–P5 backend + API + UI khung đã build, typecheck/build/test đều xanh.
> File này gom (A) các điểm **cần bạn quyết định / cấp thông tin** và (B) **checklist test** trước khi coi là hoàn tất.

Trạng thái build hiện tại:
- `npm run typecheck` ✅
- `npm run build` ✅ (30+ route)
- `npm test` ✅ (16 test)
- Chưa chạy runtime thật (chưa có Supabase/Redis/Meta credentials + chưa `db push`).

---

## A. Điểm cần bạn input / quyết định

### A1. Video render — Remotion vs ffmpeg (§7.3) — **CẦN QUYẾT ĐỊNH**
`src/lib/content/video.ts` định nghĩa interface `VideoRenderer` với 2 backend:
- **`ffmpeg`** (mặc định): slideshow ảnh + caption → MP4. Nhẹ, ~0₫ compute, cần binary `ffmpeg` trên VPS (`FFMPEG_PATH`).
- **`remotion`**: chưa wire (ném lỗi nếu bật). Remotion kéo theo headless Chromium + render host, và có điều khoản license cho team > 3 người.

→ **Cần bạn xác nhận:** dùng ffmpeg slideshow cho MVP, hay đầu tư Remotion ngay? Nếu Remotion: cần OK về dependency + hạ tầng render.

### A2. ComfyUI — sinh ảnh sáng tạo (§7.2) — **CHƯA WIRE**
Spec nói ảnh sáng tạo qua ComfyUI self-host. Hiện mới có:
- Banner (Satori/Sharp) ✅
- Image-Edit Agent (Sharp, có hook `REMBG_URL` cho xoá nền) ✅
- ComfyUI text→image: **chưa build** (cần `COMFYUI_BASE_URL` + workflow JSON mẫu).

→ **Cần bạn cấp:** endpoint ComfyUI + 1–2 workflow graph mẫu (JSON) để mình viết adapter. Chưa có thì phần "sinh ảnh tự do" tạm trống.

### A3. Ngưỡng cảnh báo chi phí AI hàng tháng (R9.3, Q4) — **CẦN SỐ LIỆU**
Đã có bảng `ai_generations` + `/api/cost` rollup + hiển thị ở Settings. Nhưng **chưa có cron gửi cảnh báo** khi vượt ngưỡng, vì chưa biết:
- Ngưỡng VNĐ/tháng (`AI_MONTHLY_BUDGET_VND` trong .env).
- Kênh cảnh báo: email admin? Slack? (hiện chưa có SMTP/Slack config).

→ **Cần bạn cho:** ngưỡng + kênh nhận cảnh báo.

### A4. Giá token để quy đổi chi phí (R9.2) — **XÁC NHẬN SỐ**
`src/lib/ai/cost.ts` đang dùng giá mặc định (Gemini Flash): input `$0.075`/1M, output `$0.30`/1M, tỷ giá `USD_TO_VND_RATE=25000`. Chỉnh qua env `AI_PRICE_INPUT_PER_M_USD`, `AI_PRICE_OUTPUT_PER_M_USD`.

→ **Cần bạn xác nhận** giá đúng với model/API tier bạn dùng thực tế.

### A5. Token refresh + cảnh báo hết hạn (R2.6/R2.7) — **CHƯA CÓ CRON**
- Migration đã thêm status `needs_reauth`; publish worker đã skip account lỗi auth.
- **Chưa build:** cron quét `token_expires_at ≤ 7 ngày` → set `needs_reauth` + email admin + giữ post `scheduled` (không để `failed`).
- Logic "giữ scheduled thay vì failed" trong `publishTarget` cần bạn review lại (hiện auth error mark failed cho target đó).

→ **Cần quyết:** kênh email (SMTP/Resend/SES?) để mình wire cảnh báo.

### A6. Auto-approve / cross-review nội dung (R3, R1 editor) — **CẦN LÀM RÕ QUY TẮC**
Requirements nói editor **không tự duyệt bài của chính mình** khi channel bật duyệt chéo, và admin cấu hình `auto_approve`. Hiện tại:
- Chưa có cột `auto_approve` / trạng thái approve riêng; post đi thẳng `draft → scheduled/publishing`.
- Chưa chặn "editor tự duyệt bài mình".

→ **Cần bạn xác nhận** quy tắc duyệt (bắt buộc duyệt chéo? theo channel? admin bypass?) để mình thêm cột + policy.

### A7. Meta App review & scopes — **CẦN THÔNG TIN THẬT**
- Scopes yêu cầu đã liệt kê trong `src/lib/meta/constants.ts`. Meta cần App Review để cấp `pages_manage_posts`, `instagram_content_publish`, v.v.
- Webhook (`/api/meta/webhook`) cần `META_WEBHOOK_VERIFY_TOKEN` + `META_WEBHOOK_APP_SECRET` + subscribe fields (feed, comments, mentions) trong App dashboard.

→ **Cần bạn:** App ID/Secret thật, hoàn tất App Review, và cấu hình webhook subscription. Chưa có thì không test được luồng publish/engagement thật.

### A8. Metric family sau cutover 2026-06-15 (R7.2) — **CẦN VERIFY VỚI API THẬT**
`src/lib/meta/insights.ts` tránh metric cũ (đã deprecated) và đọc `post_total_media_view*` + like/comment/share summary. **Chưa test với account thật** — tên metric mới có thể khác tuỳ loại post/tài khoản. Cần verify khi có token.

### A9. Storage bucket & RLS — **CẦN CHẠY MIGRATION + KIỂM TRA**
- Migration `0003` tạo bucket `media` (public read) + policy. Cần `supabase db push`.
- Nếu Supabase project của bạn có cấu hình storage khác (private bucket + signed URL), cần đổi `src/lib/storage/media.ts` (hiện dùng public URL).

→ **Cần bạn xác nhận:** public bucket có chấp nhận được không (URL ảnh sẽ công khai để Meta fetch).

---

## B. Checklist cần TEST (khi có credentials thật)

### B0. Chuẩn bị môi trường
- [ ] Điền `.env` từ `.env.example` (Supabase URL/keys, `TOKEN_ENCRYPTION_KEY`, `REDIS_URL`, Meta app, `GEMINI_API_KEY`).
- [ ] `npm run db:migrate` (push 0001→0003) — kiểm tra enum `needs_reauth` add thành công.
- [ ] Tạo user đầu tiên → nâng role `admin` thủ công trong `profiles`.
- [ ] Chạy `npm run dev` (web) + `npm run worker` (worker) song song, Redis chạy.

### B1. Auth & RBAC (R1)
- [ ] Chưa login → mọi route redirect `/login`.
- [ ] Login email/password + Google OAuth.
- [ ] `viewer` gọi `POST /api/posts` → **403** (test RLS, không chỉ UI).
- [ ] Đổi role trong DB → session phản ánh trong ≤ 60s.

### B2. Kết nối channel (R2)
- [ ] `/channels` → "Kết nối Meta" → OAuth → Page + IG hiện ra.
- [ ] Token lưu **mã hoá** trong `social_accounts.access_token_enc` (không plaintext).
- [ ] (A5) Giả lập token hết hạn → account `needs_reauth`, publish skip.

### B3. Tạo & đăng bài (§5)
- [ ] Tạo draft `POST /api/posts` với `targetAccountIds` + `mediaIds`.
- [ ] `POST /api/posts/:id/publish-now` → job chạy → bài lên FB Page + IG.
- [ ] `PATCH /api/posts/:id/schedule` với `runAt` tương lai → job delayed.
- [ ] **Idempotency:** gọi publish 2 lần → không đăng trùng (jobId `publish:<targetId>`).
- [ ] Fan-out: 1 target lỗi không kéo target khác fail; `posts.status` reconcile đúng.

### B4. Sinh nội dung (§7)
- [ ] `POST /api/content/caption` → variants caption/hashtag/CTA (Gemini). Kiểm tra `ai_generations` ghi cost.
- [ ] `POST /api/content/banner` template `announcement`/`promo` → PNG trong Storage. **Lưu ý:** cần font — xem A-note về `FONT_PATH` bên dưới.
- [ ] `POST /api/content/image-edit` với instruction tiếng Việt ("cắt vuông, tăng sáng") → plan hợp lệ + ảnh ra.
- [ ] `POST /api/content/video` → job → MP4 slideshow (cần `ffmpeg` trên máy).

### B5. Analytics & AI learning (§6)
- [ ] Cron `analytics-sync` (mặc định mỗi 6h, `ANALYTICS_SYNC_CRON`) → `metrics` có snapshot mới.
- [ ] `/analytics` hiển thị reach/engagement.
- [ ] `POST /api/campaigns/:id/analyze` → `ai_suggestions` sinh ra → caption dùng lại learnings.

### B6. Engagement hợp lệ (§8)
- [ ] `POST /api/engagement/ingest` (accountId) → comment kéo về `pending`.
- [ ] Webhook `/api/meta/webhook`: GET verify handshake OK; POST có chữ ký HMAC hợp lệ mới nhận.
- [ ] `POST /api/engagement/:id/suggest` → reply gợi ý (AI).
- [ ] `POST /api/engagement/:id/send` → reply gửi lên Meta + audit log; **có human duyệt**.
- [ ] `viewer` không gửi được reply.

### B7. Cost & Admin (R9)
- [ ] `/settings` + `/api/cost` hiển thị chi phí theo ngày/tháng, bóc theo kind + provider, quy đổi VNĐ.
- [ ] (A3) Cảnh báo vượt ngưỡng — **chưa build**, test sau khi chốt kênh.

---

## A10. Content Remix (`/remix`) — ĐÃ BUILD, cần bạn quyết 3 điểm

Flow đã chạy: nguồn → AI lập kế hoạch → pipeline ffmpeg → review → feedback → sửa lại → approve → tạo bài nháp cho calendar.

**Quyết định tuân thủ tôi đã áp (cần bạn xác nhận):** flow bạn mô tả ("gửi link post hay của người khác → tải về → edit → đăng lại") là tái sử dụng nội dung có bản quyền của bên thứ ba, vi phạm ToS của Meta/TikTok/YouTube và luật bản quyền. Nên tôi build 3 chế độ nguồn thay vì tải tự do:

| Nguồn | Hành vi | Ghi chú |
|---|---|---|
| `upload` | Bạn upload video/ảnh của mình → pipeline chạy đầy đủ | An toàn |
| `own_link` | Link nội dung **của chính bạn**, phải tick xác nhận sở hữu (lưu vào audit) | An toàn |
| `inspiration` | Link bài hay của **người khác** → AI chỉ đọc metadata công khai + mô tả của bạn, đúc kết **công thức** (hook/cấu trúc/nhịp) rồi áp lên asset của bạn. **KHÔNG tải file gốc** | Cách hợp pháp để "học bài hay" |

→ **Cần bạn xác nhận** cách này ổn, hay bạn có giấy phép/quyền sử dụng nội dung nguồn nào khác mà tôi chưa biết.

**A10.1 — TTS lồng tiếng Việt (`TTS_PROVIDER`) — CHƯA BẬT**
Option "lồng tiếng Việt" hiện no-op kèm warning. Cần bạn chọn:
- `google` (Google Cloud TTS, giọng `vi-VN-Neural2-A`) — cần bật Cloud TTS API + `GOOGLE_TTS_API_KEY`. Chất lượng tốt, ~$16/1M ký tự.
- Provider Việt khác (Zalo AI, FPT.AI, Viettel) — cho tôi API doc thì tôi viết adapter.
- Bỏ luôn tính năng lồng tiếng, chỉ dùng vietsub.

**A10.2 — Logo thương hiệu (`BRAND_LOGO_URL`) — CHƯA CÓ**
Option "chèn logo" cần một PNG (nền trong suốt) ở URL công khai. Chưa set thì option bị bỏ qua kèm warning.

**A10.3 — Vietsub hiện chưa có ASR (nhận dạng giọng nói)**
Phụ đề được sinh từ `scriptVi` mà AI viết dựa trên **mô tả của bạn trong prompt**, không phải transcribe audio gốc. Timing chia đều theo độ dài chữ — đủ tốt cho reel ngắn, không chính xác từng từ. Muốn sub khớp chính xác lời nói cần thêm ASR (Whisper self-host hoặc Google STT) — cho tôi biết nếu cần.

---

## C. Cần bổ sung sau (đã biết, chưa làm)
1. ComfyUI text→image adapter (A2).
2. Cron token-refresh + email cảnh báo hết hạn / vượt budget (A3, A5).
3. Cột `auto_approve` + luồng duyệt chéo (A6).
4. Font file cho Satori banner: `src/lib/content/banner.ts` load từ `FONT_PATH`. **Cần đặt 1 file .ttf** (vd Inter/Be Vietnam Pro cho tiếng Việt có dấu) và trỏ env `FONT_PATH`, nếu không banner sẽ lỗi "missing font".
5. UI hiện là **khung read-mostly** (server components liệt kê dữ liệu). Các form tạo/sửa/duyệt tương tác (compose post, duyệt engagement, đổi role) mới có API, **chưa có client form** — cần build tiếp nếu muốn thao tác trên UI thay vì gọi API trực tiếp.
6. Email admin (R2.6) cần provider (SMTP/Resend/SES) — chưa chọn.

---

## D. Biến môi trường mới (thêm vào `.env`)
Ngoài các key đã có trong `.env.example`:
```
SUPABASE_MEDIA_BUCKET=media          # tên bucket storage
FONT_PATH=/path/to/font.ttf          # font cho banner Satori (tiếng Việt)
VIDEO_RENDERER=ffmpeg                # ffmpeg | remotion
FFMPEG_PATH=ffmpeg                   # đường dẫn binary ffmpeg
REMBG_URL=                           # (tuỳ chọn) service xoá nền cho image-edit
ANALYTICS_SYNC_CRON=0 */6 * * *      # lịch sync analytics
AI_PRICE_INPUT_PER_M_USD=0.075       # giá token input (quy đổi cost)
AI_PRICE_OUTPUT_PER_M_USD=0.30       # giá token output

# Content Remix (§A10)
FFMPEG_PATH=                         # để trống = dùng binary static trong node_modules
FFPROBE_PATH=                        # để trống = dùng binary static
BRAND_LOGO_URL=                      # PNG logo (nền trong) cho option chèn logo
TTS_PROVIDER=none                    # none | google | say
GOOGLE_TTS_API_KEY=                  # nếu TTS_PROVIDER=google
TTS_VOICE_VI=vi-VN-Neural2-A
TTS_SPEAKING_RATE=1.0
```

---

## E. Test Content Remix (`/remix`) — làm được ngay, không cần Meta

1. Chạy migration `0004_remix_jobs.sql` (Supabase SQL Editor).
2. `npm run dev` + `npm run worker` (worker bắt buộc — pipeline chạy trong queue).
3. Vào `/remix`:
   - **Nguồn `upload`**: upload một video ngang bất kỳ (mp4), bật `vertical` + `trimSeconds=15` + `colorGrade` → kỳ vọng nhận lại MP4 dọc 1080×1920, 15s, đã chỉnh màu.
   - **Nguồn `inspiration`**: dán link một reel hay + mô tả bài đó nói gì, output `caption` → kỳ vọng nhận caption + hashtag mới theo công thức, KHÔNG có media tải về.
   - **Feedback loop**: bấm "Gửi phản hồi" với yêu cầu cụ thể ("cắt còn 10s, sáng hơn") → job chuyển `revising` → chạy lại → so sánh với bản trước.
   - **Approve**: bấm duyệt → tạo bài nháp → kiểm tra xuất hiện ở `/calendar` (hoặc `/posts`).
4. Kiểm chi phí AI: `/settings` → xem cost tăng sau mỗi lần lập kế hoạch.

Giới hạn đã biết: tối đa 5 vòng sửa/job; `dubVi` và `brandLogo` sẽ báo warning cho tới khi bạn cấu hình A10.1/A10.2.
