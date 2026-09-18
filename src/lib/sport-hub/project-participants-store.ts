import { createAdminClient } from "@/lib/supabase/admin";
import type { ProjectParticipant, ProjectBrand } from "@/components/sport-hub/types";

// Fallback in-memory store for active session mutations
let memoryParticipants: ProjectParticipant[] = [
  // ─── PROJECT 1: Giải Vô Địch Pickleball Mùa Hè 2026 ───
  {
    id: "part-pb-1",
    projectId: "c3a08ca8-0823-4302-a28f-b6c49468f30f",
    entityType: "kol",
    kolId: "afe0f2d8-f6ac-4d2c-9b1f-785ff44a28d1",
    entityName: "Đỗ Kim Phúc",
    avatarUrl: "",
    sport: ["Football", "Others"],
    tierOrPlatform: "Mega (> 200k) · Facebook",
    deliverableScope: "1 Reel Video review giải đấu + 2 Stories check-in gian hàng",
    agreedFee: 25000000,
    targetViews: 100000,
    actualViews: 135000,
    targetReach: 150000,
    actualReach: 200000,
    actualER: 4.8,
    proofUrl: "https://facebook.com/reel/dokimphuc-pickleball-2026",
    status: "Signed Off",
    ratingScore: 5.0,
    attitudeScore: 5.0,
    deadlineStatus: "Ahead of Schedule",
    pmNotes: "Phúc làm việc rất chuyên nghiệp, đúng giờ, nhiệt tình quay thêm video phụ kiện ngoài cam kết.",
    evaluator: "Hoàng Lê (Project Manager)",
    updatedAt: "2026-09-18T18:12:00.000Z",
  },
  {
    id: "part-pb-2",
    projectId: "c3a08ca8-0823-4302-a28f-b6c49468f30f",
    entityType: "kol",
    kolId: "bce1f3d9-g7bd-5e3d-0c2g-896gg55b39e2",
    entityName: "Hoàng Đăng Phan",
    avatarUrl: "",
    sport: ["Pickleball"],
    tierOrPlatform: "Macro (50k - 200k) · TikTok",
    deliverableScope: "Thi đấu giao lưu tại trận chung kết + 1 Clip ngắn highlight TikTok",
    agreedFee: 18000000,
    targetViews: 20000,
    actualViews: 38500,
    targetReach: 35000,
    actualReach: 52000,
    actualER: 6.2,
    proofUrl: "https://tiktok.com/@hoangdangphan/video/highlight-final",
    status: "Signed Off",
    ratingScore: 4.8,
    attitudeScore: 5.0,
    deadlineStatus: "On Time",
    pmNotes: "Phan thi đấu rất nhiệt huyết, clip Reels đạt tương tác đột biến.",
    evaluator: "Hoàng Lê (PM)",
    updatedAt: "2026-09-18T18:15:00.000Z",
  },
  {
    id: "part-pb-3",
    projectId: "c3a08ca8-0823-4302-a28f-b6c49468f30f",
    entityType: "community",
    communityId: "comm-pb-vn-1",
    entityName: "Cộng Đồng Pickleball Việt Nam",
    avatarUrl: "",
    sport: ["Pickleball"],
    tierOrPlatform: "85,000 members · Facebook Group",
    deliverableScope: "Ghim bài thông báo điều lệ giải 30 ngày + 4 bài chia sẻ livestream giải đấu",
    agreedFee: 10000000,
    targetReach: 80000,
    actualReach: 95000,
    targetViews: 40000,
    actualViews: 48000,
    actualER: 5.2,
    proofUrl: "https://facebook.com/groups/pickleballvn/permalink/1019283",
    status: "Signed Off",
    ratingScore: 5.0,
    attitudeScore: 5.0,
    deadlineStatus: "On Time",
    pmNotes: "Admin duyệt bài rất nhanh, tương tác thảo luận về thể lệ giải rất sôi nổi.",
    evaluator: "Hoàng Lê (PM)",
    updatedAt: "2026-09-18T18:20:00.000Z",
  },
  {
    id: "part-pb-4",
    projectId: "c3a08ca8-0823-4302-a28f-b6c49468f30f",
    entityType: "community",
    communityId: "comm-pb-badinh-2",
    entityName: "CLB Pickleball Ba Đình",
    avatarUrl: "",
    sport: ["Pickleball"],
    tierOrPlatform: "12,000 members · Facebook Group",
    deliverableScope: "Cử 5 cặp VĐV tham gia thi đấu + Treo banner nhận diện tại cụm sân",
    agreedFee: 5000000,
    targetReach: 15000,
    actualReach: 19500,
    targetViews: 10000,
    actualViews: 14200,
    actualER: 4.1,
    proofUrl: "https://facebook.com/groups/clbpickleballbadinh/posts/99128",
    status: "Signed Off",
    ratingScore: 4.9,
    attitudeScore: 5.0,
    deadlineStatus: "On Time",
    pmNotes: "Các thành viên CLB tham gia đông đủ, hình ảnh nhận diện thương hiệu tại sân tốt.",
    evaluator: "Hoàng Lê (PM)",
    updatedAt: "2026-09-18T18:22:00.000Z",
  },

  // ─── PROJECT 2: Chiến Dịch Đại Sứ Giày Chạy Marathon Thu Đông 2026 ───
  {
    id: "part-rn-1",
    projectId: "recvvzfpeuGL65",
    entityType: "kol",
    kolId: "recvvsUfkSvYvv",
    entityName: "Dean Nguyen (Chạy Cùng Dean)",
    avatarUrl: "",
    sport: ["Running / Marathon"],
    tierOrPlatform: "Micro (10k - 50k) · YouTube / TikTok",
    deliverableScope: "1 Video chuyên sâu Review dòng đệm giày + Chạy thực tế cự ly 21km",
    agreedFee: 15000000,
    targetViews: 30000,
    actualViews: 45000,
    targetReach: 50000,
    actualReach: 68000,
    actualER: 5.8,
    proofUrl: "https://youtube.com/watch?v=deannguyen-nikerunning",
    status: "Signed Off",
    ratingScore: 5.0,
    attitudeScore: 4.9,
    deadlineStatus: "Ahead of Schedule",
    pmNotes: "Nội dung chạy bộ chuyên sâu, tệp follower rất chất lượng và có thói quen mua sắm.",
    evaluator: "Lê Minh Hoàng",
    updatedAt: "2026-09-18T18:25:00.000Z",
  },
  {
    id: "part-rn-2",
    projectId: "recvvzfpeuGL65",
    entityType: "kol",
    kolId: "kol-hana-giang-anh",
    entityName: "Hana Giang Anh",
    avatarUrl: "",
    sport: ["Gym & Fitness", "Running / Marathon"],
    tierOrPlatform: "Mega (> 200k) · Instagram",
    deliverableScope: "1 Reel bài tập khởi động và giãn cơ tránh chấn thương cùng giày chạy",
    agreedFee: 20000000,
    targetViews: 80000,
    actualViews: 92000,
    targetReach: 120000,
    actualReach: 135000,
    actualER: 3.9,
    proofUrl: "https://instagram.com/reel/hanagianganh-running-warmup",
    status: "Delivered",
    ratingScore: 5.0,
    attitudeScore: 5.0,
    deadlineStatus: "On Time",
    pmNotes: "Tương tác cộng đồng nữ runner rất tích cực.",
    evaluator: "Lê Minh Hoàng",
    updatedAt: "2026-09-18T18:28:00.000Z",
  },
  {
    id: "part-rn-3",
    projectId: "recvvzfpeuGL65",
    entityType: "community",
    communityId: "comm-saigon-runner",
    entityName: "Hội Yêu Chạy Bộ & Marathon Sài Gòn",
    avatarUrl: "",
    sport: ["Running / Marathon"],
    tierOrPlatform: "45,000 members · Facebook Group",
    deliverableScope: "Ghim thông báo thử giày tại công viên Sala 14 ngày + 2 bài review thực tế",
    agreedFee: 8000000,
    targetReach: 50000,
    actualReach: 62000,
    targetViews: 25000,
    actualViews: 31000,
    actualER: 4.6,
    proofUrl: "https://facebook.com/groups/saigonmarathon/posts/882193",
    status: "Delivered",
    ratingScore: 4.8,
    attitudeScore: 5.0,
    deadlineStatus: "On Time",
    pmNotes: "Buổi thử giày có hơn 120 runner tham gia trải nghiệm trực tiếp.",
    evaluator: "Lê Minh Hoàng",
    updatedAt: "2026-09-18T18:30:00.000Z",
  },

  // ─── PROJECT 3: Giải Pickleball & Tennis Doanh Nhân Trẻ Hà Nội ───
  {
    id: "part-fr-1",
    projectId: "recvvzfpwR4PfU",
    entityType: "kol",
    kolId: "kol-le-hoang-c",
    entityName: "Lê Hoàng C",
    avatarUrl: "",
    sport: ["Gym & Fitness", "Pickleball"],
    tierOrPlatform: "Mega (> 200k) · TikTok",
    deliverableScope: "MC dẫn dắt lễ khai mạc + 2 Video Reels ngắn highlight",
    agreedFee: 20000000,
    targetViews: 40000,
    actualViews: 0,
    targetReach: 60000,
    actualReach: 0,
    actualER: 0,
    proofUrl: "",
    status: "Confirmed",
    ratingScore: 5.0,
    attitudeScore: 5.0,
    deadlineStatus: "On Time",
    pmNotes: "Đang khớp kịch bản dẫn chương trình.",
    evaluator: "Thu Trang",
    updatedAt: "2026-09-18T18:32:00.000Z",
  },
  {
    id: "part-fr-2",
    projectId: "recvvzfpwR4PfU",
    entityType: "community",
    communityId: "comm-pb-friends-hcm",
    entityName: "Pickleball Friends Club TP.HCM",
    avatarUrl: "",
    sport: ["Pickleball"],
    tierOrPlatform: "28,000 members · Facebook Group",
    deliverableScope: "Truyền thông chéo liên kết giải đấu Bắc - Nam",
    agreedFee: 6000000,
    targetReach: 30000,
    actualReach: 0,
    targetViews: 15000,
    actualViews: 0,
    actualER: 0,
    proofUrl: "",
    status: "Confirmed",
    ratingScore: 5.0,
    attitudeScore: 5.0,
    deadlineStatus: "On Time",
    pmNotes: "Đã chốt nội dung banner truyền thông.",
    evaluator: "Thu Trang",
    updatedAt: "2026-09-18T18:35:00.000Z",
  },
];

// Sample multi-brand details preset for known projects
export const DEFAULT_PROJECT_BRANDS: Record<string, { brands: string[]; brandDetails: ProjectBrand[] }> = {
  "c3a08ca8-0823-4302-a28f-b6c49468f30f": {
    brands: ["Sport Booking Hub", "Franklin Pickleball", "Pocari Sweat"],
    brandDetails: [
      { name: "Sport Booking Hub", role: "Title Sponsor", contribution: 100000000 },
      { name: "Franklin Pickleball", role: "Equipment Partner", contribution: 35000000 },
      { name: "Pocari Sweat", role: "Hydration Sponsor", contribution: 15000000 },
    ],
  },
  "recvvsOelZ0xR2": {
    brands: ["Sport Booking Hub", "Franklin Pickleball", "Pocari Sweat"],
    brandDetails: [
      { name: "Sport Booking Hub", role: "Title Sponsor", contribution: 100000000 },
      { name: "Franklin Pickleball", role: "Equipment Partner", contribution: 35000000 },
      { name: "Pocari Sweat", role: "Hydration Sponsor", contribution: 15000000 },
    ],
  },
  "recvvzfpeuGL65": {
    brands: ["Nike Running VN", "Garmin Vietnam"],
    brandDetails: [
      { name: "Nike Running VN", role: "Title Sponsor", contribution: 100000000 },
      { name: "Garmin Vietnam", role: "Official Pacer Partner", contribution: 20000000 },
    ],
  },
  "recvvzfpwR4PfU": {
    brands: ["Franklin Pickleball", "Mercedes-Benz Haxaco"],
    brandDetails: [
      { name: "Franklin Pickleball", role: "Title Sponsor", contribution: 60000000 },
      { name: "Mercedes-Benz Haxaco", role: "Luxury Mobility Partner", contribution: 25000000 },
    ],
  },
};

/**
 * Fetch all participants for a specific project or all projects
 */
export async function fetchProjectParticipants(projectId?: string): Promise<ProjectParticipant[]> {
  try {
    const supabase = createAdminClient();
    let query = supabase.from("project_participants").select("*");
    if (projectId) {
      query = query.eq("project_id", projectId);
    }
    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      return data.map((r: any) => ({
        id: r.id,
        projectId: r.project_id,
        entityType: r.entity_type,
        kolId: r.kol_id || undefined,
        communityId: r.community_id || undefined,
        entityName: r.entity_name,
        avatarUrl: r.avatar_url || "",
        sport: Array.isArray(r.sport) ? r.sport : [],
        tierOrPlatform: r.tier_or_platform || "",
        deliverableScope: r.deliverable_scope || "",
        agreedFee: Number(r.agreed_fee) || 0,
        targetViews: Number(r.target_views) || 0,
        actualViews: Number(r.actual_views) || 0,
        targetReach: Number(r.target_reach) || 0,
        actualReach: Number(r.actual_reach) || 0,
        actualER: Number(r.actual_er) || 0,
        proofUrl: r.proof_url || "",
        status: r.status || "Confirmed",
        ratingScore: Number(r.rating_score) || 5.0,
        attitudeScore: Number(r.attitude_score) || 5.0,
        deadlineStatus: r.deadline_status || "Đúng hạn",
        pmNotes: r.pm_notes || "",
        evaluator: r.evaluator || "PM",
        updatedAt: r.updated_at || r.created_at,
      }));
    }
  } catch {
    // If Supabase table does not exist or connection fails, use in-memory store
  }

  if (projectId) {
    return memoryParticipants.filter(
      (p) => p.projectId === projectId || p.projectId.toLowerCase() === projectId.toLowerCase()
    );
  }
  return memoryParticipants;
}

/**
 * Add a new participant (KOL or Community) to a project
 */
export async function addParticipantToProject(
  payload: Partial<ProjectParticipant>
): Promise<ProjectParticipant> {
  const newParticipant: ProjectParticipant = {
    id: payload.id || `part-${Date.now()}`,
    projectId: payload.projectId!,
    entityType: payload.entityType || "kol",
    kolId: payload.kolId,
    communityId: payload.communityId,
    entityName: payload.entityName || "Unnamed Participant",
    avatarUrl: payload.avatarUrl || "",
    sport: payload.sport || [],
    tierOrPlatform: payload.tierOrPlatform || "",
    deliverableScope: payload.deliverableScope || "Campaign Deliverable",
    agreedFee: Number(payload.agreedFee) || 0,
    targetViews: Number(payload.targetViews) || 0,
    actualViews: Number(payload.actualViews) || 0,
    targetReach: Number(payload.targetReach) || 0,
    actualReach: Number(payload.actualReach) || 0,
    actualER: Number(payload.actualER) || 0,
    proofUrl: payload.proofUrl || "",
    status: payload.status || "Confirmed",
    ratingScore: Number(payload.ratingScore) || 5.0,
    attitudeScore: Number(payload.attitudeScore) || 5.0,
    deadlineStatus: payload.deadlineStatus || "Đúng hạn",
    pmNotes: payload.pmNotes || "",
    evaluator: payload.evaluator || "PM",
    updatedAt: new Date().toISOString(),
  };

  // Try Supabase first
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("project_participants")
      .insert({
        project_id: newParticipant.projectId,
        entity_type: newParticipant.entityType,
        kol_id: newParticipant.kolId || null,
        community_id: newParticipant.communityId || null,
        entity_name: newParticipant.entityName,
        avatar_url: newParticipant.avatarUrl,
        sport: newParticipant.sport,
        tier_or_platform: newParticipant.tierOrPlatform,
        deliverable_scope: newParticipant.deliverableScope,
        agreed_fee: newParticipant.agreedFee,
        target_views: newParticipant.targetViews,
        actual_views: newParticipant.actualViews,
        target_reach: newParticipant.targetReach,
        actual_reach: newParticipant.actualReach,
        actual_er: newParticipant.actualER,
        proof_url: newParticipant.proofUrl,
        status: newParticipant.status,
        rating_score: newParticipant.ratingScore,
        attitude_score: newParticipant.attitudeScore,
        deadline_status: newParticipant.deadlineStatus,
        pm_notes: newParticipant.pmNotes,
        evaluator: newParticipant.evaluator,
      })
      .select()
      .single();

    if (!error && data) {
      newParticipant.id = data.id;
    }
  } catch {
    // Graceful fallback to memory store
  }

  // Prepend to memory store
  memoryParticipants = [newParticipant, ...memoryParticipants];
  return newParticipant;
}

/**
 * Log actual deliverable performance
 */
export async function logParticipantPerformance(
  participantId: string,
  performance: {
    actualViews?: number;
    actualReach?: number;
    actualER?: number;
    proofUrl?: string;
    status?: "Invited" | "Confirmed" | "Delivered" | "Signed Off" | "Cancelled";
  }
): Promise<ProjectParticipant | null> {
  let found = memoryParticipants.find((p) => p.id === participantId);
  if (found) {
    if (performance.actualViews !== undefined) found.actualViews = performance.actualViews;
    if (performance.actualReach !== undefined) found.actualReach = performance.actualReach;
    if (performance.actualER !== undefined) found.actualER = performance.actualER;
    if (performance.proofUrl !== undefined) found.proofUrl = performance.proofUrl;
    if (performance.status !== undefined) found.status = performance.status;
    found.updatedAt = new Date().toISOString();
  }

  try {
    const supabase = createAdminClient();
    await supabase
      .from("project_participants")
      .update({
        actual_views: performance.actualViews,
        actual_reach: performance.actualReach,
        actual_er: performance.actualER,
        proof_url: performance.proofUrl,
        status: performance.status,
      })
      .eq("id", participantId);
  } catch {
    // Ignore DB error, memory updated
  }

  return found || null;
}

/**
 * Submit PM evaluation scorecard for a participant
 */
export async function evaluateParticipant(
  participantId: string,
  evaluation: {
    score: number;
    attitude: number;
    deadlineStatus: string;
    pmNotes: string;
    evaluator: string;
    projectName?: string;
  }
): Promise<ProjectParticipant | null> {
  let found = memoryParticipants.find((p) => p.id === participantId);
  if (found) {
    found.ratingScore = evaluation.score;
    found.attitudeScore = evaluation.attitude;
    found.deadlineStatus = evaluation.deadlineStatus;
    found.pmNotes = evaluation.pmNotes;
    found.evaluator = evaluation.evaluator;
    found.status = "Signed Off";
    found.updatedAt = new Date().toISOString();
  }

  try {
    const supabase = createAdminClient();
    await supabase
      .from("project_participants")
      .update({
        rating_score: evaluation.score,
        attitude_score: evaluation.attitude,
        deadline_status: evaluation.deadlineStatus,
        pm_notes: evaluation.pmNotes,
        evaluator: evaluation.evaluator,
        status: "Signed Off",
      })
      .eq("id", participantId);

    // Also sync to kol_reports for unified audit trail
    if (found) {
      await supabase.from("kol_reports").insert({
        kol_id: found.kolId || null,
        project_id: found.projectId,
        kol_name: found.entityName,
        project_name: evaluation.projectName || "Sports Campaign",
        title: `Evaluation: ${found.entityName}`,
        score: Math.round(evaluation.score),
        attitude: Math.round(evaluation.attitude),
        deadline: evaluation.deadlineStatus,
        kpi_commit: found.targetViews || found.targetReach || 10000,
        kpi_actual: found.actualViews || found.actualReach || 10000,
        kpi_rate:
          found.targetViews && found.targetViews > 0
            ? Number(((found.actualViews! / found.targetViews) * 100).toFixed(1))
            : 100,
        notes: evaluation.pmNotes,
        evaluator: evaluation.evaluator,
      });
    }
  } catch {
    // Ignore DB error
  }

  return found || null;
}

/**
 * Delete a participant from a project
 */
export async function deleteProjectParticipant(participantId: string): Promise<boolean> {
  memoryParticipants = memoryParticipants.filter((p) => p.id !== participantId);
  try {
    const supabase = createAdminClient();
    await supabase.from("project_participants").delete().eq("id", participantId);
  } catch {
    // Ignore
  }
  return true;
}

// ─── PROJECT SESSION MUTATIONS OVERRIDES ───
const deletedProjectIds = new Set<string>();
const projectOverrides = new Map<string, Record<string, any>>();

export function markProjectDeleted(id: string) {
  deletedProjectIds.add(id);
}

export function updateProjectOverride(id: string, updates: Record<string, any>) {
  const current = projectOverrides.get(id) || {};
  projectOverrides.set(id, { ...current, ...updates });
}

export function filterAndApplyProjectOverrides<T extends { id: string; name?: string }>(projects: T[]): T[] {
  return projects
    .filter((p) => !deletedProjectIds.has(p.id))
    .map((p) => {
      const override = projectOverrides.get(p.id);
      if (!override) return p;
      return {
        ...p,
        ...override,
      };
    });
}

