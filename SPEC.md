# Technical Specification — Content Automation Hub

> Nền tảng tự động hoá sản xuất & phân phối nội dung mạng xã hội (Facebook Page + Instagram Business) với AI hỗ trợ sinh nội dung, phân tích hiệu suất, và engagement tuân thủ điều khoản nền tảng.

**Version:** 0.2 (draft)
**Ngày:** 2026-07-29
**Nguồn:** `Detailed_Product_Roadmap_English.csv`, `proposal.html`

### Quyết định đã chốt
- **Quy mô:** ~100 social account (Page/IG) quản lý đồng thời.
- **Tenancy:** đơn tổ chức (single-tenant) — không cần multi-tenant.
- **AI provider mặc định:** **Google Gemini** (qua AI adapter provider-agnostic, vẫn cắm được provider khác qua env).
- **Sinh ảnh sáng tạo:** **ComfyUI self-host**.
- **Hạ tầng:** **VPS** (Docker Compose, tự quản Postgres/Redis/worker).

---

## 0. Phạm vi & Ranh giới tuân thủ (đọc trước)

Spec này **chỉ** bao gồm các thành phần tuân thủ điều khoản của Meta. Các phần sau **bị loại khỏi phạm vi** vì vi phạm Terms of Service của Meta (coordinated inauthentic behavior, né tránh cơ chế kiểm soát nền tảng) và gây rủi ro khóa tài khoản hàng loạt + pháp lý:

| Loại khỏi phạm vi | Lý do | Thay thế trong spec |
|---|---|---|
| Anti-detect seeding 50+ tài khoản ảo | Fake engagement, giả mạo danh tính | Module **Engagement hợp lệ** (§8): quản lý nhiều Page chính thức, AI gợi ý reply comment (người duyệt), inbox automation qua Graph API |
| Residential proxy + anti-detect browser | Né phát hiện của nền tảng | — |
| Tự động react/comment/share bằng bot | Inauthentic behavior | Reply comment/inbox trên chính Page của mình, có human-in-the-loop |
| Scrape FB Page/Group/keyword của bên thứ ba | Vi phạm ToS + có thể vi phạm luật dữ liệu | Ingest **Insights của chính mình** qua Graph API + nguồn dữ liệu công khai hợp pháp (RSS, API chính thức) |

Tất cả tương tác với Facebook/Instagram đi qua **Meta Graph API chính thức** với token hợp lệ và quyền được cấp.

---

## 1. Tổng quan sản phẩm

Content Automation Hub là hệ thống end-to-end giúp một team marketing:

1. **Sinh nội dung** bằng AI: caption + hashtag + CTA, ảnh/banner, và video ngắn.
2. **Lên lịch & xuất bản** lên Facebook Page (chính) và cross-post sang Instagram Business.
3. **Thu thập analytics** (Reach, Engagement, v.v.) từ chính các bài đã đăng.
4. **Học từ dữ liệu**: AI phân tích hiệu suất và đề xuất cải thiện cho campaign kế tiếp.
5. **Engagement hợp lệ**: gợi ý phản hồi comment/inbox trên chính Page, có người duyệt.

### Personas
- **Content Manager** — tạo campaign, duyệt nội dung, xem báo cáo.
- **Editor** — chỉnh sửa caption/asset do AI sinh, sắp lịch.
- **Community Manager** — duyệt và gửi reply do AI gợi ý.
- **Admin** — quản lý kết nối tài khoản, quyền, cấu hình AI provider.

---

## 2. Kiến trúc tổng thể

```
                    ┌─────────────────────────────────────────┐
                    │              Web App (Next.js)            │
                    │   Dashboard · Campaign · Calendar · Review │
                    └───────────────┬───────────────────────────┘
                                    │ REST / tRPC
                    ┌───────────────▼───────────────────────────┐
                    │            API / BFF (Next.js API)         │
                    └───┬───────────┬───────────┬────────────┬───┘
                        │           │           │            │
              ┌─────────▼──┐  ┌─────▼─────┐ ┌───▼─────┐ ┌────▼──────┐
              │  Postgres  │  │  Redis /  │ │ Object  │ │  AI Layer │
              │  (Prisma)  │  │  BullMQ   │ │ Storage │ │ (adapter) │
              └────────────┘  └─────┬─────┘ │ (S3/R2) │ └───────────┘
                                    │        └─────────┘
                    ┌───────────────▼───────────────────────────┐
                    │              Worker Processes               │
                    │  publish · analytics-sync · content-gen ·   │
                    │  video-render (Remotion) · engagement       │
                    └───────────────┬───────────────────────────┘
                                    │
                    ┌───────────────▼───────────────────────────┐
                    │          Meta Graph API (FB + IG)          │
                    └────────────────────────────────────────────┘
```

Mô hình: **monorepo**, web + API trong Next.js (App Router), worker chạy nền qua **BullMQ** (Redis). Tách rõ **domain services** để dễ test và mở rộng đa kênh sau này qua `ChannelAdapter`.

---

## 3. Tech Stack (đề xuất)

| Lớp | Công nghệ | Lý do |
|---|---|---|
| Ngôn ngữ | **TypeScript** (end-to-end) | Type-safe, chia sẻ type giữa FE/BE |
| Web/API | **Next.js 15 (App Router)** + tRPC hoặc REST | SSR, BFF gọn, deploy dễ |
| UI | React + Tailwind + shadcn/ui | Nhanh, nhất quán |
| DB + Auth + Storage | **Supabase** (PostgreSQL + Auth + **RLS** + Storage) | Auth email+Google sẵn, phân quyền ở tầng DB (RLS), storage media tích hợp |
| ORM/Migration | Prisma (schema + migrate) chạy trên Postgres của Supabase | Type-safe, migration versioned; RLS policy quản lý qua SQL migration |
| Queue | **Redis + BullMQ** | Scheduling, retry, rate-limit |
| AI text | **Adapter provider-agnostic**, mặc định **Google Gemini** (cắm provider khác qua env) | Không khoá vendor |
| AI ảnh (sinh) | Satori + Sharp (banner/social card có template) + **ComfyUI self-host** (ảnh sáng tạo) | Đúng roadmap gốc, tự chủ chi phí |
| AI ảnh (chỉnh sửa) | **Image-Edit Agent** — agent điều phối tool: xoá/đè logo, xoá nền, crop/resize (Sharp + ComfyUI inpaint + rembg). **Không** sinh ảnh tự do | Sửa nhanh tác vụ đơn giản bằng ngôn ngữ tự nhiên, có người duyệt |
| Video | **Remotion** (render server-side) | Programmatic video |
| Social API | **Meta Graph API** (facebook-nodejs-business-sdk hoặc REST) | Kênh chính thức |
| Auth | **Supabase Auth** (email+password + Google OAuth) | Đồng bộ với RLS ở tầng DB |
| Observability | Pino logging + OpenTelemetry (tùy chọn) | Debug worker |
| Test | Vitest + Playwright | Unit + E2E |
| Deploy | **VPS + Docker Compose** (Postgres, Redis, web, worker, ComfyUI) | Tự chủ, chạy render video/ảnh GPU |

### AI Adapter (provider-agnostic, mặc định Gemini)
```ts
interface AIProvider {
  generateText(input: TextGenRequest): Promise<TextGenResult>;
  analyze(input: AnalysisRequest): Promise<AnalysisResult>;
}
// Mặc định: GeminiProvider (@google/generative-ai) — chọn qua AI_PROVIDER env.
// Có thể thêm ClaudeProvider / OpenAIProvider sau mà không đổi call site.
// Chuẩn hoá message format, retry, token accounting ở lớp adapter.
```

### Sinh ảnh — ComfyUI self-host
```
Worker content-gen → ComfyUI HTTP API (/prompt, /history) → poll kết quả
→ tải ảnh → lưu Object Storage → gắn MediaAsset(type=image, generatedBy="comfyui")
```
- ComfyUI chạy container riêng (ưu tiên node GPU) trong Docker Compose.
- Workflow graph lưu dạng template JSON, tham số hoá (prompt, seed, size).
- Hàng đợi riêng, giới hạn concurrency vì render GPU nặng.

---

## 4. Data Model (Prisma — rút gọn)

```prisma
model User        { id  role  name  email  ... }
model SocialAccount {
  id  platform("facebook"|"instagram")  externalId
  pageId  accessTokenEnc  tokenExpiresAt  status  ...
}
model Campaign    { id  name  status  goal  toneOfVoiceId  createdBy  ... }
model Post {
  id  campaignId  status("draft"|"scheduled"|"publishing"|"published"|"failed")
  caption  hashtags[]  cta  scheduledAt  publishedAt
  primaryPlatform  crosspostTargets[]  ...
}
model PostTarget  { id  postId  socialAccountId  externalPostId  status  error }
model MediaAsset  { id  type("image"|"video"|"banner")  url  meta  generatedBy }
model ToneOfVoice { id  name  persona  guidelines  examples[] }
model Metric      { id  postTargetId  reach  impressions  engagement  capturedAt }
model AISuggestion{ id  campaignId?  postId?  type  content  rationale  createdAt }
model EngagementItem {
  id  socialAccountId  type("comment"|"dm")  externalId  message
  suggestedReply  status("pending"|"approved"|"sent"|"skipped")  reviewedBy
}
model ScheduleJob { id  postId  runAt  bullJobId  status }
```

---

## 5. Module: Auto-posting Engine (Stage 1 — High)

### Chức năng
- Soạn/duyệt post (caption, hashtag, CTA, media).
- **Lên lịch** đăng vào thời điểm định trước.
- **Publish chính** lên Facebook Page.
- **Cross-post tự động** sang Instagram Business.
- Hỗ trợ định dạng: ảnh đơn, carousel, video/reel.

### Luồng publish
1. `Post` chuyển `scheduled` → tạo `ScheduleJob` trong BullMQ với `runAt`.
2. Worker `publish` chạy đúng giờ:
   - FB: `POST /{page-id}/photos|videos|feed` (media_fbid → feed).
   - IG: container flow — `POST /{ig-id}/media` (tạo container) → `POST /{ig-id}/media_publish`.
   - Reel/video: dùng resumable upload + poll trạng thái xử lý.
3. Lưu `externalPostId` vào `PostTarget`; set `published` hoặc `failed` (+error).
4. **Retry** có backoff; tôn trọng **rate limit** của Graph API (đọc header, hàng đợi theo account).

### API (nội bộ)
```
POST   /api/posts                 tạo post
PATCH  /api/posts/:id/schedule    đặt lịch
POST   /api/posts/:id/publish-now publish ngay
GET    /api/posts?status=...      danh sách theo trạng thái
```

### Ràng buộc & edge cases
- Token hết hạn → đánh dấu account `needs_reauth`, không publish, cảnh báo Admin.
- IG chỉ nhận media theo yêu cầu format (aspect ratio, độ dài video) → validate trước.
- Cross-post lỗi 1 kênh không được làm rollback kênh đã thành công (per-target status).

---

## 6. Module: Analytics & AI Learning (Stage 1 — High)

### Chức năng
- Định kỳ đồng bộ chỉ số của **bài của chính mình**: reach, impressions, engagement, saves, video views.
- AI phân tích: bài nào hiệu quả, giờ đăng, độ dài caption, loại media → **đề xuất** cải thiện.

### Luồng
1. Cron worker `analytics-sync` (vd mỗi 6h) gọi Graph Insights:
   - FB: `GET /{post-id}/insights?metric=post_impressions,post_engaged_users,...`
   - IG: `GET /{media-id}/insights?metric=reach,impressions,engagement,saved`
2. Ghi `Metric` (time-series, append-only).
3. `content-gen`/analysis job gom metric theo campaign → gọi `AIProvider.analyze()` → sinh `AISuggestion` (loại: best_time, caption_style, hashtag_set, media_type).

### Output cho người dùng
- Dashboard: biểu đồ hiệu suất theo post/campaign (dùng skill `dataviz` khi build UI charts).
- Bảng "AI Suggestions" gắn với campaign kế tiếp.

---

## 7. Module: Content Generation (Stage 2 — Medium)

### 7.1 AI Text — Contextual Captioning
- Sinh caption + hashtags + CTA dựa trên: brief campaign, `ToneOfVoice`, và **AISuggestion** từ Stage 1.
- `AIProvider.generateText()`; nhiều biến thể để người dùng chọn.

### 7.2 AI Image — Dynamic Banners & Social Cards
- **Satori** (JSX/HTML → SVG) → **Sharp** (SVG → PNG/JPG) cho banner/social card có template.
- **ComfyUI self-host** cho ảnh sáng tạo (§3): worker gọi ComfyUI HTTP API, poll `/history`, tải ảnh về Object Storage.
- Template hoá: biến động (tiêu đề, số liệu, logo) → asset hàng loạt.

### 7.3 AI Video — Programmatic (Remotion)
- Pipeline `video-render`: nhận data + kịch bản → Remotion render short-form/highlight.
- Render nền trong worker (CPU/GPU), lưu ra Object Storage, gắn `MediaAsset(type=video)`.
- Trạng thái render: `queued → rendering → done|failed`, poll từ UI.

### 7.4 AI Image-Edit Agent (không sinh ảnh — chỉ chỉnh sửa)
> Bổ sung cạnh ComfyUI: một **agent chỉnh sửa ảnh** cho các thao tác đơn giản, lặp lại trên ảnh **đã có sẵn** (upload hoặc asset của mình). KHÔNG sinh ảnh mới — chỉ biến đổi ảnh input.

- Tác vụ hỗ trợ (khởi điểm): **xoá logo / watermark**, **đè logo thương hiệu** (overlay có vị trí/opacity/scale), crop/resize theo tỷ lệ nền tảng, thay nền đơn giản, làm sạch vùng chỉ định (inpainting nhẹ).
- Kiến trúc: `ImageEditAgent` nhận **lệnh ngôn ngữ tự nhiên** (vd "xoá logo góc phải dưới, đè logo brand vào giữa") → LLM (Gemini) phân giải thành **chuỗi thao tác có cấu trúc** (`EditOp[]`) → thực thi tất định bằng **Sharp** (composite/resize/extract) và/hoặc **ComfyUI inpainting workflow** cho xoá vật thể.
- Mọi `EditOp` là tất định và có thể xem trước; agent chỉ *lập kế hoạch*, không tự do vẽ lại toàn ảnh → giữ kết quả kiểm soát được.
- Output là `MediaAsset` mới (`generatedBy="image-edit"`, giữ `sourceAssetId`), ảnh gốc không bị ghi đè.
- Ràng buộc tuân thủ: chỉ chỉnh ảnh do người dùng sở hữu/được phép; không dùng để xoá watermark của bên thứ ba nhằm chiếm dụng nội dung (cảnh báo trong UI).

### Ràng buộc
- Render video nặng → hàng đợi riêng, giới hạn concurrency; timeout + cleanup file tạm.
- Asset sinh ra phải qua bước **người duyệt** trước khi gắn vào post.

---

## 8. Module: Engagement hợp lệ (thay cho anti-detect seeding)

> Thay thế tuân thủ cho "seeding". Chỉ tương tác trên **Page/tài khoản do mình sở hữu**, qua Graph API, có **human-in-the-loop**.

### Chức năng
- **Persona / Tone of Voice config**: cấu hình giọng điệu để AI *gợi ý* phản hồi (không tự gửi hàng loạt).
- Kéo comment & DM của chính Page qua Graph API / webhook.
- AI đề xuất `suggestedReply` theo tone → Community Manager **duyệt** → gửi.
- Auto-reply chỉ cho FAQ đã được cấu hình rõ, có thể tắt, tôn trọng chính sách 24h messaging của Meta.

### Chống lạm dụng (bắt buộc)
- Không tạo/điều khiển tài khoản giả.
- Rate-limit + audit log mọi reply gửi đi (ai duyệt, khi nào).
- Mặc định bật human review; auto-send là opt-in cho từng loại.

---

## 9. Cross-cutting Concerns

- **Auth & quyền**: RBAC theo persona (§1). Admin quản lý kết nối OAuth Meta.
- **Bảo mật token**: access token mã hoá at-rest (KMS/`accessTokenEnc`), không log giá trị token. Không commit `.env`.
- **Rate limiting**: hàng đợi per-account, đọc `X-App-Usage`/`X-Business-Use-Case-Usage`.
- **Retry/backoff**: mọi call Graph API idempotent hoá theo `externalPostId` để tránh đăng trùng.
- **Idempotency**: publish job kiểm tra `PostTarget.externalPostId` trước khi gọi API.
- **Observability**: log có cấu trúc, trace theo `jobId`; alert khi token sắp hết hạn.
- **Compliance guardrail**: không có code path tạo tài khoản ảo / proxy / scraping bên thứ ba.

---

## 10. Lộ trình triển khai (điều chỉnh từ roadmap gốc)

| Giai đoạn | Nội dung | Ưu tiên |
|---|---|---|
| **P1** | Nền tảng: monorepo, DB, auth, kết nối Meta OAuth, model dữ liệu | High |
| **P2** | Auto-posting Engine: schedule + publish FB, cross-post IG, retry/rate-limit (§5) | High |
| **P3** | Analytics sync + AI Learning + dashboard charts (§6) | High |
| **P4** | Content Generation: caption (§7.1), banner Satori/Sharp (§7.2), video Remotion (§7.3) | Medium |
| **P5** | Engagement hợp lệ + Tone of Voice config (§8) | Medium |

*(Phần scraping bên thứ ba của Stage 3 gốc bị loại; thay bằng ingest Insights của chính mình ở P3.)*

---

## 11. Verification / Test plan

- **Unit** (Vitest): AI adapter (mock provider), publish payload builder, IG container flow, metric parser.
- **Integration**: chạy với **Meta Graph API test app** + trang test; publish → đọc lại `externalPostId` → sync insights.
- **E2E** (Playwright): tạo campaign → sinh caption → đặt lịch → (giả lập giờ) publish → thấy status `published`.
- **Worker**: test retry/backoff bằng cách mock lỗi 4xx/5xx và rate-limit header.
- **Compliance check**: rà soát không tồn tại code path tạo tài khoản ảo/proxy/scraping.

---

## 12. Quyết định đã chốt

| # | Hạng mục | Quyết định | Ảnh hưởng kiến trúc |
|---|---|---|---|
| 1 | Quy mô account | **~100 Page/IG account** quản lý đồng thời | Hàng đợi per-account, connection pooling, token refresh theo batch; sharding job theo account |
| 2 | Tenancy | **Single-tenant** (1 tổ chức) | Bỏ lớp tenant isolation; RBAC theo persona là đủ; DB không cần `tenantId` |
| 3 | AI text provider | **Google Gemini** làm mặc định (qua adapter, đổi được) | `GeminiProvider` triển khai `AIProvider`; cấu hình model/API key qua env |
| 4 | AI ảnh | **ComfyUI self-host** cho ảnh sáng tạo + Satori/Sharp cho banner template | Container ComfyUI trong Docker Compose; worker gọi HTTP API, poll `/history` |
| 5 | Deploy | **VPS + Docker Compose** | Postgres + Redis + web + worker + ComfyUI cùng host; worker render video/ảnh cần CPU/GPU đủ mạnh; cân nhắc tách VPS GPU riêng cho ComfyUI/Remotion nếu tải cao |

### Lưu ý vận hành ở quy mô ~100 account
- **Rate limit**: Graph API tính theo app + theo từng Business/Page. Cần queue riêng mỗi account và giám sát `X-Business-Use-Case-Usage` để tránh bị throttle dây chuyền.
- **Token management**: 100 long-lived token cần cron refresh + cảnh báo sớm khi sắp hết hạn; đánh dấu `needs_reauth` không chặn các account khác.
- **Backup**: single-tenant + self-host VPS ⇒ tự lo backup Postgres (pg_dump định kỳ) và Object Storage; không có managed failover.
