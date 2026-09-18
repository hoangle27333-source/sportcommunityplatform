import { NextRequest, NextResponse } from "next/server";
import { bulkInsertKOLs, bulkInsertCommunities } from "@/lib/sport-hub/service";

export const dynamic = "force-dynamic";

function parseNum(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val;
  const cleaned = String(val).replace(/[^0-9.-]+/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseSportArray(val: any): string[] {
  if (!val) return ["Other"];
  if (Array.isArray(val)) return val.map((s) => String(s).trim()).filter(Boolean);
  return String(val)
    .split(/[,;\n/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function mapKOLRecord(row: Record<string, any>) {
  const name =
    row["Name of KOL/Channel"] ||
    row["KOL Name"] ||
    row["Tên KOL / Kênh"] ||
    row["Tên KOL"] ||
    row["Name"] ||
    "";
  if (!name) return null;

  const sport = parseSportArray(
    row["Type Of Sport"] ||
      row["Sport"] ||
      row["Sports"] ||
      row["Bộ môn thể thao"] ||
      row["Bộ môn"] ||
      "Pickleball"
  );

  const geography =
    row["Geography"] ||
    row["Region"] ||
    row["Location"] ||
    row["Khu vực"] ||
    "Toàn quốc";
  const platform =
    row["Platform"] || row["Kênh"] || row["Nền tảng"] || "Facebook";
  const tier =
    row["KOL Tier"] || row["Tier"] || row["Phân khúc"] || "Micro (10k - 50k)";
  const followers = parseNum(
    row["Followers"] || row["Follower"] || row["Số lượng Followers"]
  );
  const avgViews = parseNum(
    row["Avg Views"] || row["Average Views"] || row["Lượt xem trung bình"]
  );
  const er = parseNum(
    row["Engagement Rate%"] || row["ER%"] || row["Tỷ lệ tương tác (ER %)"]
  );
  const quotation = parseNum(
    row["Quotation (VND)"] ||
      row["Quotation"] ||
      row["Price"] ||
      row["Báo giá (VNĐ)"] ||
      row["Giá tham khảo (VNĐ)"] ||
      row["Bảng giá tham khảo (VNĐ)"]
  );
  const status =
    row["Status"] || row["Partnership Status"] || row["Trạng thái hợp tác"] || "Đang hợp tác tích cực";
  const info =
    row["Information"] ||
    row["Contact"] ||
    row["Bio"] ||
    row["Thông tin / Bio"] ||
    row["Bio / Giới thiệu"] ||
    "";

  const linkRaw =
    row["Link Profile"] ||
    row["Profile URL"] ||
    row["Kênh Social chính"] ||
    row["Link"] ||
    "";

  return {
    name: String(name).trim(),
    sports: sport.length > 0 ? sport : ["Other"],
    geography: String(geography).trim(),
    platform: String(platform).trim(),
    tier: String(tier).trim(),
    followers,
    avgViews,
    er,
    quotation,
    status: String(status).trim(),
    contact: String(info).trim(),
    profileUrl: typeof linkRaw === "object" && linkRaw.link ? linkRaw.link : String(linkRaw).trim(),
  };
}

function mapCommunityRecord(row: Record<string, any>) {
  const name =
    row["Tên Nhóm / Cộng đồng"] ||
    row["Community Name"] ||
    row["Group Name"] ||
    row["Tên Nhóm"] ||
    row["Name"] ||
    "";
  if (!name) return null;

  const sport = parseSportArray(
    row["Bộ môn thể thao (Sport)"] ||
      row["Sport"] ||
      row["Sports"] ||
      row["Bộ môn"] ||
      "Pickleball"
  );

  const geography =
    row["Khu vực (Geography)"] ||
    row["Geography"] ||
    row["Location"] ||
    row["Khu vực"] ||
    "Toàn quốc";
  const members = parseNum(
    row["Số lượng Thành viên (Members)"] ||
      row["Members"] ||
      row["Thành viên"] ||
      row["Số thành viên"]
  );
  const platform =
    row["Nền tảng"] || row["Platform"] || row["Kênh"] || "Facebook Group";
  const activityLevel =
    row["Mức độ hoạt động"] ||
    row["Activity Level"] ||
    "Rất sôi động (> 20 bài/ngày)";
  const privacy =
    row["Quyền riêng tư (Privacy)"] || row["Privacy"] || "Công khai (Public)";
  const purpose = parseSportArray(
    row["Mục đích chính của nhóm"] || row["Purpose"] || "Giao lưu tìm kèo"
  );
  const adminContact =
    row["Admin / Đầu mối liên hệ"] ||
    row["Admin Contact"] ||
    row["Liên hệ Admin"] ||
    "";
  const pricePerPin = parseNum(
    row["Chi phí ghim bài / tháng (VNĐ)"] ||
      row["Price Per Pin"] ||
      row["Giá ghim bài"]
  );
  const status =
    row["Trạng thái hợp tác"] || row["Status"] || "Đang hợp tác tích cực";

  const groupUrlRaw =
    row["Link Nhóm (Group URL)"] ||
    row["Group URL"] ||
    row["Link Nhóm"] ||
    row["Link"] ||
    "";

  return {
    name: String(name).trim(),
    sports: sport,
    geography: String(geography).trim(),
    members,
    platform: String(platform).trim(),
    groupUrl: typeof groupUrlRaw === "object" && groupUrlRaw.link ? groupUrlRaw.link : String(groupUrlRaw).trim(),
    activityLevel: String(activityLevel).trim(),
    privacy: String(privacy).trim(),
    purposes: purpose,
    adminContact: String(adminContact).trim(),
    pricePerPin,
    status: String(status).trim(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, records } = body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { success: false, error: "No records provided" },
        { status: 400 }
      );
    }

    let createdCount = 0;

    if (type === "kol") {
      const mapped = records.map(mapKOLRecord).filter(Boolean);
      if (mapped.length === 0) {
        return NextResponse.json(
          { success: false, error: "No valid KOL records found in uploaded data" },
          { status: 400 }
        );
      }
      const res = await bulkInsertKOLs(mapped);
      createdCount = res?.length || 0;
    } else if (type === "community") {
      const mapped = records.map(mapCommunityRecord).filter(Boolean);
      if (mapped.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "No valid Community records found in uploaded data",
          },
          { status: 400 }
        );
      }
      const res = await bulkInsertCommunities(mapped);
      createdCount = res?.length || 0;
    } else {
      return NextResponse.json(
        { success: false, error: `Invalid upload type: ${type}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      count: createdCount,
      message: `Successfully imported ${createdCount} records to Supabase!`,
    });
  } catch (err: any) {
    console.error("API POST /api/sport-hub/upload-batch error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Error processing batch upload",
      },
      { status: 500 }
    );
  }
}
