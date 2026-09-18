---
description: Enforce English for all platform UI while preserving original language for posts, KOL names, and community entities.
trigger: always_on
---

# Platform Language Policy: English UI with Original Content Preservation

## 1. Platform UI Language Rule
All UI elements, navigation, controls, headers, buttons, cards, filters, tables, modals, tooltips, and toast notifications across the application must be in **English**.
No hardcoded Vietnamese strings are allowed in any UI template or component.

## 2. Dynamic Entity Content Exception (Tiếng Gốc)
Preserve original language (Vietnamese or author's original language) for:
- Post titles, captions, quotes, reels descriptions, comments, and hashtags.
- KOL and athlete names (e.g. "Đỗ Kim Phúc").
- Community, group, and club names (e.g. "Hội Yêu Chạy Bộ & Marathon Sài Gòn").
- Project reviewer notes and qualitative feedback comments authored by users.

## 3. Dynamic Lark Base Option Translation
Lark Base single-select fields (Status, Discipline, Geography, Deadlines, Activity Levels, Viral Grades) stored in Vietnamese must be translated for display in the UI using `@/lib/i18n` (`t()`).
When sending mutations to Lark Base API, use `LARK_OPTION_MAP` to ensure compatibility with Lark schema choices.

## 4. Number & Currency Standards
- Formatted using `en-US` conventions (comma thousands separators: `1,250,000`).
- Currencies labeled with VND notation.
