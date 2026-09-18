import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchProjectParticipants,
  DEFAULT_PROJECT_BRANDS,
  addParticipantToProject,
  logParticipantPerformance,
  evaluateParticipant,
  deleteProjectParticipant,
  filterAndApplyProjectOverrides,
  updateProjectOverride,
  markProjectDeleted,
} from "./project-participants-store";
import type { ProjectParticipant, ProjectBrand } from "@/components/sport-hub/types";

export interface SportHubKPIs {
  totalKols: number;
  totalReach: number;
  avgScore: number;
  totalCommunities: number;
  totalCommunityMembers: number;
  totalPosts: number;
}

export interface KOLItem {
  id: string;
  name: string;
  sport: string[];
  tier: string;
  platform: string;
  geography: string;
  followers: number;
  avgViews: number;
  er: number;
  quotation: number;
  status: string;
  info: string;
  profileUrl: string;
  avatarUrl?: string;
  bio?: string;
  userLockedFields?: string[];
  pendingScoutDiff?: {
    scoutedAt: string;
    changes: Record<string, { current: any; scouted: any }>;
  } | null;
  lastScoutedAt?: string;
}

export interface CommunityItem {
  id: string;
  name: string;
  sport: string[];
  geography: string;
  members: number;
  platform: string;
  groupUrl: string;
  activityLevel: string;
  adminContact: string;
  pricePerPin: number;
  status: string;
  privacy?: string;
  purpose?: string[];
}

export interface ProjectItem {
  id: string;
  name: string;
  brand: string;
  brands: string[];
  brandDetails?: ProjectBrand[];
  budget: number;
  allocatedBudget?: number;
  startDate?: string;
  endDate?: string;
  pic: string;
  objective: string;
  status: string;
  participants?: ProjectParticipant[];
}

export interface ReportItem {
  id: string;
  title: string;
  kolName: string;
  kolRecordId?: string;
  projectName: string;
  projectRecordId?: string;
  score: number;
  attitude: number;
  deadline: string;
  kpiCommit: number;
  kpiActual: number;
  kpiRate: number;
  notes: string;
  evaluator: string;
  createdAt: string;
}

export interface PostItem {
  id: string;
  title: string;
  author: string;
  kolRecordIds: string[];
  platform: string;
  likes: number;
  comments: number;
  views: number;
  er: number;
  postUrl: string;
  thumbnailUrl?: string;
  sport?: string;
  viralTier?: string;
  hashtags?: string;
  notes?: string;
}

export interface SportHubDashboardData {
  kpis: SportHubKPIs;
  kols: KOLItem[];
  communities: CommunityItem[];
  projects: ProjectItem[];
  reports: ReportItem[];
  posts: PostItem[];
}

/**
 * Fetch and aggregate entire Sport KOL & Community Dashboard data from Supabase PostgreSQL
 */
export async function getSportHubDashboardData(): Promise<SportHubDashboardData> {
  const supabase = createAdminClient();

  // Run parallel queries across all tables
  const [kolsRes, commRes, projRes, repRes, postRes, allParticipants] = await Promise.all([
    supabase.from("kols").select("*").order("followers", { ascending: false }),
    supabase.from("communities").select("*").order("members_count", { ascending: false }),
    supabase.from("sport_projects").select("*").order("created_at", { ascending: false }),
    supabase.from("kol_reports").select("*").order("created_at", { ascending: false }),
    supabase.from("scouted_posts").select("*").order("views", { ascending: false }),
    fetchProjectParticipants().catch(() => []),
  ]);

  if (kolsRes.error) console.error("Error fetching kols:", kolsRes.error);
  if (commRes.error) console.error("Error fetching communities:", commRes.error);
  if (projRes.error) console.error("Error fetching projects:", projRes.error);
  if (repRes.error) console.error("Error fetching reports:", repRes.error);
  if (postRes.error) console.error("Error fetching scouted_posts:", postRes.error);

  const rawKols = kolsRes.data || [];
  const rawComm = commRes.data || [];
  const rawProj = projRes.data || [];
  const rawRep = repRes.data || [];
  const rawPost = postRes.data || [];

  // Map KOLs
  const kols: KOLItem[] = rawKols.map((r: any) => ({
    id: r.id,
    name: r.name || "",
    sport: Array.isArray(r.sports) ? r.sports : [],
    tier: r.tier || "Micro (10k - 50k)",
    platform: r.platform || "Facebook",
    geography: r.geography || "Toàn quốc",
    followers: Number(r.followers) || 0,
    avgViews: Number(r.avg_views) || 0,
    er: Number(r.er) || 0,
    quotation: Number(r.quotation) || 0,
    status: r.status || "Đang hợp tác tích cực",
    info: r.contact_info || "",
    bio: r.bio || "",
    profileUrl: r.profile_url || "#",
    avatarUrl: r.avatar_url || "",
    userLockedFields: Array.isArray(r.user_locked_fields) ? r.user_locked_fields : [],
    pendingScoutDiff: r.pending_scout_diff || null,
    lastScoutedAt: r.last_scouted_at || undefined,
  }));

  // Map Communities
  const communities: CommunityItem[] = rawComm.map((r: any) => ({
    id: r.id,
    name: r.name || "",
    sport: Array.isArray(r.sports) ? r.sports : [],
    geography: r.geography || "Toàn quốc",
    members: Number(r.members_count) || 0,
    platform: r.platform || "Facebook Group",
    groupUrl: r.group_url || "#",
    activityLevel: r.activity_level || "Rất sôi động (> 20 bài/ngày)",
    adminContact: r.admin_contact || "",
    pricePerPin: Number(r.price_per_pin) || 0,
    status: r.status || "Đang hợp tác tích cực",
    privacy: r.privacy || "Công khai (Public)",
    purpose: Array.isArray(r.purposes) ? r.purposes : [],
  }));

  // Map Projects with multi-brand and participant roster
  const projects: ProjectItem[] = rawProj.map((r: any) => {
    const matchedPreset =
      DEFAULT_PROJECT_BRANDS[r.id] ||
      (r.name?.includes("Pickleball") ? DEFAULT_PROJECT_BRANDS["c3a08ca8-0823-4302-a28f-b6c49468f30f"] : undefined) ||
      (r.name?.includes("Marathon") || r.name?.includes("Giày Chạy") ? DEFAULT_PROJECT_BRANDS["recvvzfpeuGL65"] : undefined) ||
      (r.name?.includes("Doanh Nhân Trẻ") ? DEFAULT_PROJECT_BRANDS["recvvzfpwR4PfU"] : undefined);

    let brands: string[] = [];
    if (Array.isArray(r.brands) && r.brands.length > 0) {
      brands = r.brands;
    } else if (matchedPreset?.brands && matchedPreset.brands.length > 0) {
      brands = matchedPreset.brands;
    } else if (r.brand) {
      brands = r.brand.split(",").map((s: string) => s.trim()).filter(Boolean);
    } else {
      brands = ["Sport Booking Hub"];
    }

    const brandDetails = r.brand_details || matchedPreset?.brandDetails || [];

    // Match participants by ID or project name context
    const matchedParticipants = allParticipants.filter((p) => {
      if (p.projectId === r.id) return true;
      if (r.name?.includes("Pickleball Mùa Hè") && (p.projectId === "c3a08ca8-0823-4302-a28f-b6c49468f30f" || p.projectId === "recvvsOelZ0xR2")) return true;
      if ((r.name?.includes("Đại Sứ Giày Chạy") || r.name?.includes("Marathon")) && p.projectId === "recvvzfpeuGL65") return true;
      if (r.name?.includes("Doanh Nhân Trẻ") && p.projectId === "recvvzfpwR4PfU") return true;
      return false;
    });

    const allocatedBudget = matchedParticipants.reduce((sum, p) => sum + (p.agreedFee || 0), 0);

    return {
      id: r.id,
      name: r.name || "",
      brand: brands[0] || r.brand || "Sport Booking Hub",
      brands,
      brandDetails,
      budget: Number(r.budget) || 0,
      allocatedBudget,
      startDate: r.start_date || undefined,
      endDate: r.end_date || undefined,
      pic: r.pic || "PM",
      objective: r.objective || "",
      status: r.status || "Planning",
      participants: matchedParticipants,
    };
  });

  // Map Reports
  const reports: ReportItem[] = rawRep.map((r: any) => ({
    id: r.id,
    title: r.title || "",
    kolName: r.kol_name || "",

    kolRecordId: r.kol_id || undefined,
    projectName: r.project_name || "",
    projectRecordId: r.project_id || undefined,
    score: Number(r.score) || 5,
    attitude: Number(r.attitude) || 5,
    deadline: r.deadline || "Đúng hạn",
    kpiCommit: Number(r.kpi_commit) || 0,
    kpiActual: Number(r.kpi_actual) || 0,
    kpiRate: Number(r.kpi_rate) || 100,
    notes: r.notes || "",
    evaluator: r.evaluator || "PM",
    createdAt: r.created_at || new Date().toISOString(),
  }));

  // Map Scouted Posts
  const posts: PostItem[] = rawPost.map((r: any) => ({
    id: r.id,
    title: r.title || "",
    author: r.author || "",
    kolRecordIds: r.kol_id ? [r.kol_id] : [],
    platform: r.platform || "Instagram",
    likes: Number(r.likes) || 0,
    comments: Number(r.comments) || 0,
    views: Number(r.views) || 0,
    er: Number(r.er) || 0,
    postUrl: r.post_url || "#",
    thumbnailUrl: r.thumbnail_url || undefined,
    sport: r.sport || undefined,
    viralTier: r.viral_tier || "Tiêu chuẩn",
    hashtags: r.hashtags || undefined,
    notes: r.notes || undefined,
  }));

  // Aggregate KPIs
  const totalKols = kols.length;
  const totalReach = kols.reduce((sum, k) => sum + (k.followers || 0), 0);
  const totalCommunities = communities.length;
  const totalCommunityMembers = communities.reduce((sum, c) => sum + (c.members || 0), 0);
  const totalPosts = posts.length;

  let avgScore = 5.0;
  if (reports.length > 0) {
    const sumScore = reports.reduce((acc, r) => acc + (r.score || 5), 0);
    avgScore = Number((sumScore / reports.length).toFixed(1));
  }

  return {
    kpis: {
      totalKols,
      totalReach,
      avgScore,
      totalCommunities,
      totalCommunityMembers,
      totalPosts,
    },
    kols,
    communities,
    projects: filterAndApplyProjectOverrides(projects),
    reports,
    posts,
  };
}

// ---------------------------------------------------------------------------
// CRUD Handlers for Sport Hub
// ---------------------------------------------------------------------------

export async function createKOL(data: Partial<KOLItem>) {
  const supabase = createAdminClient();
  const { data: record, error } = await supabase
    .from("kols")
    .insert({
      name: data.name,
      sports: data.sport || [],
      tier: data.tier || "Micro (10k - 50k)",
      platform: data.platform || "Facebook",
      geography: data.geography || "Toàn quốc",
      followers: data.followers || 0,
      avg_views: data.avgViews || 0,
      er: data.er || 0,
      quotation: data.quotation || 0,
      status: data.status || "Đang hợp tác tích cực",
      contact_info: data.info || "",
      bio: (data as any).bio || "",
      profile_url: data.profileUrl || "",
    })
    .select()
    .single();

  if (error) throw error;
  return record;
}

export async function updateKOL(id: string, data: Partial<KOLItem>) {
  const supabase = createAdminClient();

  // Retrieve current locked fields
  const { data: existingKol } = await supabase
    .from("kols")
    .select("user_locked_fields")
    .eq("id", id)
    .single();

  const lockedSet = new Set<string>(existingKol?.user_locked_fields || []);

  const updatePayload: Record<string, any> = {};
  if (data.name !== undefined) {
    updatePayload.name = data.name;
    lockedSet.add("name");
  }
  if (data.sport !== undefined) {
    updatePayload.sports = data.sport;
    lockedSet.add("sports");
  }
  if (data.tier !== undefined) {
    updatePayload.tier = data.tier;
    lockedSet.add("tier");
  }
  if (data.platform !== undefined) {
    updatePayload.platform = data.platform;
    lockedSet.add("platform");
  }
  if (data.geography !== undefined) {
    updatePayload.geography = data.geography;
    lockedSet.add("geography");
  }
  if (data.followers !== undefined) {
    updatePayload.followers = data.followers;
  }
  if (data.avgViews !== undefined) {
    updatePayload.avg_views = data.avgViews;
  }
  if (data.er !== undefined) {
    updatePayload.er = data.er;
  }
  if (data.quotation !== undefined) {
    updatePayload.quotation = data.quotation;
    lockedSet.add("quotation");
  }
  if (data.status !== undefined) {
    updatePayload.status = data.status;
    lockedSet.add("status");
  }
  if (data.info !== undefined) {
    updatePayload.contact_info = data.info;
    lockedSet.add("contact_info");
  }
  if ((data as any).bio !== undefined) {
    updatePayload.bio = (data as any).bio;
    lockedSet.add("bio");
  }
  if (data.profileUrl !== undefined) {
    updatePayload.profile_url = data.profileUrl;
    lockedSet.add("profile_url");
  }
  if (data.avatarUrl !== undefined) {
    updatePayload.avatar_url = data.avatarUrl;
    lockedSet.add("avatar_url");
  }

  // Update locked fields array
  updatePayload.user_locked_fields = Array.from(lockedSet);

  const { data: record, error } = await supabase
    .from("kols")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return record;
}

/**
 * Resolve scout differences: either apply selected fields or dismiss pending diff
 */
export async function resolveScoutDiff(
  kolId: string,
  acceptedFields: string[] = [],
  dismiss: boolean = false
) {
  const supabase = createAdminClient();

  const { data: kol, error: fetchErr } = await supabase
    .from("kols")
    .select("pending_scout_diff, user_locked_fields")
    .eq("id", kolId)
    .single();

  if (fetchErr || !kol) throw new Error("KOL not found");

  if (dismiss || acceptedFields.length === 0) {
    // Clear the pending diff
    const { data: updated, error } = await supabase
      .from("kols")
      .update({ pending_scout_diff: null })
      .eq("id", kolId)
      .select()
      .single();

    if (error) throw error;
    return updated;
  }

  const diffChanges = kol.pending_scout_diff?.changes || {};
  const updatePayload: Record<string, any> = {
    pending_scout_diff: null,
  };

  for (const field of acceptedFields) {
    if (diffChanges[field]) {
      const val = diffChanges[field].scouted;
      if (field === "sports") updatePayload.sports = val;
      else if (field === "bio") updatePayload.bio = val;
      else if (field === "avatar_url") updatePayload.avatar_url = val;
      else if (field === "profile_url") updatePayload.profile_url = val;
      else updatePayload[field] = val;
    }
  }

  const { data: updated, error } = await supabase
    .from("kols")
    .update(updatePayload)
    .eq("id", kolId)
    .select()
    .single();

  if (error) throw error;
  return updated;
}

/**
 * Record a point-in-time metric snapshot for growth tracking
 */
export async function recordMetricSnapshot(
  kolId: string,
  metrics: { followers: number; avgViews: number; er: number }
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("kol_metric_snapshots")
    .insert({
      kol_id: kolId,
      followers: metrics.followers || 0,
      avg_views: metrics.avgViews || 0,
      er: metrics.er || 0,
      recorded_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("Error inserting metric snapshot:", error);
  }
  return data;
}

/**
 * Get historical metric snapshots for a specific KOL
 */
export async function getKolMetricHistory(kolId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("kol_metric_snapshots")
    .select("*")
    .eq("kol_id", kolId)
    .order("recorded_at", { ascending: true });

  if (error) {
    console.error("Error fetching metric history:", error);
    return [];
  }
  return data || [];
}

export async function deleteKOL(id: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("kols").delete().eq("id", id);
  if (error) throw error;
  return true;
}

export async function createCommunity(data: Partial<CommunityItem>) {
  const supabase = createAdminClient();
  const { data: record, error } = await supabase
    .from("communities")
    .insert({
      name: data.name,
      sports: data.sport || [],
      geography: data.geography || "Toàn quốc",
      members_count: data.members || 0,
      platform: data.platform || "Facebook Group",
      group_url: data.groupUrl || "",
      activity_level: data.activityLevel || "Rất sôi động (> 20 bài/ngày)",
      privacy: data.privacy || "Công khai (Public)",
      purposes: data.purpose || [],
      admin_contact: data.adminContact || "",
      price_per_pin: data.pricePerPin || 0,
      status: data.status || "Đang hợp tác tích cực",
    })
    .select()
    .single();

  if (error) throw error;
  return record;
}

export async function createProject(data: Partial<ProjectItem>) {
  const supabase = createAdminClient();
  const { data: record, error } = await supabase
    .from("sport_projects")
    .insert({
      name: data.name,
      brand: data.brand || "",
      budget: data.budget || 0,
      start_date: data.startDate || null,
      end_date: data.endDate || null,
      pic: data.pic || "PM",
      objective: data.objective || "",
      status: data.status || "Planning",
    })
    .select()
    .single();

  if (error) throw error;
  return record;
}

export async function updateProject(id: string, data: Partial<ProjectItem>) {
  // Always update in-memory session override
  updateProjectOverride(id, data);

  try {
    const supabase = createAdminClient();
    const payload: Record<string, any> = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.brand !== undefined) payload.brand = data.brand;
    if (data.brands !== undefined) payload.brands = data.brands;
    if (data.budget !== undefined) payload.budget = Number(data.budget) || 0;
    if (data.startDate !== undefined) payload.start_date = data.startDate;
    if (data.endDate !== undefined) payload.end_date = data.endDate;
    if (data.pic !== undefined) payload.pic = data.pic;
    if (data.objective !== undefined) payload.objective = data.objective;
    if (data.status !== undefined) payload.status = data.status;

    const { data: record, error } = await supabase
      .from("sport_projects")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (!error && record) return record;
  } catch (err) {
    console.warn("Supabase updateProject error, stored in-memory override:", err);
  }

  return { id, ...data };
}

export async function deleteProject(id: string) {
  markProjectDeleted(id);

  try {
    const supabase = createAdminClient();
    await supabase.from("sport_projects").delete().eq("id", id);
  } catch (err) {
    console.warn("Supabase deleteProject error, marked deleted in memory:", err);
  }

  return true;
}

export async function createReport(data: any) {
  const supabase = createAdminClient();
  const { data: record, error } = await supabase
    .from("kol_reports")
    .insert({
      kol_id: data.kolRecordId || null,
      project_id: data.projectRecordId || null,
      kol_name: data.kolName,
      project_name: data.project || data.projectName,
      title: data.title || `Evaluation: ${data.kolName} - ${data.project || data.projectName}`,
      score: Number(data.score) || 5,
      attitude: Number(data.attitude) || 5,
      deadline: data.deadline || "Đúng hạn",
      kpi_commit: Number(data.kpiCommit) || 0,
      kpi_actual: Number(data.kpiActual) || 0,
      kpi_rate: Number(data.kpiRate) || 100,
      notes: data.notes || "",
      evaluator: data.evaluator || "PM",
    })
    .select()
    .single();

  if (error) throw error;
  return record;
}

export async function createScoutRequest(data: any) {
  const supabase = createAdminClient();
  const { data: record, error } = await supabase
    .from("scout_requests")
    .insert({
      keyword: data.keyword,
      target_type: data.targetType || "KOLs cá nhân",
      platform: data.platform || "Instagram",
      target_limit: Number(data.limit) || 10,
      geography: data.geography || "Toàn quốc",
      status: "Chờ xử lý",
      results_summary: data.notes || "",
    })
    .select()
    .single();

  if (error) throw error;
  return record;
}

export async function bulkInsertKOLs(records: any[]) {
  const supabase = createAdminClient();
  const payloads = records.map((r) => ({
    name: r.name,
    sports: r.sports || r.sport || ["Pickleball"],
    tier: r.tier || "Micro (10k - 50k)",
    platform: r.platform || "Facebook",
    geography: r.geography || "Toàn quốc",
    followers: Number(r.followers) || 0,
    avg_views: Number(r.avgViews || r.avg_views) || 0,
    er: Number(r.er) || 0,
    quotation: Number(r.quotation) || 0,
    status: r.status || "Đang hợp tác tích cực",
    contact_info: r.contact || r.contact_info || "",
    bio: r.bio || "",
    profile_url: r.profileUrl || r.profile_url || "",
  }));

  const { data, error } = await supabase.from("kols").insert(payloads).select();
  if (error) throw error;
  return data;
}

export async function bulkInsertCommunities(records: any[]) {
  const supabase = createAdminClient();
  const payloads = records.map((r) => ({
    name: r.name,
    sports: r.sports || r.sport || ["Pickleball"],
    geography: r.geography || "Toàn quốc",
    members_count: Number(r.members || r.members_count) || 0,
    platform: r.platform || "Facebook Group",
    group_url: r.groupUrl || r.group_url || "",
    activity_level: r.activityLevel || r.activity_level || "Rất sôi động (> 20 bài/ngày)",
    privacy: r.privacy || "Công khai (Public)",
    purposes: r.purposes || r.purpose || [],
    admin_contact: r.adminContact || r.admin_contact || "",
    price_per_pin: Number(r.pricePerPin || r.price_per_pin) || 0,
    status: r.status || "Đang hợp tác tích cực",
  }));

  const { data, error } = await supabase.from("communities").insert(payloads).select();
  if (error) throw error;
  return data;
}

export async function createPost(data: Partial<PostItem>) {
  const supabase = createAdminClient();
  const viral =
    (data.views || 0) >= 100000
      ? "Siêu Viral (> 100k views)"
      : (data.views || 0) >= 20000
      ? "Tương tác cao (10k - 100k views)"
      : "Tiêu chuẩn";

  const { data: record, error } = await supabase
    .from("scouted_posts")
    .insert({
      kol_id: data.kolRecordIds?.[0] || null,
      title: data.title || "Untitled Viral Post",
      author: data.author || "Unknown Creator",
      platform: data.platform || "Instagram Reels",
      post_url: data.postUrl || "",
      thumbnail_url: data.thumbnailUrl || "",
      sport: data.sport || "Pickleball",
      likes: Number(data.likes) || 0,
      comments: Number(data.comments) || 0,
      views: Number(data.views) || 0,
      er: Number(data.er) || 0,
      viral_tier: data.viralTier || viral,
      hashtags: data.hashtags || "",
      notes: data.notes || "Added via URL Scout / Manual Form",
    })
    .select()
    .single();

  if (error) throw error;
  return record;
}

export {
  fetchProjectParticipants,
  addParticipantToProject,
  logParticipantPerformance,
  evaluateParticipant,
  deleteProjectParticipant,
};
