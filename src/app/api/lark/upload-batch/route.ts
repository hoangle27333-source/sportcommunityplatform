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
    "Nationwide";
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
    row["Status"] || row["Partnership Status"] || row["Trạng thái hợp tác"] || "Potential";
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
  const linkObj = linkRaw
    ? { text: String(linkRaw).slice(0, 50), link: String(linkRaw) }
    : undefined;

  const fields: Record<string, any> = {
    "Name of KOL/Channel": String(name).trim(),
    "Type Of Sport": sport.length > 0 ? sport : ["Other"],
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
      row["Bộ môn thể thao"] ||
      "Pickleball"
  );

  const geography =
    row["Khu vực (Geography)"] ||
    row["Geography"] ||
    row["Region"] ||
    row["Khu vực"] ||
    "Nationwide";
  const members = parseNum(
    row["Số lượng Thành viên (Members)"] ||
      row["Members"] ||
      row["Member Count"] ||
      row["Số lượng Thành viên"] ||
      row["Thành viên"]
  );
  const platform =
    row["Nền tảng"] || row["Platform"] || "Facebook Group";
  const activity =
    row["Mức độ hoạt động"] || row["Activity Level"] || "Very Active";
  const admin =
    row["Admin / Đầu mối liên hệ"] ||
    row["Admin"] ||
    row["Contact"] ||
    row["Liên hệ"] ||
    "";
  const price = parseNum(
    row["Chi phí ghim bài / tháng (VNĐ)"] ||
      row["Pin Post Fee"] ||
      row["Chi phí ghim bài"] ||
      0
  );
  const status =
    row["Trạng thái hợp tác"] || row["Status"] || "Active Partnership";

  const purpose = parseSportArray(
    row["Mục đích chính của nhóm"] || row["Purpose"] || "Match Finding & Socializing"
  );

  const linkRaw =
    row["Link Nhóm (Group URL)"] ||
    row["Group URL"] ||
    row["Link Nhóm"] ||
    row["Link"] ||
    "";
  const linkObj = linkRaw
    ? { text: String(linkRaw).slice(0, 50), link: String(linkRaw) }
    : undefined;

  const fields: Record<string, any> = {
    "Tên Nhóm / Cộng đồng": String(name).trim(),
    "Khu vực (Geography)": String(geography).trim(),
    "Bộ môn thể thao (Sport)": sport.length > 0 ? sport : ["Other"],
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
        { success: false, error: "Empty or invalid data rows" },
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
          error: "No valid data rows found (missing KOL Name or Community Name)",
        },
        { status: 400 }
      );
    }

    const result = await batchInsertRecords(tableId, mappedRecords);

    return NextResponse.json({
      success: true,
      inserted: result.count,
      total: mappedRecords.length,
      message: `Successfully imported ${result.count} records into Lark Base!`,
    });
  } catch (err: any) {
    console.error("API /api/lark/upload-batch error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Error uploading batch records to Lark Base",
      },
      { status: 500 }
    );
  }
}
