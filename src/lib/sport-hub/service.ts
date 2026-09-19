import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchProjectParticipants,
  DEFAULT_PROJECT_BRANDS,
  DEFAULT_PROJECT_METADATA,
  inferSportFromName,
  inferRegionFromName,
  addParticipantToProject,
  logParticipantPerformance,
  evaluateParticipant,
  deleteProjectParticipant,
  filterAndApplyProjectOverrides,
  updateProjectOverride,
  markProjectDeleted,
  relinkParticipantsForMergedEntity,
} from "./project-participants-store";
import type { ProjectParticipant, ProjectBrand, KOLChannel, CommunityChannel } from "@/components/sport-hub/types";
import { getKolAggregates, getCommunityAggregates } from "./kol-channels";
import {
  getStoredEntityChannels,
  saveStoredEntityChannels,
  deleteStoredEntityChannels,
} from "./channel-store";

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
  channels?: KOLChannel[];
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
  channels?: CommunityChannel[];
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
  sport?: string[];
  region?: string;
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

  // Map KOLs with Multi-Channel Data and Cross-Platform Aggregation
  const kols: KOLItem[] = rawKols.map((r: any) => {
    const baseKol: KOLItem = {
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
      channels:
        getStoredEntityChannels("kol", r.id, r.name) ||
        (r.channels && Array.isArray(r.channels) && r.channels.length > 0 ? r.channels : undefined),
      userLockedFields: Array.isArray(r.user_locked_fields) ? r.user_locked_fields : [],
      pendingScoutDiff: r.pending_scout_diff || null,
      lastScoutedAt: r.last_scouted_at || undefined,
    };

    const aggregates = getKolAggregates(baseKol as any);

    return {
      ...baseKol,
      platform: aggregates.hasMultipleChannels ? "Omni-channel" : baseKol.platform,
      followers: aggregates.totalFollowers,
      avgViews: aggregates.totalAvgViews,
      er: aggregates.blendedEr,
      channels: aggregates.channels,
    };
  });

  // Map Communities with Multi-Channel Data and Aggregation
  const communities: CommunityItem[] = rawComm.map((r: any) => {
    const storedChannels = getStoredEntityChannels("community", r.id, r.name);
    const baseComm: CommunityItem = {
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
      channels:
        storedChannels ||
        (r.channels && Array.isArray(r.channels) && r.channels.length > 0 ? r.channels : undefined),
    };

    const aggregates = getCommunityAggregates(baseComm as any);

    return {
      ...baseComm,
      platform: aggregates.hasMultipleChannels ? "Multi-channel" : baseComm.platform,
      members: aggregates.totalMembers,
      channels: aggregates.channels,
    };
  });

  // Map Projects with multi-brand and participant roster
  const projects: ProjectItem[] = rawProj.map((r: any) => {
    const matchedPreset =
      DEFAULT_PROJECT_BRANDS[r.id] ||
      (r.name?.includes("Pickleball") ? DEFAULT_PROJECT_BRANDS["c3a08ca8-0823-4302-a28f-b6c49468f30f"] : undefined) ||
      (r.name?.includes("Marathon") || r.name?.includes("Giày Chạy") ? DEFAULT_PROJECT_BRANDS["recvvzfpeuGL65"] : undefined) ||
      (r.name?.includes("Doanh Nhân Trẻ") ? DEFAULT_PROJECT_BRANDS["recvvzfpwR4PfU"] : undefined);

    const matchedMeta =
      DEFAULT_PROJECT_METADATA[r.id] ||
      (r.name?.includes("Pickleball") ? DEFAULT_PROJECT_METADATA["c3a08ca8-0823-4302-a28f-b6c49468f30f"] : undefined) ||
      (r.name?.includes("Marathon") || r.name?.includes("Giày Chạy") ? DEFAULT_PROJECT_METADATA["recvvzfpeuGL65"] : undefined) ||
      (r.name?.includes("Doanh Nhân Trẻ") ? DEFAULT_PROJECT_METADATA["recvvzfpwR4PfU"] : undefined);

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

    const sport =
      Array.isArray(r.sports) && r.sports.length > 0
        ? r.sports
        : Array.isArray(r.sport) && r.sport.length > 0
        ? r.sport
        : matchedMeta?.sport || inferSportFromName(r.name);

    const region = r.region || r.geography || matchedMeta?.region || inferRegionFromName(r.name) || "Toàn quốc";

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
      sport,
      region,
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

  if (Array.isArray((data as any).channels)) {
    await saveStoredEntityChannels("kol", id, (data as any).channels, data.name);
  }

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
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getKolMetricHistory(kolId: string) {
  if (!kolId) return [];

  const supabase = createAdminClient();
  let targetId = kolId;

  if (!UUID_REGEX.test(targetId)) {
    // If kolId is a Lark record ID or name, try to resolve to actual Supabase UUID
    const { data: matched } = await supabase
      .from("kols")
      .select("id")
      .or(`name.ilike.%${kolId}%,profile_url.ilike.%${kolId}%`)
      .limit(1)
      .maybeSingle();

    if (matched && UUID_REGEX.test(matched.id)) {
      targetId = matched.id;
    } else {
      return [];
    }
  }

  const { data, error } = await supabase
    .from("kol_metric_snapshots")
    .select("*")
    .eq("kol_id", targetId)
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
  const insertPayload: Record<string, any> = {
    name: data.name,
    brand: data.brand || "",
    budget: data.budget || 0,
    start_date: data.startDate || null,
    end_date: data.endDate || null,
    pic: data.pic || "PM",
    objective: data.objective || "",
    status: data.status || "Planning",
    sports: data.sport || [],
    region: data.region || "Toàn quốc",
  };

  try {
    const { data: record, error } = await supabase
      .from("sport_projects")
      .insert(insertPayload)
      .select()
      .single();

    if (!error && record) return record;
  } catch {
    // Fallback if sports/region column not yet migrated in current DB
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
    if (data.sport !== undefined) payload.sports = data.sport;
    if (data.region !== undefined) payload.region = data.region;

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

export interface MergeEntitiesPayload {
  type: "kol" | "community";
  primaryId: string;
  secondaryIds: string[];
  mergedFields: {
    name?: string;
    sports?: string[];
    geography?: string;
    tier?: string;
    status?: string;
    quotation?: number;
    bio?: string;
    info?: string;
    adminContact?: string;
    pricePerPin?: number;
    privacy?: string;
  };
  consolidatedChannels: any[];
}

export async function mergeEntities(payload: MergeEntitiesPayload) {
  const supabase = createAdminClient();
  const { type, primaryId, secondaryIds, mergedFields, consolidatedChannels } = payload;

  if (!primaryId || !secondaryIds || secondaryIds.length === 0) {
    throw new Error("Primary ID and at least one secondary ID are required for merge");
  }

  const table = type === "kol" ? "kols" : "communities";
  const { data: primaryRecord, error: primaryErr } = await supabase
    .from(table)
    .select("*")
    .eq("id", primaryId)
    .single();

  if (primaryErr || !primaryRecord) {
    throw new Error(`Master ${type} record not found`);
  }

  const { data: secondaryRecords } = await supabase
    .from(table)
    .select("*")
    .in("id", secondaryIds);

  const secondaryNames = (secondaryRecords || []).map((r: any) => r.name).filter(Boolean);
  const masterName = (mergedFields.name || primaryRecord.name).trim();

  let updatePayload: Record<string, any> = {};

  if (type === "kol") {
    const totalFollowers = consolidatedChannels.reduce((sum, ch) => sum + (Number(ch.followers) || 0), 0);
    const totalAvgViews = consolidatedChannels.reduce((sum, ch) => sum + (Number(ch.avgViews) || 0), 0);
    let blendedEr = 0;
    if (totalFollowers > 0) {
      const weightedSum = consolidatedChannels.reduce(
        (sum, ch) => sum + (Number(ch.er) || 0) * (Number(ch.followers) || 0),
        0
      );
      blendedEr = +(weightedSum / totalFollowers).toFixed(1);
    }

    const primaryChannel = consolidatedChannels.find((ch) => ch.isPrimary) || consolidatedChannels[0];

    updatePayload = {
      name: masterName,
      sports: mergedFields.sports !== undefined ? mergedFields.sports : primaryRecord.sports,
      geography: mergedFields.geography || primaryRecord.geography,
      tier: mergedFields.tier || primaryRecord.tier,
      status: mergedFields.status || primaryRecord.status,
      quotation: mergedFields.quotation !== undefined ? mergedFields.quotation : primaryRecord.quotation,
      contact_info: mergedFields.info !== undefined ? mergedFields.info : primaryRecord.contact_info,
      bio: mergedFields.bio !== undefined ? mergedFields.bio : primaryRecord.bio,
      platform: consolidatedChannels.length > 1 ? "Omni-channel" : primaryChannel?.platform || primaryRecord.platform,
      followers: totalFollowers > 0 ? totalFollowers : primaryRecord.followers,
      avg_views: totalAvgViews > 0 ? totalAvgViews : primaryRecord.avg_views,
      er: blendedEr > 0 ? blendedEr : primaryRecord.er,
      profile_url: primaryChannel?.url || primaryRecord.profile_url,
      updated_at: new Date().toISOString(),
    };
  } else {
    // Community
    const totalMembers = consolidatedChannels.reduce((sum, ch) => sum + (Number(ch.members) || 0), 0);
    const primaryChannel = consolidatedChannels.find((ch) => ch.isPrimary) || consolidatedChannels[0];

    updatePayload = {
      name: masterName,
      sports: mergedFields.sports !== undefined ? mergedFields.sports : primaryRecord.sports,
      geography: mergedFields.geography || primaryRecord.geography,
      status: mergedFields.status || primaryRecord.status,
      admin_contact: mergedFields.adminContact !== undefined ? mergedFields.adminContact : primaryRecord.admin_contact,
      price_per_pin: mergedFields.pricePerPin !== undefined ? mergedFields.pricePerPin : primaryRecord.price_per_pin,
      privacy: mergedFields.privacy || primaryRecord.privacy,
      platform: consolidatedChannels.length > 1 ? "Multi-channel" : primaryChannel?.platform || primaryRecord.platform,
      members_count: totalMembers > 0 ? totalMembers : primaryRecord.members_count,
      group_url: primaryChannel?.url || primaryRecord.group_url,
      updated_at: new Date().toISOString(),
    };
  }

  // Update master record in Supabase
  const { data: updatedMaster, error: updateErr } = await supabase
    .from(table)
    .update(updatePayload)
    .eq("id", primaryId)
    .select()
    .single();

  if (updateErr) throw updateErr;

  // Persist consolidated channels to the dedicated channel store
  await saveStoredEntityChannels(type, primaryId, consolidatedChannels, masterName);

  // Re-link foreign references
  if (type === "kol") {
    try {
      for (const secName of secondaryNames) {
        await supabase
          .from("scouted_posts")
          .update({ author: masterName, kol_id: primaryId })
          .ilike("author", secName);
      }
      await supabase
        .from("scouted_posts")
        .update({ kol_id: primaryId, author: masterName })
        .in("kol_id", secondaryIds);
    } catch (e) {
      console.warn("Notice: Re-linking scouted_posts:", e);
    }

    try {
      for (const secName of secondaryNames) {
        await supabase
          .from("kol_reports")
          .update({ kol_name: masterName, kol_id: primaryId })
          .ilike("kol_name", secName);
      }
      await supabase
        .from("kol_reports")
        .update({ kol_id: primaryId, kol_name: masterName })
        .in("kol_id", secondaryIds);
    } catch (e) {
      console.warn("Notice: Re-linking kol_reports:", e);
    }
  }

  // Re-link project participants
  relinkParticipantsForMergedEntity(type, primaryId, masterName, secondaryIds);

  // Delete secondary duplicates
  for (const secId of secondaryIds) {
    await supabase.from(table).delete().eq("id", secId);
    await deleteStoredEntityChannels(type, secId);
  }

  // Log audit trail
  try {
    await supabase.from("audit_log").insert({
      action: "entity_merge",
      entity: type,
      entity_id: primaryId,
      detail: {
        masterId: primaryId,
        masterName,
        secondaryIds,
        secondaryNames,
        channelsConsolidated: consolidatedChannels.length,
      },
    });
  } catch {
    // Non-blocking
  }

  return {
    success: true,
    message: `Successfully merged profiles into ${masterName}!`,
    master: updatedMaster,
  };
}

