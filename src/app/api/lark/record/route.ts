import { NextRequest, NextResponse } from "next/server";
import {
  batchInsertRecords,
  updateRecord,
  deleteRecord,
  LARK_CONFIG,
} from "@/lib/lark/client";
import { getServerUserRole } from "@/lib/auth/financial-sanitizer";

export const dynamic = "force-dynamic";

const LARK_OPTION_MAP: Record<string, string> = {
  // Statuses
  "Active Partnership": "Đang hợp tác tích cực",
  "Newly Scouted (Potential)": "Mới scout (Tiềm năng)",
  "Potential": "Tiềm năng",
  "Contacted": "Đã liên hệ",
  "Approaching / In Contact": "Đang liên hệ / Tiếp cận",
  "Not Contacted": "Chưa tiếp cận",
  "In Collaboration": "Đang hợp tác",
  "Paused": "Tạm ngưng",
  "Warning": "Cảnh báo",
  "Warning / Needs Attention": "Cảnh báo / Cần lưu ý",
  "Pending": "Chờ xử lý",
  "Approved": "Đã duyệt",

  // Project statuses
  "Planning": "Lên kế hoạch",
  "In Progress": "Đang triển khai",
  "Completed": "Đã hoàn thành",
  "Settled": "Đã quyết toán",

  // Deadlines
  "Ahead of Schedule (Early)": "Rất đúng hạn (Trước deadline)",
  "On Time": "Đúng hạn",
  "Delayed (Pre-notified)": "Trễ hạn (Có báo trước)",
  "Severe Deadline Breach": "Vi phạm nghiêm trọng deadline",

  // Target types
  "Individual KOLs": "KOLs cá nhân",
  "Communities & Clubs": "Cộng đồng / Group",
  "Sports Communities / Clubs": "Hội nhóm / CLB Thể thao",
  "Viral Posts & Reels": "Bài viết & Reels",
  "Athletes / Coaches": "Cá nhân KOL / VĐV",

  // Geography
  "Nationwide": "Toàn quốc",
  "Hanoi": "Hà Nội",
  "Ho Chi Minh City": "TP. Hồ Chí Minh",
  "Da Nang": "Đà Nẵng",
  "Northern Region": "Miền Bắc",
  "Southern Region": "Miền Nam",
  "Central Region": "Miền Trung",
  "Other": "Khác",
  "Others": "Khác",

  // Activity Level
  "Very Active (> 20 posts/day)": "Rất sôi động (> 20 bài/ngày)",
  "Moderate (5 - 10 posts/day)": "Trung bình (5 - 10 bài/ngày)",
  "Low Activity (< 1 post/week)": "Kém hoạt động (< 1 bài/tuần)",

  // Privacy
  "Public": "Công khai (Public)",
  "Private": "Riêng tư (Private)",

  // Community Purposes
  "Match Finding & Socializing": "Giao lưu tìm kèo",
  "Gear & Racket Trading": "Mua bán phụ kiện/vợt",
  "Amateur Tournaments": "Tổ chức giải phong trào",
  "Skill & Technique Sharing": "Chia sẻ kỹ thuật",

  // Sports
  "Running": "Chạy bộ",
  "Running / Marathon": "Chạy bộ / Marathon",
  "Badminton": "Cầu lông",
  "Football": "Bóng đá",
  "Cycling": "Đạp xe",
};

function normalizeOption(val: string | undefined, fallback: string): string {
  if (!val) return fallback;
  const trimmed = val.trim();
  return LARK_OPTION_MAP[trimmed] || trimmed;
}

function normalizeArray(
  vals: string[] | undefined,
  fallback: string[]
): string[] {
  if (!vals || !Array.isArray(vals) || vals.length === 0) return fallback;
  return vals.map((v) => LARK_OPTION_MAP[v.trim()] || v.trim());
}

export async function POST(req: NextRequest) {
  try {
    const { isAdmin } = await getServerUserRole();
    const body = await req.json();
    const { type, data } = body;

    if (!type || !data) {
      return NextResponse.json(
        { success: false, error: "Missing required data (type or data)" },
        { status: 400 }
      );
    }

    let tableId = "";
    let fields: Record<string, any> = {};

    if (type === "scout") {
      tableId = LARK_CONFIG.tables.scout;
      const keyword = String(data.keyword || "").trim();
      if (!keyword) {
        return NextResponse.json(
          { success: false, error: "Please enter a search keyword" },
          { status: 400 }
        );
      }
      fields = {
        "Từ khóa tìm kiếm (Keyword)": keyword,
        "Nền tảng": data.platform || "Tất cả (All)",
        "Bộ môn thể thao": data.sport || "Pickleball",
        "Số lượng quét tối đa": Number(data.limit) || 20,
        "Trạng thái": "Chờ xử lý",
        "Thời gian yêu cầu": new Date().toISOString(),
      };
    } else if (type === "report") {
      tableId = LARK_CONFIG.tables.reports;
      const kolName = String(data.kolName || "").trim();
      const project = String(data.project || data.projectName || "").trim();

      if (!kolName) {
        return NextResponse.json(
          { success: false, error: "Please enter or select KOL Name" },
          { status: 400 }
        );
      }
      if (!project) {
        return NextResponse.json(
          { success: false, error: "Please enter Project Name" },
          { status: 400 }
        );
      }

      const kpiCommit = Number(data.kpiCommit) || 0;
      const kpiActual = Number(data.kpiActual) || 0;
      const kpiRate =
        kpiCommit > 0
          ? Math.round((kpiActual / kpiCommit) * 100)
          : Number(data.kpiRate) || 100;

      const title =
        String(data.title || "").trim() || `Evaluation: ${kolName} - ${project}`;

      fields = {
        "Tiêu đề đánh giá": title,
        "Tên KOL / Đối tác": kolName,
        "Tên dự án tham gia": project,
        "Đánh giá chung (1 - 5 sao)": Number(data.score) || 5,
        "Điểm thái độ hợp tác (1 - 5 sao)": Number(data.attitude) || 5,
        "Tiến độ bàn giao (Deadline)": normalizeOption(
          data.deadline,
          "Rất đúng hạn (Trước deadline)"
        ),
        "KPI cam kết": kpiCommit,
        "KPI thực tế đạt được": kpiActual,
        "Tỷ lệ hoàn thành KPI (%)": kpiRate,
        "Ghi chú & Lưu ý quan trọng cho người sau": String(
          data.notes || ""
        ).trim(),
        "Người thực hiện đánh giá": String(data.evaluator || "PM").trim(),
      };

      if (data.kolRecordId) {
        fields["🔗 KOL Nghiệm Thu"] = [data.kolRecordId];
      }
    } else if (type === "kol") {
      tableId = LARK_CONFIG.tables.kols;
      const name = String(data.name || "").trim();
      if (!name) {
        return NextResponse.json(
          { success: false, error: "Please enter KOL Name / Channel" },
          { status: 400 }
        );
      }

      const sport = normalizeArray(data.sport, ["Pickleball"]);

      fields = {
        "Name of KOL/Channel": name,
        "Type Of Sport": sport,
        "KOL Tier": data.tier || "Micro (10k - 50k)",
        Platform: data.platform || "Facebook",
        Geography: normalizeOption(data.geography, "Toàn quốc"),
        Followers: Number(data.followers) || 0,
        "Avg Views": Number(data.avgViews) || 0,
        "Engagement Rate%": Number(data.er) || 0,
        "Quotation (VND)": isAdmin ? (Number(data.quotation) || 0) : 0,
        Status: normalizeOption(data.status, "Đang hợp tác tích cực"),
        Information: String(data.contact || "").trim(),
        "Hashtags & Bio": String(data.bio || "").trim(),
      };

      if (data.profileUrl) {
        fields["Link Profile"] = {
          link: String(data.profileUrl).trim(),
          text: `${data.platform || "Social"} Profile`,
        };
      }
    } else if (type === "community") {
      tableId = LARK_CONFIG.tables.communities;
      const name = String(data.name || "").trim();
      if (!name) {
        return NextResponse.json(
          { success: false, error: "Please enter Community / Group Name" },
          { status: 400 }
        );
      }

      const sport = normalizeArray(data.sport, ["Pickleball"]);
      const purpose = normalizeArray(data.purpose, ["Giao lưu tìm kèo"]);

      fields = {
        "Tên Nhóm / Cộng đồng": name,
        "Khu vực (Geography)": normalizeOption(data.geography, "Toàn quốc"),
        "Bộ môn thể thao (Sport)": sport,
        "Số lượng Thành viên (Members)": Number(data.members) || 0,
        "Nền tảng": data.platform || "Facebook Group",
        "Mức độ hoạt động": normalizeOption(
          data.activityLevel,
          "Rất sôi động (> 20 bài/ngày)"
        ),
        "Quyền riêng tư (Privacy)": normalizeOption(
          data.privacy,
          "Công khai (Public)"
        ),
        "Mục đích chính của nhóm": purpose,
        "Admin / Đầu mối liên hệ": String(data.adminContact || "").trim(),
        "Chi phí ghim bài / tháng (VNĐ)": isAdmin ? (Number(data.pricePerPin) || 0) : 0,
        "Trạng thái hợp tác": normalizeOption(
          data.status,
          "Đang hợp tác tích cực"
        ),
      };

      if (data.groupUrl) {
        fields["Link Nhóm (Group URL)"] = {
          link: String(data.groupUrl).trim(),
          text: `${data.platform || "Group"} Link`,
        };
      }
    } else if (type === "project") {
      tableId = LARK_CONFIG.tables.projects;
      const name = String(data.name || "").trim();
      if (!name) {
        return NextResponse.json(
          { success: false, error: "Please enter Campaign / Project Name" },
          { status: 400 }
        );
      }

      fields = {
        "Tên Chiến Dịch": name,
        "Thương hiệu / Nhãn hàng": String(data.brand || "").trim(),
        "Ngân sách dự kiến (VNĐ)": isAdmin ? (Number(data.budget) || 0) : 0,
        "Người phụ trách (PIC)": String(data.pic || "").trim(),
        "Mục tiêu chính": String(data.objective || "").trim(),
        "Trạng thái dự án": normalizeOption(data.status, "Lên kế hoạch"),
      };
      if (data.sport && Array.isArray(data.sport) && data.sport.length > 0) {
        fields["Bộ môn thể thao"] = data.sport;
      }
      if (data.region) {
        fields["Khu vực"] = data.region;
      }
    } else {
      return NextResponse.json(
        { success: false, error: `Invalid form type: ${type}` },
        { status: 400 }
      );
    }

    const res = await batchInsertRecords(tableId, [fields]);

    return NextResponse.json({
      success: true,
      count: res.count,
      message: "Record saved and synced directly to Lark Base!",
    });
  } catch (err: any) {
    console.error("API /api/lark/record error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Error saving data to Lark Base",
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { isAdmin } = await getServerUserRole();
    const body = await req.json();
    const { type, id, data } = body;

    if (!id || !type || !data) {
      return NextResponse.json(
        { success: false, error: "Missing required data (id, type or data)" },
        { status: 400 }
      );
    }

    let tableId = "";
    let fields: Record<string, any> = {};

    if (type === "kol") {
      tableId = LARK_CONFIG.tables.kols;
      const name = String(data.name || "").trim();
      if (!name) {
        return NextResponse.json(
          { success: false, error: "Please enter KOL Name / Channel" },
          { status: 400 }
        );
      }

      const sport = normalizeArray(data.sport, ["Pickleball"]);

      fields = {
        "Name of KOL/Channel": name,
        "Type Of Sport": sport,
        "KOL Tier": data.tier || "Micro (10k - 50k)",
        Platform: data.platform || "Facebook",
        Geography: normalizeOption(data.geography, "Toàn quốc"),
        Followers: Number(data.followers) || 0,
        "Avg Views": Number(data.avgViews) || 0,
        "Engagement Rate%": Number(data.er) || 0,
        Status: normalizeOption(data.status, "Đang hợp tác tích cực"),
        Information: String(data.contact || "").trim(),
        "Hashtags & Bio": String(data.bio || "").trim(),
      };

      if (isAdmin && data.quotation !== undefined) {
        fields["Quotation (VND)"] = Number(data.quotation) || 0;
      }

      if (data.profileUrl) {
        fields["Link Profile"] = {
          link: String(data.profileUrl).trim(),
          text: `${data.platform || "Social"} Profile`,
        };
      }
    } else if (type === "community") {
      tableId = LARK_CONFIG.tables.communities;
      const name = String(data.name || "").trim();
      if (!name) {
        return NextResponse.json(
          { success: false, error: "Please enter Community / Group Name" },
          { status: 400 }
        );
      }

      const sport = normalizeArray(data.sport, ["Pickleball"]);
      const purpose = normalizeArray(data.purpose, ["Giao lưu tìm kèo"]);

      fields = {
        "Tên Nhóm / Cộng đồng": name,
        "Khu vực (Geography)": normalizeOption(data.geography, "Toàn quốc"),
        "Bộ môn thể thao (Sport)": sport,
        "Số lượng Thành viên (Members)": Number(data.members) || 0,
        "Nền tảng": data.platform || "Facebook Group",
        "Mức độ hoạt động": normalizeOption(
          data.activityLevel,
          "Rất sôi động (> 20 bài/ngày)"
        ),
        "Quyền riêng tư (Privacy)": normalizeOption(
          data.privacy,
          "Công khai (Public)"
        ),
        "Mục đích chính của nhóm": purpose,
        "Admin / Đầu mối liên hệ": String(data.adminContact || "").trim(),
        "Trạng thái hợp tác": normalizeOption(
          data.status,
          "Đang hợp tác tích cực"
        ),
      };

      if (isAdmin && data.pricePerPin !== undefined) {
        fields["Chi phí ghim bài / tháng (VNĐ)"] = Number(data.pricePerPin) || 0;
      }

      if (data.groupUrl) {
        fields["Link Nhóm (Group URL)"] = {
          link: String(data.groupUrl).trim(),
          text: `${data.platform || "Group"} Link`,
        };
      }
    } else if (type === "project") {
      tableId = LARK_CONFIG.tables.projects;
      const name = String(data.name || "").trim();
      if (!name) {
        return NextResponse.json(
          { success: false, error: "Please enter Campaign / Project Name" },
          { status: 400 }
        );
      }

      fields = {
        "Tên Chiến Dịch": name,
        "Thương hiệu / Nhãn hàng": String(data.brand || (Array.isArray(data.brands) ? data.brands.join(", ") : "")).trim(),
        "Người phụ trách (PIC)": String(data.pic || "").trim(),
        "Mục tiêu chính": String(data.objective || "").trim(),
        "Trạng thái dự án": normalizeOption(data.status, "Lên kế hoạch"),
      };

      if (isAdmin && data.budget !== undefined) {
        fields["Ngân sách dự kiến (VNĐ)"] = Number(data.budget) || 0;
      }
      if (data.startDate) fields["Thời gian bắt đầu"] = data.startDate;
      if (data.endDate) fields["Thời gian kết thúc"] = data.endDate;
      if (data.sport && Array.isArray(data.sport) && data.sport.length > 0) {
        fields["Bộ môn thể thao"] = data.sport;
      }
      if (data.region) {
        fields["Khu vực"] = data.region;
      }
    } else {
      return NextResponse.json(
        { success: false, error: `Unsupported update type: ${type}` },
        { status: 400 }
      );
    }

    const res = await updateRecord(tableId, id, fields);

    return NextResponse.json({
      success: true,
      record: res,
      message: "Record updated successfully on Lark Base!",
    });
  } catch (err: any) {
    console.error("API PUT /api/lark/record error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Error updating record on Lark Base",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    let type = req.nextUrl.searchParams.get("type");
    let id = req.nextUrl.searchParams.get("id");

    if (!id) {
      try {
        const body = await req.json();
        type = type || body.type;
        id = id || body.id;
      } catch {
        // body might be empty if query string is used
      }
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing record ID to delete" },
        { status: 400 }
      );
    }

    let tableId = LARK_CONFIG.tables.kols;
    if (type === "community") {
      tableId = LARK_CONFIG.tables.communities;
    } else if (type === "project") {
      tableId = LARK_CONFIG.tables.projects;
    } else if (type === "post") {
      tableId = LARK_CONFIG.tables.posts;
    } else if (type === "report") {
      tableId = LARK_CONFIG.tables.reports;
    }

    await deleteRecord(tableId, id);

    return NextResponse.json({
      success: true,
      id,
      message: "Record deleted successfully from Lark Base!",
    });
  } catch (err: any) {
    console.error("API DELETE /api/lark/record error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Error deleting record from Lark Base",
      },
      { status: 500 }
    );
  }
}
