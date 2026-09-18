/**
 * Localization helper for Sports Influencer Hub
 * Translates data retrieved from Lark Base or user input into English
 */

export const I18N_MAP: Record<string, string> = {
  // Partnership & CRM Statuses
  "Đang hợp tác tích cực": "Active Partnership",
  "Đang hợp tác": "In Collaboration",
  "Tiềm năng": "Potential",
  "Mới scout (Tiềm năng)": "Newly Scouted (Potential)",
  "Đã liên hệ": "Contacted",
  "Đang liên hệ / Tiếp cận": "Approaching / In Contact",
  "Chưa tiếp cận": "Not Contacted",
  "Tạm ngưng": "Paused",
  "Cảnh báo / Cần lưu ý": "Warning / Needs Attention",
  "Cảnh báo": "Warning",
  "Chờ xử lý": "Pending",
  "Đã duyệt": "Approved",

  // Project Statuses
  "Lên kế hoạch": "Planning",
  "Đang triển khai": "In Progress",
  "Đã hoàn thành": "Completed",
  "Đã quyết toán": "Settled",

  // Regions & Geography
  "Toàn quốc": "Nationwide",
  "Hà Nội": "Hanoi",
  "TP. Hồ Chí Minh": "Ho Chi Minh City",
  "Đà Nẵng": "Da Nang",
  "Miền Bắc": "Northern Region",
  "Miền Trung": "Central Region",
  "Miền Nam": "Southern Region",
  "Quốc tế": "International",
  "Khác": "Other",

  // Sports
  "Bóng đá": "Football",
  "Cầu lông": "Badminton",
  "Chạy bộ": "Running",
  "Chạy bộ / Marathon": "Running / Marathon",
  "Đạp xe": "Cycling",
  "Bóng rổ": "Basketball",
  "Bơi lội": "Swimming",
  "Bóng chuyền": "Volleyball",
  "Thể thao": "Sports",

  // Deadlines & Progress
  "Rất đúng hạn (Trước deadline)": "Ahead of Schedule (Early)",
  "Đúng hạn": "On Time",
  "Trễ hạn (Có báo trước)": "Delayed (Pre-notified)",
  "Vi phạm nghiêm trọng deadline": "Severe Deadline Breach",
  "Rất đúng hạn": "Ahead of Schedule",
  "Trễ hạn": "Delayed",

  // Activity Levels
  "Rất sôi động (> 20 bài/ngày)": "Very Active (> 20 posts/day)",
  "Trung bình (5 - 10 bài/ngày)": "Moderate (5 - 10 posts/day)",
  "Kém hoạt động (< 1 bài/tuần)": "Low Activity (< 1 post/week)",
  "Hoạt động sôi nổi": "Very Active",

  // Privacy
  "Công khai (Public)": "Public",
  "Riêng tư (Private)": "Private",

  // Community Purposes
  "Giao lưu tìm kèo": "Match Finding & Socializing",
  "Mua bán phụ kiện/vợt": "Gear & Racket Trading",
  "Tổ chức giải phong trào": "Amateur Tournaments",
  "Chia sẻ kỹ thuật": "Skill & Technique Sharing",
  "Giao lưu thi đấu": "Matches & Competition",

  // Viral Grades
  "Xu Hướng": "Trending",
  "Xu Hướng Tốt": "Trending High",
  "Đột Phá": "Breakthrough",
  "Tiềm Năng": "Potential",
  "Siêu Hot (> 100k views)": "Super Hot (>100k)",
  "Siêu Viral (> 100k views)": "Super Viral (>100k)",
  "Siêu Hot": "Super Hot",
  "Siêu Viral": "Super Viral",
  "Tương tác cao (10k - 100k views)": "High Engagement (10k-100k)",
  "Tương tác cao": "High Engagement",

  // Post & Content Statuses
  "Đã duyệt nội dung": "Approved",
  "Mới scout (Chưa duyệt)": "New Scout",
  "Đã liên hệ tác giả": "Contacted Author",
  "Lưu tham khảo ý tưởng / Trend": "Idea Reference",
  "Đã liên hệ, đang chờ báo giá chi tiết": "Pending Quote",
  "Lưu tham khảo để liên hệ hợp tác khi có giải đấu": "Saved for Tournament",
  "Mới scout": "New Scout",
  "Mới scout (Chưa liên hệ)": "New Scout",
  "Đang chờ duyệt": "Pending Review",
  "Đã xuất bản": "Published",

  // Fallback / Meta
  "Liên hệ quản lý": "Contact Management",
  "Thỏa thuận": "Negotiable",
  "Thương lượng": "Negotiable",
  "Miễn phí": "Free",
  "Đạt KPI": "Target Met",
  "100% KPI": "100% Target Met",
  "Chưa gắn tên": "Unnamed",
  "Không có ghi chú": "No notes",
  "Chưa có đánh giá": "No evaluations yet",
  "Quản lý Phúc": "Phuc's Manager",
  "Quán quân tâng bóng nghệ thuật Châu Á #freestylefootball #football #vietnam":
    "Asian Freestyle Football Champion #freestylefootball #football #vietnam",
  "Bóng đá / Nghệ thuật": "Football / Freestyle",
  "Hồ sơ vận động viên / nhà sáng tạo nội dung thể thao.":
    "Profile of sports athlete / content creator.",
};

/**
 * Translate dynamic Lark Base text to English
 */
export function t(text: string | null | undefined): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (I18N_MAP[trimmed]) return I18N_MAP[trimmed];

  // Regex replacements for common contact strings e.g. "0988xxx888 (Quản lý Phúc)"
  let result = trimmed
    .replace(/\bQuản lý\b/gi, "Manager")
    .replace(/\bLiên hệ\b/gi, "Contact");

  return result;
}

/**
 * Format numbers with comma thousand separator (en-US standard)
 */
export function formatNumber(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "0";
  return val.toLocaleString("en-US");
}

/**
 * Format quotation / price in VND with en-US notation
 */
export function formatCurrency(val: number | null | undefined): string {
  if (!val || isNaN(val) || val <= 0) return "Negotiable";
  return `${val.toLocaleString("en-US")} VND`;
}
