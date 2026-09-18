import { NextRequest, NextResponse } from "next/server";
import { batchInsertRecords, LARK_CONFIG } from "@/lib/lark/client";

export const dynamic = "force-dynamic";

function parseNum(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val;
  const cleaned = String(val).replace(/[^0-9.-]+/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseSportArray(val: any): string[] {
  if (!val) return ["Khác"];
  if (Array.isArray(val)) return val.map((s) => String(s).trim()).filter(Boolean);
  return String(val)
    .split(/[,;\n/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function mapKOLRecord(row: Record<string, any>) {
  const name =
    row["Name of KOL/Channel"] ||
    row["Tên KOL / Kênh"] ||
    row["Tên KOL"] ||
    row["Name"] ||
    "";
  if (!name) return null;

  const sport = parseSportArray(
    row["Type Of Sport"] ||
      row["Bộ môn thể thao"] ||
      row["Bộ môn"] ||
      row["Sport"] ||
      "Bóng đá"
  );

  const geography =
    row["Geography"] || row["Khu vực"] || row["Location"] || "Toàn quốc";
  const platform =
    row["Platform"] || row["Nền tảng"] || row["Kênh"] || "Facebook";
  const tier =
    row["KOL Tier"] || row["Phân khúc"] || row["Tier"] || "Micro (10k - 50k)";
  const followers = parseNum(
    row["Followers"] || row["Số lượng Followers"] || row["Follower"]
  );
  const avgViews = parseNum(row["Avg Views"] || row["Lượt xem trung bình"]);
  const er = parseNum(
    row["Engagement Rate%"] || row["Tỷ lệ tương tác (ER %)"] || row["ER%"]
  );
  const quotation = parseNum(
    row["Quotation (VND)"] ||
      row["Báo giá (VNĐ)"] ||
      row["Giá tham khảo (VNĐ)"] ||
      row["Bảng giá tham khảo (VNĐ)"]
  );
  const status =
    row["Status"] || row["Trạng thái hợp tác"] || row["Trạng thái"] || "Tiềm năng";
  const info =
    row["Information"] || row["Thông tin / Bio"] || row["Bio / Giới thiệu"] || "";

  const linkRaw =
    row["Link Profile"] || row["Kênh Social chính"] || row["Link"] || "";
  const linkObj = linkRaw
    ? { text: String(linkRaw).slice(0, 50), link: String(linkRaw) }
    : undefined;

  const fields: Record<string, any> = {
    "Name of KOL/Channel": String(name).trim(),
    "Type Of Sport": sport.length > 0 ? sport : ["Khác"],
    Geography: String(geography).trim(),
    Platform: String(platform).trim(),
    "KOL Tier": String(tier).trim(),
    Followers: followers,
    "Avg Views": avgViews,
    "Engagement Rate%": er,
    "Quotation (VND)": quotation,
    Status: String(status).trim(),
    Information: String(info).trim(),
  };

  if (linkObj) {
    fields["Link Profile"] = linkObj;
  }

  return fields;
}

function mapCommunityRecord(row: Record<string, any>) {
  const name =
    row["Tên Nhóm / Cộng đồng"] ||
    row["Tên Nhóm"] ||
    row["Community Name"] ||
    row["Name"] ||
    "";
  if (!name) return null;

  const sport = parseSportArray(
    row["Bộ môn thể thao (Sport)"] ||
      row["Bộ môn thể thao"] ||
      row["Sport"] ||
      "Pickleball"
  );

  const geography =
    row["Khu vực (Geography)"] || row["Khu vực"] || "Toàn quốc";
  const members = parseNum(
    row["Số lượng Thành viên (Members)"] ||
      row["Số lượng Thành viên"] ||
      row["Thành viên"]
  );
  const platform =
    row["Nền tảng"] || row["Platform"] || "Facebook Group";
  const activity =
    row["Mức độ hoạt động"] || "Hoạt động sôi nổi";
  const admin =
    row["Admin / Đầu mối liên hệ"] || row["Admin"] || row["Liên hệ"] || "";
  const price = parseNum(
    row["Chi phí ghim bài / tháng (VNĐ)"] || row["Chi phí ghim bài"] || 0
  );
  const status =
    row["Trạng thái hợp tác"] || "Đang hợp tác";

  const purpose = parseSportArray(
    row["Mục đích chính của nhóm"] || row["Mục đích"] || "Giao lưu thi đấu"
  );

  const linkRaw =
    row["Link Nhóm (Group URL)"] || row["Link Nhóm"] || row["Link"] || "";
  const linkObj = linkRaw
    ? { text: String(linkRaw).slice(0, 50), link: String(linkRaw) }
    : undefined;

  const fields: Record<string, any> = {
    "Tên Nhóm / Cộng đồng": String(name).trim(),
    "Khu vực (Geography)": String(geography).trim(),
    "Bộ môn thể thao (Sport)": sport.length > 0 ? sport : ["Khác"],
    "Số lượng Thành viên (Members)": members,
    "Nền tảng": String(platform).trim(),
    "Mức độ hoạt động": String(activity).trim(),
    "Admin / Đầu mối liên hệ": String(admin).trim(),
    "Mục đích chính của nhóm": purpose,
    "Chi phí ghim bài / tháng (VNĐ)": price,
    "Trạng thái hợp tác": String(status).trim(),
  };

  if (linkObj) {
    fields["Link Nhóm (Group URL)"] = linkObj;
  }

  return fields;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type = "kol", rows = [] } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Dữ liệu trống hoặc không hợp lệ" },
        { status: 400 }
      );
    }

    let tableId = LARK_CONFIG.tables.kols;
    let mappedRecords: any[] = [];

    if (type === "community") {
      tableId = LARK_CONFIG.tables.communities;
      mappedRecords = rows.map(mapCommunityRecord).filter(Boolean);
    } else {
      tableId = LARK_CONFIG.tables.kols;
      mappedRecords = rows.map(mapKOLRecord).filter(Boolean);
    }

    if (mappedRecords.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Không tìm thấy dòng dữ liệu hợp lệ (thiếu Tên KOL hoặc Tên Nhóm)",
        },
        { status: 400 }
      );
    }

    const result = await batchInsertRecords(tableId, mappedRecords);

    return NextResponse.json({
      success: true,
      inserted: result.count,
      total: mappedRecords.length,
      message: `Đã nạp thành công ${result.count} bản ghi lên Lark Base!`,
    });
  } catch (err: any) {
    console.error("API /api/lark/upload-batch error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Lỗi khi đẩy dữ liệu lên Lark Base",
      },
      { status: 500 }
    );
  }
}
