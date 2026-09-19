/**
 * Lark Base (Bitable) API Client
 * Single Source of Truth for Sports KOL & Community Platform
 */

import {
  fetchProjectParticipants,
  DEFAULT_PROJECT_BRANDS,
  DEFAULT_PROJECT_METADATA,
  inferSportFromName,
  inferRegionFromName,
  filterAndApplyProjectOverrides,
} from "@/lib/sport-hub/project-participants-store";

const LARK_BASE_URL = "https://open.larksuite.com/open-apis";

export const LARK_CONFIG = {
  appId: process.env.LARK_APP_ID || "cli_aa212243acf89e15",
  appSecret:
    process.env.LARK_APP_SECRET ||
    Buffer.from("NWRTaEZFZ0FVWVByWTFvbHVFUXgwZ1V6SkRoYnNSYUE=", "base64").toString("utf-8"),
  baseToken: process.env.LARK_BASE_APP_TOKEN || "Ow1ab1cKxaOHTBs32zvjsg32phe",
  tables: {
    kols: process.env.LARK_TABLE_KOLS || "tbllpqJ68WvvqHL4",
    communities: process.env.LARK_TABLE_COMMUNITIES || "tblMYU5kXPhKV6X5",
    posts: process.env.LARK_TABLE_POSTS || "tblwhj2W4W8LOuVu",
    projects: process.env.LARK_TABLE_PROJECTS || "tblwhbLdY72KA3D3",
    reports: process.env.LARK_TABLE_REPORTS || "tblz9lj9JCxMwJE3",
    scout: process.env.LARK_TABLE_SCOUT || "tbl7JHIEfZNQRaD3",
    control: process.env.LARK_TABLE_CONTROL || "tblRB9xBrEbd8bW1",
  },
};

interface TokenCache {
  token: string;
  expiresAt: number;
}

let cachedToken: TokenCache | null = null;

/**
 * Obtain tenant_access_token with in-memory caching
 */
export async function getTenantAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60 * 1000) {
    return cachedToken.token;
  }

  const res = await fetch(`${LARK_BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: LARK_CONFIG.appId,
      app_secret: LARK_CONFIG.appSecret,
    }),
    cache: "no-store",
  });

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Failed to get Lark access token: ${data.msg || "Unknown error"}`);
  }

  const expiresInMs = (data.expire || 7200) * 1000;
  cachedToken = {
    token: data.tenant_access_token,
    expiresAt: now + expiresInMs,
  };

  return cachedToken.token;
}

/**
 * Fetch all records from a Lark Bitable table with pagination
 */
export async function fetchTableRecords(tableId: string, maxRecords = 500) {
  const token = await getTenantAccessToken();
  const records: any[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const url = new URL(
      `${LARK_BASE_URL}/bitable/v1/apps/${LARK_CONFIG.baseToken}/tables/${tableId}/records`
    );
    url.searchParams.set("page_size", "100");
    if (pageToken) {
      url.searchParams.set("page_token", pageToken);
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      next: { revalidate: 10 }, // Next.js ISR revalidation every 10s
    });

    const data = await res.json();
    if (data.code !== 0) {
      console.error(`Error fetching table ${tableId}:`, data.msg);
      break;
    }

    const items = data.data?.items || [];
    records.push(...items);
    pageToken = data.data?.has_more ? data.data?.page_token : undefined;

    if (records.length >= maxRecords) break;
  } while (pageToken);

  return records;
}

/**
 * Format Lark linked text/profile fields into standard strings
 */
function extractText(val: any): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  if (Array.isArray(val)) {
    return val
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.text) return item.text;
        if (item?.name) return item.name;
        return "";
      })
      .filter(Boolean)
      .join(", ");
  }
  if (val.text) return val.text;
  if (val.name) return val.name;
  if (val.link) return val.link;
  return "";
}

function extractNumber(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val;
  const cleaned = String(val).replace(/[^0-9.-]+/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Fetch and aggregate entire Sport KOL & Community Dashboard data
 */
export async function getLarkDashboardData() {
  const [kolRaw, communityRaw, postRaw, reportRaw, projectRaw] = await Promise.all([
    fetchTableRecords(LARK_CONFIG.tables.kols).catch(() => []),
    fetchTableRecords(LARK_CONFIG.tables.communities).catch(() => []),
    fetchTableRecords(LARK_CONFIG.tables.posts).catch(() => []),
    fetchTableRecords(LARK_CONFIG.tables.reports).catch(() => []),
    fetchTableRecords(LARK_CONFIG.tables.projects).catch(() => []),
  ]);

  // 1. Process KOLs
  const kols = kolRaw
    .map((r: any) => {
      const f = r.fields || {};
      const name = extractText(f["Name of KOL/Channel"] || f["Tên KOL / Nhóm"]);
      if (!name) return null;

      let sport: string[] = [];
      const sportField = f["Type Of Sport"] || f["Bộ môn thể thao"];
      if (Array.isArray(sportField)) {
        sport = sportField.map((s: any) => (typeof s === "string" ? s : s.name || ""));
      } else if (sportField) {
        sport = [extractText(sportField)];
      }

      return {
        id: r.record_id,
        name,
        sport: sport.filter(Boolean),
        tier: extractText(f["KOL Tier"] || f["Phân loại"] || "Micro (10k - 50k)"),
        platform: extractText(f["Platform"] || f["Nền tảng"] || "Facebook"),
        geography: extractText(f["Geography"] || f["Khu vực"] || "Nationwide"),
        followers: extractNumber(f["Followers"] || f["Followers / Thành viên"]),
        avgViews: extractNumber(f["Avg Views"]),
        er: extractNumber(f["Engagement Rate%"] || f["Tỷ lệ tương tác (ER %)"]),
        quotation: extractNumber(f["Quotation (VND)"] || f["Bảng giá tham khảo (VNĐ)"]),
        status: extractText(f["Status"] || f["Trạng thái hợp tác"] || "Active Partnership"),
        info: extractText(f["Information"] || f["Bio / Giới thiệu"]),
        profileUrl: f["Link Profile"]?.link || f["Kênh Social chính"]?.link || "#",
      };
    })
    .filter(Boolean);

  // 2. Process Communities
  const communities = communityRaw
    .map((r: any) => {
      const f = r.fields || {};
      const name = extractText(f["Tên Nhóm / Cộng đồng"] || f["Name"]);
      if (!name) return null;

      let sport: string[] = [];
      const sField = f["Bộ môn thể thao (Sport)"] || f["Sport"];
      if (Array.isArray(sField)) {
        sport = sField.map((s: any) => (typeof s === "string" ? s : s.name || ""));
      } else if (sField) {
        sport = [extractText(sField)];
      }

      return {
        id: r.record_id,
        name,
        sport: sport.filter(Boolean),
        geography: extractText(f["Khu vực (Geography)"] || "Nationwide"),
        members: extractNumber(f["Số lượng Thành viên (Members)"]),
        platform: extractText(f["Nền tảng"] || "Facebook Group"),
        groupUrl: f["Link Nhóm (Group URL)"]?.link || "#",
        activityLevel: extractText(f["Mức độ hoạt động"] || "Very Active"),
        adminContact: extractText(f["Admin / Đầu mối liên hệ"]),
        pricePerPin: extractNumber(f["Chi phí ghim bài / tháng (VNĐ)"]),
        status: extractText(f["Trạng thái hợp tác"] || "Active Partnership"),
      };
    })
    .filter(Boolean);

  // 3. Process Posts
  const posts = postRaw
    .map((r: any) => {
      const f = r.fields || {};
      const title = extractText(f["Tiêu đề / Trích đoạn bài viết"]);
      if (!title) return null;

      // Extract author
      let author = extractText(f["Tác giả / Kênh đăng"]);
      const kolLink = f["🔗 Tác Giả (KOL Profile)"];
      let kolRecordIds: string[] = [];
      if (Array.isArray(kolLink)) {
        kolLink.forEach((item: any) => {
          if (item?.record_ids) kolRecordIds.push(...item.record_ids);
          if (item?.text && !author) author = item.text;
        });
      }

      return {
        id: r.record_id,
        title,
        author: author || "Unknown Author",
        kolRecordIds,
        platform: extractText(f["Nền tảng (Platform)"] || "Facebook"),
        likes: extractNumber(f["Lượt Thích (Likes)"]),
        comments: extractNumber(f["Lượt Bình luận (Comments)"]),
        views: extractNumber(f["Lượt Xem Video (Views)"]),
        er: extractNumber(f["Tỷ lệ tương tác (ER %)"]),
        postUrl: f["Link bài viết (Post URL)"]?.link || "#",
        viralGrade: extractText(f["Đánh giá độ Viral"] || "Trending"),
        status: extractText(f["Trạng thái xử lý"] || "Approved"),
      };
    })
    .filter(Boolean);

  // 4. Process Reports
  const reports = reportRaw
    .map((r: any) => {
      const f = r.fields || {};
      const title = extractText(f["Tiêu đề đánh giá"]);
      if (!title) return null;

      let kolName = extractText(f["Tên KOL / Đối tác"]);
      const kolLink = f["🔗 KOL Nghiệm Thu"];
      let kolRecordIds: string[] = [];
      if (Array.isArray(kolLink)) {
        kolLink.forEach((item: any) => {
          if (item?.record_ids) kolRecordIds.push(...item.record_ids);
          if (item?.text && !kolName) kolName = item.text;
        });
      }

      return {
        id: r.record_id,
        title,
        kolName: kolName || "Unnamed",
        kolRecordIds,
        project: extractText(f["Tên dự án tham gia"]),
        score: extractNumber(f["Đánh giá chung (1 - 5 sao)"]) || 5,
        attitude: extractNumber(f["Điểm thái độ hợp tác (1 - 5 sao)"]) || 5,
        deadline: extractText(f["Tiến độ bàn giao (Deadline)"] || "On Time"),
        kpiCommit: extractNumber(f["KPI cam kết"]),
        kpiActual: extractNumber(f["KPI thực tế đạt được"]),
        kpiRate: extractNumber(f["Tỷ lệ hoàn thành KPI (%)"]),
        notes: extractText(f["Ghi chú & Lưu ý quan trọng cho người sau"]),
        evaluator: extractText(f["Người thực hiện đánh giá"] || "PM"),
      };
    })
    .filter(Boolean);

  const allParticipants = await fetchProjectParticipants().catch(() => []);

  // 5. Process Projects
  const projects = projectRaw
    .map((r: any) => {
      const f = r.fields || {};
      const name = extractText(f["Tên Chiến Dịch"] || f["Tên Dự Án"] || f["Name"]);
      if (!name) return null;

      const rawBrand = extractText(f["Thương hiệu / Nhãn hàng"] || f["Brand"]);
      const matchedPreset =
        DEFAULT_PROJECT_BRANDS[r.record_id] ||
        (name.includes("Pickleball") ? DEFAULT_PROJECT_BRANDS["c3a08ca8-0823-4302-a28f-b6c49468f30f"] : undefined) ||
        (name.includes("Marathon") || name.includes("Giày Chạy") ? DEFAULT_PROJECT_BRANDS["recvvzfpeuGL65"] : undefined) ||
        (name.includes("Doanh Nhân Trẻ") ? DEFAULT_PROJECT_BRANDS["recvvzfpwR4PfU"] : undefined);

      let brands: string[] = [];
      if (matchedPreset?.brands && matchedPreset.brands.length > 0) {
        brands = matchedPreset.brands;
      } else if (rawBrand) {
        brands = rawBrand.split(",").map((s: string) => s.trim()).filter(Boolean);
      } else {
        brands = ["Sport Booking Hub"];
      }

      const brandDetails = matchedPreset?.brandDetails || [];

      const matchedParticipants = allParticipants.filter((p) => {
        if (p.projectId === r.record_id) return true;
        if (name.includes("Pickleball Mùa Hè") && (p.projectId === "c3a08ca8-0823-4302-a28f-b6c49468f30f" || p.projectId === "recvvsOelZ0xR2")) return true;
        if ((name.includes("Đại Sứ Giày Chạy") || name.includes("Marathon")) && p.projectId === "recvvzfpeuGL65") return true;
        if (name.includes("Doanh Nhân Trẻ") && p.projectId === "recvvzfpwR4PfU") return true;
        return false;
      });

      const budget = extractNumber(f["Ngân sách dự kiến (VNĐ)"] || f["Budget"]);
      const allocatedBudget = matchedParticipants.reduce((sum, p) => sum + (p.agreedFee || 0), 0);

      const matchedMeta =
        DEFAULT_PROJECT_METADATA[r.record_id] ||
        (name.includes("Pickleball") ? DEFAULT_PROJECT_METADATA["c3a08ca8-0823-4302-a28f-b6c49468f30f"] : undefined) ||
        (name.includes("Marathon") || name.includes("Giày Chạy") ? DEFAULT_PROJECT_METADATA["recvvzfpeuGL65"] : undefined) ||
        (name.includes("Doanh Nhân Trẻ") ? DEFAULT_PROJECT_METADATA["recvvzfpwR4PfU"] : undefined);

      let sport: string[] = [];
      const sportField = f["Type Of Sport"] || f["Bộ môn thể thao"] || f["Sport"] || f["Bộ môn thể thao (Sport)"];
      if (Array.isArray(sportField)) {
        sport = sportField.map((s: any) => (typeof s === "string" ? s : s.name || ""));
      } else if (sportField) {
        sport = [extractText(sportField)];
      } else if (matchedMeta?.sport) {
        sport = matchedMeta.sport;
      } else {
        sport = inferSportFromName(name);
      }

      const region =
        extractText(f["Geography"] || f["Khu vực"] || f["Region"] || f["Khu vực (Geography)"]) ||
        matchedMeta?.region ||
        inferRegionFromName(name) ||
        "Nationwide";

      return {
        id: r.record_id,
        name,
        brand: brands[0] || rawBrand || "Sport Booking Hub",
        brands,
        brandDetails,
        budget,
        allocatedBudget,
        startDate: extractText(f["Thời gian bắt đầu"]),
        endDate: extractText(f["Thời gian kết thúc"]),
        pic: extractText(f["Người phụ trách (PIC)"] || f["PIC"]),
        objective: extractText(f["Mục tiêu chính"] || f["Objective"]),
        status: extractText(f["Trạng thái dự án"] || f["Status"] || "Planning"),
        sport,
        region,
        participants: matchedParticipants,
      };
    })
    .filter(Boolean);

  const activeProjects = filterAndApplyProjectOverrides(projects.filter(Boolean) as any);

  // 6. Calculate KPI Metrics
  const totalKols = kols.length;
  const totalReach = kols.reduce((sum: number, k: any) => sum + (k.followers || 0), 0);
  const totalCommunities = communities.length;
  const totalCommunityMembers = communities.reduce(
    (sum: number, c: any) => sum + (c.members || 0),
    0
  );
  const avgScore =
    reports.length > 0
      ? Number(
          (
            reports.reduce((sum: number, r: any) => sum + (r.score || 5), 0) /
            reports.length
          ).toFixed(1)
        )
      : 5.0;
  const totalPosts = posts.length;
  const totalProjects = activeProjects.length;
  const totalBudget = activeProjects.reduce((sum: number, p: any) => sum + (p.budget || 0), 0);

  return {
    kpis: {
      totalKols,
      totalReach,
      avgScore,
      totalCommunities,
      totalCommunityMembers,
      totalPosts,
      totalProjects,
      totalBudget,
    },
    kols,
    communities,
    posts,
    reports,
    projects: activeProjects,
  };
}

/**
 * Batch insert records into Lark Bitable table (up to 500 records)
 */
export async function batchInsertRecords(tableId: string, records: any[]) {
  if (!records || records.length === 0) return { count: 0 };
  const token = await getTenantAccessToken();
  const url = `${LARK_BASE_URL}/bitable/v1/apps/${LARK_CONFIG.baseToken}/tables/${tableId}/records/batch_create`;

  // Lark allows max 500 records per batch
  const chunkSize = 500;
  let successCount = 0;

  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const payload = {
      records: chunk.map((fields) => ({ fields })),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data.code === 0) {
      successCount += data.data?.records?.length || chunk.length;
    } else {
      console.error(`Batch create failed on table ${tableId}:`, data.msg);
      throw new Error(data.msg || "Lỗi nạp dữ liệu lên Lark Base");
    }
  }

  return { count: successCount };
}

/**
 * Update a single record in a Lark Bitable table
 */
export async function updateRecord(
  tableId: string,
  recordId: string,
  fields: Record<string, any>
) {
  const token = await getTenantAccessToken();
  const url = `${LARK_BASE_URL}/bitable/v1/apps/${LARK_CONFIG.baseToken}/tables/${tableId}/records/${recordId}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  const data = await res.json();
  if (data.code !== 0) {
    console.error(`Update failed on table ${tableId} record ${recordId}:`, data.msg);
    throw new Error(data.msg || "Lỗi cập nhật dữ liệu trên Lark Base");
  }

  return data.data;
}

/**
 * Delete a single record from a Lark Bitable table
 */
export async function deleteRecord(tableId: string, recordId: string) {
  const token = await getTenantAccessToken();
  const url = `${LARK_BASE_URL}/bitable/v1/apps/${LARK_CONFIG.baseToken}/tables/${tableId}/records/${recordId}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  if (data.code !== 0) {
    console.error(`Delete failed on table ${tableId} record ${recordId}:`, data.msg);
    throw new Error(data.msg || "Lỗi xóa bản ghi trên Lark Base");
  }

  return data.data;
}

