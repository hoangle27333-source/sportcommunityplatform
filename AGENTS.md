# Agent Guidelines & Rules: Language & Internationalization Policy

## 1. Primary Rule: English by Default for Platform UI
All user interface (UI) elements, navigation, system text, and application controls across the entire platform **MUST BE IN ENGLISH**.
Under no circumstances should user interface elements or boilerplate copy be written in Vietnamese or any non-English language.

This applies strictly to:
- Navigation bars, menus, sidebar links, tabs, breadcrumbs, page headers, footers.
- Button labels, form field labels, input placeholders, helper texts, validation errors.
- KPI cards, metric indicators, chart labels, data table headers, column names, sort/filter controls.
- Modal dialogues, confirmation prompts, notifications, toast messages, empty states, loading states.
- System metadata, route titles, SEO tags, ARIA accessibility attributes, tooltips.

---

## 2. Exception: Preservation of Original Entity Names & Post Content (Tiếng Gốc)
Dynamic content that originates from external platforms, real-world entities, or user post feeds **MUST PRESERVE ITS ORIGINAL LANGUAGE** (e.g., Vietnamese) without translation or modification:
- **KOL / Athlete Names**: e.g., "Đỗ Kim Phúc", "Hoàng Đăng Phan", "Nguyễn Văn A". Do NOT translate or transliterate names.
- **Community / Group / Club Names**: e.g., "Cộng Đồng Pickleball Việt Nam", "Hội Yêu Chạy Bộ & Marathon Sài Gòn", "CLB Pickleball Ba Đình".
- **Post & Reel Content**: Captions, social post titles, video descriptions, comments, hashtags, and social media quotes scouted from TikTok, Facebook, Instagram, YouTube, etc. (e.g., "Check-in ngày thi đấu cuối cùng tại booth...").
- **User-Authored PM Feedback & Notes**: Qualitative notes written by reviewers, user comments, or specific text feedback entered by project managers.
- **Brand Names & Client Names**: Specific brand handles or campaign brand titles if registered in original language.

---

## 3. Dynamic Lark Base & CRM Data Mapping
When data from Lark Base or Supabase contains Vietnamese system labels or option choices (e.g., status, discipline, region, schedule):
- **ALWAYS translate display labels using `src/lib/i18n.ts` (`t()`)**:
  - CRM Status: "Đang hợp tác tích cực" -> "Active Partner", "Tiềm năng" -> "Potential", "Mới scout" -> "New Scout (Unverified)".
  - Sports Disciplines: "Bóng đá" -> "Football", "Cầu lông" -> "Badminton", "Chạy bộ" -> "Running / Marathon", "Đạp xe" -> "Cycling".
  - Geography / Regions: "Toàn quốc" -> "Nationwide", "Hà Nội" -> "Hanoi", "TP. Hồ Chí Minh" -> "Ho Chi Minh City", "Đà Nẵng" -> "Da Nang".
  - Deadlines & Schedules: "Trước deadline" -> "Ahead of Schedule", "Đúng hạn" -> "On Time", "Trễ hạn" -> "Delayed".
  - Activity Levels: "Rất sôi động" -> "Very Active", "Trung bình" -> "Moderate", "Kém" -> "Low Activity".
  - Viral Grades: "Siêu Viral" -> "Super Viral", "Tương tác cao" -> "High Engagement", "Xu Hướng" -> "Trending".
- **Lark API Submission**:
  - When submitting form values back to Lark Base, use `LARK_OPTION_MAP` (`src/app/api/lark/record/route.ts`) so English selections cleanly match Lark Base single-select choice options.
  - If new options are added, update both `src/lib/i18n.ts` and `src/app/api/lark/record/route.ts`.

---

## 4. Number & Currency Formatting
- Numbers must follow `en-US` locale formatting (comma thousands separator: `1,250,000`).
- Currency should be formatted clearly as VND notation using `formatCurrency()` or `formatNumber(value) + " VND"`.

---

## 5. Development Enforcement Checklist
When creating or editing code in this codebase:
- [ ] No hardcoded Vietnamese UI copy (buttons, labels, headers, toasts).
- [ ] Any dynamic data rendered in UI tags, badges, or selects must pass through `t()` from `@/lib/i18n`.
- [ ] Original post text and entity names (`r.kolName`, `r.title`, `comm.name`, `post.title`) are displayed as originally authored.
