/**
 * KOL Audience Authenticity & Sponsored Content audit pipeline.
 *
 * Combines deterministic VN ad-law / branded-content heuristics with optional
 * AI NLP (via getAIProvider().completeJson) for comment authenticity, topic
 * tags, booked categories, and partner brands.
 */

import { getAIProvider } from "@/lib/ai";
import { getLarkDashboardData } from "@/lib/lark/client";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AudienceAuditResult,
  BookedCategoryItem,
  CommercialSaturation,
  PartnerBrandItem,
  PostSponsorEnrichment,
  RunAudienceAuditOptions,
  SampleComments,
  SeedingRiskLevel,
  SponsorDisclosureType,
  TagDistributionItem,
} from "./audience-audit-types";

// ---------------------------------------------------------------------------
// Disclosure / seeding heuristics (VN Ad Law + Meta/TikTok branded content)
// ---------------------------------------------------------------------------

/** Hashtags / phrases that explicitly disclose paid/sponsored content. */
export const SPONSORED_DISCLOSURE_PATTERNS: RegExp[] = [
  /#ad\b/i,
  /#ads\b/i,
  /#sponsored\b/i,
  /#sponsorship\b/i,
  /#partner\b/i,
  /#partnership\b/i,
  /#collab\b/i,
  /#collaboration\b/i,
  /#brandedcontent\b/i,
  /#paidpartnership\b/i,
  /#quangcao\b/i,
  /#quảngcáo\b/i,
  /#duoctaitro\b/i,
  /#đượctàitrợ\b/i,
  /#duoc_tai_tro\b/i,
  /#hoptac\b/i,
  /#hợptác\b/i,
  /#baitro\b/i,
  /#bàitrợ\b/i,
  /#gifted\b/i,
  /#prpackage\b/i,
  /\bpaid\s+partnership\b/i,
  /\bpaid\s+promotion\b/i,
  /\bbranded\s+content\b/i,
  /\bhợp\s*tác\s*(với|cùng)\b/i,
  /\bđược\s*tài\s*trợ\b/i,
  /\btai\s*tro\s*boi\b/i,
  /\bquảng\s*cáo\b/i,
];

/** Lightweight seeding / bot comment cues (VN + EN). */
export const SEEDING_COMMENT_PATTERNS: RegExp[] = [
  /^(nice|cool|great|awesome|amazing|love it|wow|🔥+|❤️+|❤+|👍+)\s*[!.]*$/i,
  /^(hay|đỉnh|xịn|xinh|đẹp|tuyệt|quá đã|quá đỉnh|tuyệt vời)\s*[!.]*$/i,
  /^(first|1st|đầu tiên|comment đầu)\b/i,
  /\b(follow\s*me|f4f|l4l|fl\s*back|sub\s*4\s*sub)\b/i,
  /\b(inbox|ib\s*em|nhắn\s*tin|check\s*bio|link\s*in\s*bio)\b/i,
  /\b(dm\s*for|ib\s*để|ib để)\b/i,
  /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u,
];

const TOPIC_KEYWORDS: Record<string, string[]> = {
  Sports: [
    "pickleball",
    "tennis",
    "football",
    "soccer",
    "badminton",
    "cầu lông",
    "bóng đá",
    "chạy",
    "marathon",
    "gym",
    "fitness",
    "workout",
    "match",
    "thi đấu",
    "tập luyện",
    "training",
    "padel",
    "golf",
    "cycling",
    "đạp xe",
  ],
  "Daily Topics": [
    "daily",
    "vlog",
    "ngày thường",
    "cuộc sống",
    "routine",
    "morning",
    "buổi sáng",
    "family",
    "gia đình",
  ],
  Travel: [
    "travel",
    "trip",
    "du lịch",
    "check-in",
    "checkin",
    "resort",
    "đà nẵng",
    "đà lạt",
    "phú quốc",
    "saigon",
    "hanoi",
    "sapa",
  ],
  Transportation: [
    "car",
    "xe",
    "oto",
    "ô tô",
    "moto",
    "grab",
    "drive",
    "lái xe",
    "airport",
    "sân bay",
  ],
  "Art and Entertainment": [
    "music",
    "nhạc",
    "film",
    "phim",
    "concert",
    "show",
    "art",
    "dance",
    "cover",
  ],
  Food: ["food", "ăn", "restaurant", "quán", "cafe", "cà phê", "recipe", "nấu"],
  Fashion: ["fashion", "outfit", "ootd", "thời trang", "style", "wear"],
};

const BRAND_CATEGORY_HINTS: Record<string, string> = {
  nike: "Sportswear & Footwear",
  adidas: "Sportswear & Footwear",
  puma: "Sportswear & Footwear",
  underarmour: "Sportswear & Footwear",
  "under armour": "Sportswear & Footwear",
  "li-ning": "Sportswear & Footwear",
  lining: "Sportswear & Footwear",
  anta: "Sportswear & Footwear",
  asics: "Sportswear & Footwear",
  newbalance: "Sportswear & Footwear",
  "new balance": "Sportswear & Footwear",
  garmin: "Sports Tech & Wearables",
  whoop: "Sports Tech & Wearables",
  apple: "Sports Tech & Wearables",
  coros: "Sports Tech & Wearables",
  polar: "Sports Tech & Wearables",
  suunto: "Sports Tech & Wearables",
  gatorade: "Hydration & Nutrition",
  redbull: "Hydration & Nutrition",
  "red bull": "Hydration & Nutrition",
  monster: "Hydration & Nutrition",
  ensure: "Hydration & Nutrition",
  optimum: "Hydration & Nutrition",
  jogarbola: "Sportswear & Footwear",
  kamito: "Sportswear & Footwear",
  yonex: "Sports Equipment",
  wilson: "Sports Equipment",
  babolat: "Sports Equipment",
  selkirk: "Sports Equipment",
  joola: "Sports Equipment",
  paddletek: "Sports Equipment",
  vinamilk: "FMCG & Lifestyle",
  vinfast: "Automotive & Mobility",
  grab: "Automotive & Mobility",
  shopee: "E-commerce & Retail",
  lazada: "E-commerce & Retail",
  tiki: "E-commerce & Retail",
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function detectSponsoredDisclosure(text: string): {
  isSponsored: boolean;
  disclosureType: SponsorDisclosureType;
} {
  const raw = text || "";
  for (const re of SPONSORED_DISCLOSURE_PATTERNS) {
    if (re.test(raw)) {
      if (/#ad\b|#ads\b|#sponsored|#quangcao|#quảngcáo|#duoctaitro|#đượctàitrợ/i.test(raw)) {
        return { isSponsored: true, disclosureType: "vn_ad_hashtag" };
      }
      if (/branded\s+content|#brandedcontent/i.test(raw)) {
        return { isSponsored: true, disclosureType: "branded_content_label" };
      }
      if (/paid\s+partnership|#paidpartnership/i.test(raw)) {
        return { isSponsored: true, disclosureType: "paid_partnership" };
      }
      return { isSponsored: true, disclosureType: "vn_ad_hashtag" };
    }
  }
  return { isSponsored: false, disclosureType: "none" };
}

export function classifySeedingComment(text: string): "organic" | "seeding" {
  const t = (text || "").trim();
  if (!t) return "seeding";
  if (t.length <= 2) return "seeding";
  for (const re of SEEDING_COMMENT_PATTERNS) {
    if (re.test(t)) return "seeding";
  }
  // Very short generic praise without substance
  if (t.split(/\s+/).length <= 2 && t.length < 12) return "seeding";
  return "organic";
}

export function seedingRiskLevel(seedingRate: number): SeedingRiskLevel {
  if (seedingRate >= 30) return "High";
  if (seedingRate >= 15) return "Moderate";
  return "Low";
}

export function commercialSaturationFromRate(
  sponsoredRate: number
): CommercialSaturation {
  if (sponsoredRate >= 60) return "Heavy Commercial";
  if (sponsoredRate >= 30) return "Balanced";
  return "Low Commercial";
}

export function inferTopicTags(text: string): string[] {
  const lower = (text || "").toLowerCase();
  const hits: string[] = [];
  for (const [tag, kws] of Object.entries(TOPIC_KEYWORDS)) {
    if (kws.some((kw) => lower.includes(kw))) hits.push(tag);
  }
  return hits.length > 0 ? hits : ["Daily Topics"];
}

export function inferBrandFromText(text: string): {
  brand: string;
  handle: string;
  industry: string;
} | null {
  const lower = (text || "").toLowerCase();
  // @handles first
  const handleMatch = lower.match(/@([a-z0-9._]{2,40})/i);
  for (const [brandKey, industry] of Object.entries(BRAND_CATEGORY_HINTS)) {
    if (lower.includes(brandKey)) {
      const brand = brandKey
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
        .replace(/\bLi-ning\b/i, "Li-Ning")
        .replace(/\bNewbalance\b/i, "New Balance")
        .replace(/\bUnderarmour\b/i, "Under Armour")
        .replace(/\bRedbull\b/i, "Red Bull");
      const handle =
        handleMatch && handleMatch[1].includes(brandKey.replace(/\s+/g, ""))
          ? `@${handleMatch[1]}`
          : `@${brandKey.replace(/\s+/g, "")}`;
      return { brand, handle, industry };
    }
  }
  return null;
}

export function buildTagDistribution(
  tagHits: string[],
  topN = 5
): TagDistributionItem[] {
  if (tagHits.length === 0) return [];
  const counts = new Map<string, number>();
  for (const tag of tagHits) {
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  const total = tagHits.length;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([tag, count]) => ({
      tag,
      percentage: round2((count / total) * 100),
    }));
}

function normalizeCommentsSample(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((c) => {
        if (typeof c === "string") return c.trim();
        if (c && typeof c === "object" && "text" in c) {
          return String((c as { text: unknown }).text || "").trim();
        }
        return "";
      })
      .filter(Boolean);
  }
  return [];
}

interface ScoutedPostRow {
  id: string;
  title?: string;
  hashtags?: string;
  notes?: string;
  platform?: string;
  post_url?: string;
  comments?: number;
  comments_sample?: unknown;
  is_sponsored?: boolean;
  sponsor_brand?: string;
  sponsor_category?: string;
  sponsor_disclosure_type?: string;
}

interface AiAuditPayload {
  topTagDistribution?: TagDistributionItem[];
  bookedCategories?: BookedCategoryItem[];
  partnerBrands?: PartnerBrandItem[];
  sampleComments?: SampleComments;
  commentLabels?: { text: string; label: "organic" | "seeding" }[];
  auditSummary?: string;
  postEnrichments?: {
    postId: string;
    isSponsored?: boolean;
    sponsorBrand?: string;
    sponsorCategory?: string;
    sponsorDisclosureType?: string;
  }[];
}

function emptyResult(partial?: Partial<AudienceAuditResult>): AudienceAuditResult {
  return {
    totalPostsScanned: 0,
    totalCommentsScanned: 0,
    realAudienceRate: 100,
    seedingRate: 0,
    seedingRiskLevel: "Low",
    topTagDistribution: [],
    sponsoredContentRate: 0,
    commercialSaturation: "Low Commercial",
    bookedCategories: [],
    partnerBrands: [],
    sampleComments: { organic: [], seeding: [] },
    auditSummary: "No scouted posts available for this KOL. Scout posts first, then re-run the audience audit.",
    ...partial,
  };
}

function heuristicAudit(
  posts: ScoutedPostRow[],
  kolName: string
): {
  result: AudienceAuditResult;
  enrichments: PostSponsorEnrichment[];
} {
  const enrichments: PostSponsorEnrichment[] = [];
  const tagHits: string[] = [];
  const categoryCounts = new Map<string, number>();
  const brandMap = new Map<
    string,
    { brand: string; handle: string; industry: string; postCount: number }
  >();

  let sponsoredCount = 0;
  const allComments: string[] = [];

  for (const post of posts) {
    const text = `${post.title || ""} ${post.hashtags || ""} ${post.notes || ""}`;
    const disclosure = detectSponsoredDisclosure(text);
    let isSponsored = disclosure.isSponsored;
    let brand = "";
    let category = "";
    let disclosureType: SponsorDisclosureType = disclosure.disclosureType;

    const inferred = inferBrandFromText(text);
    if (inferred) {
      brand = inferred.brand;
      category = inferred.industry;
      if (!isSponsored && /@|hợp tác|tai tro|tài trợ|partner|collab/i.test(text)) {
        isSponsored = true;
        disclosureType = "inferred_brand_mention";
      }
    }

    if (isSponsored) {
      sponsoredCount += 1;
      if (category) {
        categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
      } else {
        categoryCounts.set(
          "Uncategorized Brand Deal",
          (categoryCounts.get("Uncategorized Brand Deal") || 0) + 1
        );
      }
      if (brand) {
        const key = brand.toLowerCase();
        const prev = brandMap.get(key);
        if (prev) prev.postCount += 1;
        else {
          brandMap.set(key, {
            brand,
            handle: inferred?.handle || `@${brand.toLowerCase().replace(/\s+/g, "")}`,
            industry: category || "Other",
            postCount: 1,
          });
        }
      }
    }

    enrichments.push({
      postId: post.id,
      isSponsored,
      sponsorBrand: brand,
      sponsorCategory: category,
      sponsorDisclosureType: disclosureType,
    });

    for (const tag of inferTopicTags(text)) tagHits.push(tag);

    for (const c of normalizeCommentsSample(post.comments_sample)) {
      allComments.push(c);
    }
  }

  const organic: string[] = [];
  const seeding: string[] = [];
  for (const c of allComments) {
    if (classifySeedingComment(c) === "seeding") seeding.push(c);
    else organic.push(c);
  }

  const commentsScanned = allComments.length;
  const seedingRate =
    commentsScanned > 0 ? round2((seeding.length / commentsScanned) * 100) : 0;
  const realAudienceRate = round2(100 - seedingRate);
  const sponsoredContentRate =
    posts.length > 0 ? round2((sponsoredCount / posts.length) * 100) : 0;

  const bookedCategories: BookedCategoryItem[] = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({
      category,
      count,
      percentage: round2((count / Math.max(sponsoredCount, 1)) * 100),
    }));

  const partnerBrands: PartnerBrandItem[] = [...brandMap.values()].sort(
    (a, b) => b.postCount - a.postCount
  );

  const summaryParts = [
    `Audience audit for ${kolName}: scanned ${posts.length} posts`,
    commentsScanned > 0
      ? `and ${commentsScanned} comments`
      : "(no comment samples stored — rates estimated from available captions only)",
    `. Real organic audience ${realAudienceRate}% (seeding ${seedingRate}%, risk ${seedingRiskLevel(seedingRate)}).`,
    ` Sponsored content ${sponsoredContentRate}% → ${commercialSaturationFromRate(sponsoredContentRate)}.`,
  ];

  return {
    enrichments,
    result: {
      totalPostsScanned: posts.length,
      totalCommentsScanned: commentsScanned,
      realAudienceRate: commentsScanned > 0 ? realAudienceRate : 100,
      seedingRate: commentsScanned > 0 ? seedingRate : 0,
      seedingRiskLevel: commentsScanned > 0 ? seedingRiskLevel(seedingRate) : "Low",
      topTagDistribution: buildTagDistribution(tagHits, 5),
      sponsoredContentRate,
      commercialSaturation: commercialSaturationFromRate(sponsoredContentRate),
      bookedCategories,
      partnerBrands,
      sampleComments: {
        organic: organic.slice(0, 8),
        seeding: seeding.slice(0, 8),
      },
      auditSummary: summaryParts.join(""),
    },
  };
}

async function enrichWithAi(
  posts: ScoutedPostRow[],
  heuristic: AudienceAuditResult,
  enrichments: PostSponsorEnrichment[],
  kolName: string
): Promise<{
  result: AudienceAuditResult;
  enrichments: PostSponsorEnrichment[];
}> {
  try {
    const ai = getAIProvider();
    const compactPosts = posts.slice(0, 25).map((p) => ({
      postId: p.id,
      caption: String(p.title || "").slice(0, 280),
      hashtags: String(p.hashtags || "").slice(0, 160),
      commentsSample: normalizeCommentsSample(p.comments_sample).slice(0, 8),
    }));

    const sourceComments = compactPosts.flatMap((p) => p.commentsSample);
    const corpus = compactPosts
      .map((p) => `${p.caption}\n${p.hashtags}\n${p.commentsSample.join("\n")}`)
      .join("\n")
      .toLowerCase();
    const commentSeen = new Set(sourceComments.map((c) => c.trim().toLowerCase()));

    const prompt = `You are an influencer-marketing analyst for Vietnam sports KOLs (HypeAuditor / NoxInfluencer style).
Analyze ONLY the posts JSON below. Never invent comments, brands, handles, or sponsorships that are not written in that JSON.
1) Comment authenticity: label each provided commentsSample string organic vs seeding/bot. If commentsSample is empty, return empty comment arrays and do not estimate a seeding rate.
2) Top 5 content topic tags with percentages from the captions (English tags: Sports, Daily Topics, Travel, Transportation, Art and Entertainment, Food, Fashion).
3) Sponsored content only when a caption contains Vietnam Ad Law tags (#ad #quangcao #duoctaitro) or an explicit brand mention already in the text.
4) A short English auditSummary (2-4 sentences) that matches the evidence.

KOL name: ${kolName}
Heuristic baseline (may refine, do not invent impossible rates):
${JSON.stringify({
  sponsoredContentRate: heuristic.sponsoredContentRate,
  seedingRate: heuristic.seedingRate,
  topTagDistribution: heuristic.topTagDistribution,
  bookedCategories: heuristic.bookedCategories,
  partnerBrands: heuristic.partnerBrands,
})}

Posts JSON:
${JSON.stringify(compactPosts)}

Return ONLY JSON with this shape:
{
  "topTagDistribution": [{"tag":"Sports","percentage":47.6}],
  "bookedCategories": [{"category":"Sportswear & Footwear","percentage":40,"count":8}],
  "partnerBrands": [{"brand":"Garmin","handle":"@garmin","industry":"Sports Tech & Wearables","postCount":5}],
  "sampleComments": {"organic":["..."],"seeding":["..."]},
  "commentLabels": [{"text":"...","label":"organic"}],
  "postEnrichments": [{"postId":"...","isSponsored":true,"sponsorBrand":"Garmin","sponsorCategory":"Sports Tech & Wearables","sponsorDisclosureType":"vn_ad_hashtag"}],
  "auditSummary": "..."
}`;

    const { data } = await ai.completeJson<AiAuditPayload>(prompt);
    if (!data) return { result: heuristic, enrichments };

    const labels = Array.isArray(data.commentLabels) ? data.commentLabels : [];
    let organic = 0;
    let seeding = 0;
    const sampleOrganic: string[] = [];
    const sampleSeeding: string[] = [];
    for (const row of labels) {
      const text = String(row.text || "").trim();
      if (!text || !commentSeen.has(text.toLowerCase())) continue;
      if (row.label === "seeding") {
        seeding += 1;
        if (sampleSeeding.length < 8) sampleSeeding.push(text);
      } else {
        organic += 1;
        if (sampleOrganic.length < 8) sampleOrganic.push(text);
      }
    }

    const commentsScanned = organic + seeding;
    let realAudienceRate = heuristic.realAudienceRate;
    let seedingRate = heuristic.seedingRate;
    let risk = heuristic.seedingRiskLevel;
    if (sourceComments.length > 0 && commentsScanned > 0) {
      seedingRate = round2((seeding / commentsScanned) * 100);
      realAudienceRate = round2(100 - seedingRate);
      risk = seedingRiskLevel(seedingRate);
    }

    const mentioned = (value: string) => {
      const n = value.toLowerCase().replace(/^@/, "").trim();
      return n.length >= 2 && corpus.includes(n);
    };

    const mergedEnrichments = enrichments.map((e) => {
      const aiRow = (data.postEnrichments || []).find((x) => x.postId === e.postId);
      if (!aiRow) return e;
      const brand = String(aiRow.sponsorBrand || e.sponsorBrand || "");
      const brandOk = !brand || mentioned(brand);
      const sponsoredOk = Boolean(aiRow.isSponsored) && (e.isSponsored || brandOk);
      return {
        postId: e.postId,
        isSponsored: sponsoredOk ? Boolean(aiRow.isSponsored ?? e.isSponsored) : e.isSponsored,
        sponsorBrand: brandOk ? brand : e.sponsorBrand,
        sponsorCategory: brandOk
          ? String(aiRow.sponsorCategory || e.sponsorCategory || "")
          : e.sponsorCategory,
        sponsorDisclosureType: sponsoredOk
          ? String(aiRow.sponsorDisclosureType || e.sponsorDisclosureType || "none")
          : e.sponsorDisclosureType,
      };
    });

    const sponsoredCount = mergedEnrichments.filter((e) => e.isSponsored).length;
    const sponsoredContentRate =
      posts.length > 0 ? round2((sponsoredCount / posts.length) * 100) : 0;

    return {
      enrichments: mergedEnrichments,
      result: {
        totalPostsScanned: posts.length,
        totalCommentsScanned:
          commentsScanned > 0 ? commentsScanned : heuristic.totalCommentsScanned,
        realAudienceRate,
        seedingRate,
        seedingRiskLevel: risk,
        topTagDistribution:
          Array.isArray(data.topTagDistribution) && data.topTagDistribution.length > 0
            ? data.topTagDistribution
                .slice(0, 5)
                .map((t) => ({
                  tag: String(t.tag || "Other"),
                  percentage: round2(Number(t.percentage) || 0),
                }))
            : heuristic.topTagDistribution,
        sponsoredContentRate,
        commercialSaturation: commercialSaturationFromRate(sponsoredContentRate),
        partnerBrands: (() => {
          const fromAi =
            Array.isArray(data.partnerBrands) && data.partnerBrands.length > 0
              ? data.partnerBrands
                  .map((b) => ({
                    brand: String(b.brand || ""),
                    handle: String(b.handle || ""),
                    industry: String(b.industry || ""),
                    postCount: Number(b.postCount) || 0,
                  }))
                  .filter((b) => mentioned(b.brand) || mentioned(b.handle))
              : [];
          return fromAi.length > 0 ? fromAi : heuristic.partnerBrands;
        })(),
        bookedCategories: (() => {
          const groundedBrands = (
            Array.isArray(data.partnerBrands) ? data.partnerBrands : []
          ).some(
            (b) => mentioned(String(b.brand || "")) || mentioned(String(b.handle || ""))
          );
          if (
            groundedBrands &&
            Array.isArray(data.bookedCategories) &&
            data.bookedCategories.length > 0
          ) {
            return data.bookedCategories.map((c) => ({
              category: String(c.category || "Other"),
              percentage: round2(Number(c.percentage) || 0),
              count: Number(c.count) || 0,
            }));
          }
          return heuristic.bookedCategories;
        })(),
        sampleComments: {
          organic: sampleOrganic,
          seeding: sampleSeeding,
        },
        auditSummary: String(data.auditSummary || heuristic.auditSummary),
      },
    };
  } catch (err) {
    console.warn("[audience-audit] AI enrichment skipped:", err);
    return { result: heuristic, enrichments };
  }
}

function toCachePayload(result: AudienceAuditResult, auditedAt: string, auditId: string) {
  return {
    ...result,
    auditedAt,
    auditId,
  };
}

function rowToResult(row: any): AudienceAuditResult {
  return {
    totalPostsScanned: Number(row.total_posts_scanned) || 0,
    totalCommentsScanned: Number(row.total_comments_scanned) || 0,
    realAudienceRate: Number(row.real_audience_rate) || 0,
    seedingRate: Number(row.seeding_rate) || 0,
    seedingRiskLevel: (row.seeding_risk_level as SeedingRiskLevel) || "Low",
    topTagDistribution: Array.isArray(row.top_tag_distribution)
      ? row.top_tag_distribution
      : [],
    sponsoredContentRate: Number(row.sponsored_content_rate) || 0,
    commercialSaturation:
      (row.commercial_saturation as CommercialSaturation) || "Balanced",
    bookedCategories: Array.isArray(row.booked_categories) ? row.booked_categories : [],
    partnerBrands: Array.isArray(row.partner_brands) ? row.partner_brands : [],
    sampleComments: row.sample_comments || { organic: [], seeding: [] },
    auditSummary: row.audit_summary || "",
    auditedAt: row.audited_at || undefined,
    auditId: row.id || undefined,
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

/**
 * Lark Base record ids (e.g. recvvs…) are what the live directory renders.
 * Resolve them to captions already stored in Lark, and to a Supabase KOL when
 * the same display name exists so the audit can still be persisted.
 */
async function loadExternalSubject(kolId: string): Promise<{
  name: string;
  supabaseId: string | null;
  posts: ScoutedPostRow[];
} | null> {
  let dash: Awaited<ReturnType<typeof getLarkDashboardData>> | null = null;
  try {
    dash = await getLarkDashboardData();
  } catch (err) {
    console.warn("[audience-audit] Lark lookup failed:", err);
    return null;
  }

  const kol = (dash.kols || []).find((k: any) => k?.id === kolId);
  if (!kol?.name) return null;

  const posts: ScoutedPostRow[] = (dash.posts || [])
    .filter((p: any) => {
      if (!p) return false;
      if (Array.isArray(p.kolRecordIds) && p.kolRecordIds.includes(kolId)) return true;
      const author = String(p.author || "").toLowerCase();
      return author.includes(String(kol.name).toLowerCase());
    })
    .map((p: any) => ({
      id: String(p?.id || ""),
      title: p?.title || "",
      hashtags: "",
      notes: "",
      platform: p?.platform || "",
      post_url: p?.postUrl || "",
    }));

  const supabase = createAdminClient();
  const { data: match } = await supabase
    .from("kols")
    .select("id")
    .ilike("name", kol.name)
    .limit(1)
    .maybeSingle();

  return {
    name: kol.name,
    supabaseId: match?.id || null,
    posts,
  };
}

/** Latest cached audit for a KOL (from kols.audience_audit or history table). */
export async function getLatestAudienceAudit(
  kolId: string
): Promise<AudienceAuditResult | null> {
  const supabase = createAdminClient();

  const { data: kol } = await supabase
    .from("kols")
    .select("audience_audit")
    .eq("id", kolId)
    .maybeSingle();

  if (kol?.audience_audit && typeof kol.audience_audit === "object") {
    return kol.audience_audit as AudienceAuditResult;
  }

  const { data: row } = await supabase
    .from("kol_audience_audits")
    .select("*")
    .eq("kol_id", kolId)
    .order("audited_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return row ? rowToResult(row) : null;
}

/** Run full audience + sponsored-content audit and persist results. */
export async function runKolAudienceAudit(
  kolId: string,
  options: RunAudienceAuditOptions = {}
): Promise<AudienceAuditResult> {
  const postLimit = Math.min(Math.max(options.postLimit ?? 40, 1), 100);
  const supabase = createAdminClient();

  let kol: { id: string; name: string; audience_audit?: AudienceAuditResult | null } | null =
    null;
  let externalPosts: ScoutedPostRow[] | null = null;

  if (isUuid(kolId)) {
    const { data, error: kolErr } = await supabase
      .from("kols")
      .select("id, name, audience_audit")
      .eq("id", kolId)
      .maybeSingle();
    if (kolErr) throw new Error(kolErr.message || "Failed to load KOL");
    kol = data;
  }

  if (!kol) {
    const external = await loadExternalSubject(kolId);
    if (!external) throw new Error("KOL profile not found");
    externalPosts = external.posts;
    if (external.supabaseId) {
      const { data } = await supabase
        .from("kols")
        .select("id, name, audience_audit")
        .eq("id", external.supabaseId)
        .maybeSingle();
      kol = data || { id: external.supabaseId, name: external.name, audience_audit: null };
    } else {
      kol = { id: kolId, name: external.name, audience_audit: null };
    }
  }

  if (!options.force && kol.audience_audit?.auditedAt) {
    const ageMs = Date.now() - new Date(kol.audience_audit.auditedAt).getTime();
    if (Number.isFinite(ageMs) && ageMs < 6 * 60 * 60 * 1000) {
      return kol.audience_audit as AudienceAuditResult;
    }
  }

  const persistable = isUuid(kol.id);
  let postRows: ScoutedPostRow[] = [];

  if (persistable) {
    const { data: posts, error: postsErr } = await supabase
      .from("scouted_posts")
      .select(
        "id, title, hashtags, notes, platform, post_url, comments, comments_sample, is_sponsored, sponsor_brand, sponsor_category, sponsor_disclosure_type"
      )
      .eq("kol_id", kol.id)
      .order("views", { ascending: false })
      .limit(postLimit);

    if (postsErr && /comments_sample|is_sponsored|sponsor_/.test(postsErr.message || "")) {
      const fallback = await supabase
        .from("scouted_posts")
        .select("id, title, hashtags, notes, platform, post_url, comments")
        .eq("kol_id", kol.id)
        .order("views", { ascending: false })
        .limit(postLimit);
      if (fallback.error) {
        console.warn("[audience-audit] scouted_posts fallback:", fallback.error.message);
      } else {
        postRows = (fallback.data || []) as ScoutedPostRow[];
      }
    } else if (postsErr) {
      throw new Error(postsErr.message || "Failed to load scouted posts");
    } else {
      postRows = (posts || []) as ScoutedPostRow[];
    }
  }

  if (postRows.length === 0 && externalPosts && externalPosts.length > 0) {
    postRows = externalPosts.slice(0, postLimit);
  }

  if (postRows.length === 0) {
    const empty = emptyResult();
    const auditedAt = new Date().toISOString();
    let auditId = "";
    if (persistable) {
      const { data: inserted } = await supabase
        .from("kol_audience_audits")
        .insert({
          kol_id: kol.id,
          audited_at: auditedAt,
          total_posts_scanned: 0,
          total_comments_scanned: 0,
          real_audience_rate: empty.realAudienceRate,
          seeding_rate: empty.seedingRate,
          seeding_risk_level: empty.seedingRiskLevel,
          top_tag_distribution: empty.topTagDistribution,
          sponsored_content_rate: empty.sponsoredContentRate,
          commercial_saturation: empty.commercialSaturation,
          booked_categories: empty.bookedCategories,
          partner_brands: empty.partnerBrands,
          sample_comments: empty.sampleComments,
          audit_summary: empty.auditSummary,
        })
        .select("id")
        .single();
      auditId = inserted?.id || "";
      if (inserted?.id) {
        const payload = toCachePayload(empty, auditedAt, auditId);
        await supabase.from("kols").update({ audience_audit: payload }).eq("id", kol.id);
        return payload;
      }
    }
    return toCachePayload(empty, auditedAt, auditId);
  }

  const { result: heuristicResult, enrichments } = heuristicAudit(postRows, kol.name);

  const { result, enrichments: finalEnrichments } = options.heuristicsOnly
    ? { result: heuristicResult, enrichments }
    : await enrichWithAi(postRows, heuristicResult, enrichments, kol.name);

  // Persist per-post sponsor fields only for rows that live in scouted_posts.
  if (persistable && !(externalPosts && externalPosts.length > 0 && postRows === externalPosts)) {
    const scoutedIds = new Set(
      postRows.filter((p) => isUuid(p.id)).map((p) => p.id)
    );
    await Promise.all(
      finalEnrichments
        .filter((e) => scoutedIds.has(e.postId))
        .map((e) =>
          supabase
            .from("scouted_posts")
            .update({
              is_sponsored: e.isSponsored,
              sponsor_brand: e.sponsorBrand,
              sponsor_category: e.sponsorCategory,
              sponsor_disclosure_type: e.sponsorDisclosureType,
            })
            .eq("id", e.postId)
        )
    );
  }

  const auditedAt = new Date().toISOString();
  if (!persistable) {
    return toCachePayload(result, auditedAt, "");
  }

  const { data: inserted, error: insErr } = await supabase
    .from("kol_audience_audits")
    .insert({
      kol_id: kol.id,
      audited_at: auditedAt,
      total_posts_scanned: result.totalPostsScanned,
      total_comments_scanned: result.totalCommentsScanned,
      real_audience_rate: result.realAudienceRate,
      seeding_rate: result.seedingRate,
      seeding_risk_level: result.seedingRiskLevel,
      top_tag_distribution: result.topTagDistribution,
      sponsored_content_rate: result.sponsoredContentRate,
      commercial_saturation: result.commercialSaturation,
      booked_categories: result.bookedCategories,
      partner_brands: result.partnerBrands,
      sample_comments: result.sampleComments,
      audit_summary: result.auditSummary,
    })
    .select("id")
    .single();

  if (insErr) {
    console.warn("[audience-audit] history insert skipped:", insErr.message);
    return toCachePayload(result, auditedAt, "");
  }

  const payload = toCachePayload(result, auditedAt, inserted.id);
  await supabase.from("kols").update({ audience_audit: payload }).eq("id", kol.id);

  return payload;
}

async function analyzePosts(
  name: string,
  posts: ScoutedPostRow[],
  heuristicsOnly?: boolean
): Promise<{ result: AudienceAuditResult; enrichments: PostSponsorEnrichment[] }> {
  if (posts.length === 0) {
    return { result: emptyResult(), enrichments: [] };
  }
  const heuristic = heuristicAudit(posts, name);
  if (heuristicsOnly) return heuristic;
  return enrichWithAi(posts, heuristic.result, heuristic.enrichments, name);
}

function auditRow(result: AudienceAuditResult, auditedAt: string) {
  return {
    audited_at: auditedAt,
    total_posts_scanned: result.totalPostsScanned,
    total_comments_scanned: result.totalCommentsScanned,
    real_audience_rate: result.realAudienceRate,
    seeding_rate: result.seedingRate,
    seeding_risk_level: result.seedingRiskLevel,
    top_tag_distribution: result.topTagDistribution,
    sponsored_content_rate: result.sponsoredContentRate,
    commercial_saturation: result.commercialSaturation,
    booked_categories: result.bookedCategories,
    partner_brands: result.partnerBrands,
    sample_comments: result.sampleComments,
    audit_summary: result.auditSummary,
  };
}

function larkPostsForCommunity(dash: any, community: { id: string; name: string; sport?: string[] }) {
  const name = (community.name || "").toLowerCase();
  const sports = (community.sport || []).map((s) => s.toLowerCase()).filter((s) => s.length > 2);
  const linked = (dash.posts || []).filter((p: any) => {
    const title = String(p.title || "").toLowerCase();
    const author = String(p.author || "").toLowerCase();
    if (Array.isArray(p.kolRecordIds) && p.kolRecordIds.includes(community.id)) return true;
    if (name && (author.includes(name) || title.includes(name))) return true;
    return false;
  });
  const pool = linked.length > 0 ? linked : (dash.posts || []).filter((p: any) => {
    const title = String(p.title || "").toLowerCase();
    return sports.some((sp) => title.includes(sp));
  });
  return pool.slice(0, 40).map((p: any) => ({
    id: String(p.id || ""),
    title: p.title || "",
    hashtags: "",
    notes: "",
    platform: p.platform || "",
    post_url: p.postUrl || "",
  })) as ScoutedPostRow[];
}

export async function getLatestCommunityAudienceAudit(
  communityId: string
): Promise<AudienceAuditResult | null> {
  if (!isUuid(communityId)) return null;
  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("communities")
    .select("audience_audit")
    .eq("id", communityId)
    .maybeSingle();
  if (row?.audience_audit && typeof row.audience_audit === "object") {
    return row.audience_audit as AudienceAuditResult;
  }
  return null;
}

export async function runCommunityAudienceAudit(
  communityId: string,
  options: RunAudienceAuditOptions = {}
): Promise<AudienceAuditResult> {
  const postLimit = Math.min(Math.max(options.postLimit ?? 40, 1), 100);
  const supabase = createAdminClient();
  let name = "";
  let sports: string[] = [];
  let supabaseId: string | null = isUuid(communityId) ? communityId : null;
  let cached: AudienceAuditResult | null = null;

  if (supabaseId) {
    let { data, error } = await supabase
      .from("communities")
      .select("id, name, sports, audience_audit")
      .eq("id", supabaseId)
      .maybeSingle();
    if (error && /audience_audit/.test(error.message || "")) {
      const fallback = await supabase
        .from("communities")
        .select("id, name, sports")
        .eq("id", supabaseId)
        .maybeSingle();
      data = fallback.data ? { ...fallback.data, audience_audit: null } : null;
      error = fallback.error;
    }
    if (error) throw new Error(error.message || "Failed to load community");
    if (data) {
      name = data.name || "";
      sports = Array.isArray(data.sports) ? data.sports : [];
      cached = data.audience_audit || null;
    } else {
      supabaseId = null;
    }
  }

  let externalPosts: ScoutedPostRow[] = [];
  if (!name) {
    try {
      const dash = await getLarkDashboardData();
      const community = (dash.communities || []).find((c: any) => c?.id === communityId);
      if (!community?.name) throw new Error("Community profile not found");
      name = community.name;
      sports = community.sport || [];
      externalPosts = larkPostsForCommunity(dash, { id: communityId, name, sport: sports });
      const { data: match } = await supabase
        .from("communities")
        .select("id, audience_audit")
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
      if (match?.id) {
        supabaseId = match.id;
        cached = match.audience_audit || null;
      }
    } catch (err: any) {
      if (err?.message === "Community profile not found") throw err;
      console.warn("[audience-audit] community lark lookup:", err);
    }
  }

  if (!name) throw new Error("Community profile not found");

  if (!options.force && cached?.auditedAt) {
    const age = Date.now() - new Date(cached.auditedAt).getTime();
    if (Number.isFinite(age) && age < 6 * 60 * 60 * 1000) return cached;
  }

  let posts: ScoutedPostRow[] = [];
  if (supabaseId) {
    const safe = name.replace(/[%_,]/g, " ");
    const { data, error } = await supabase
      .from("scouted_posts")
      .select("id, title, hashtags, notes, platform, post_url, comments, comments_sample")
      .or(`author.ilike.%${safe}%,title.ilike.%${safe}%`)
      .order("views", { ascending: false })
      .limit(postLimit);
    if (!error) posts = (data || []) as ScoutedPostRow[];
  }
  if (posts.length === 0 && externalPosts.length === 0) {
    try {
      const dash = await getLarkDashboardData();
      externalPosts = larkPostsForCommunity(dash, { id: communityId, name, sport: sports });
    } catch {
      /* lark optional */
    }
  }
  if (posts.length === 0) posts = externalPosts.slice(0, postLimit);

  const { result } = await analyzePosts(name, posts, options.heuristicsOnly);
  const auditedAt = new Date().toISOString();
  if (!supabaseId) return toCachePayload(result, auditedAt, "");

  const { data: inserted, error: insErr } = await supabase
    .from("community_audience_audits")
    .insert({ community_id: supabaseId, ...auditRow(result, auditedAt) })
    .select("id")
    .single();
  const payload = toCachePayload(result, auditedAt, inserted?.id || "");
  if (insErr) {
    console.warn("[audience-audit] community history skipped:", insErr.message);
    return payload;
  }
  await supabase.from("communities").update({ audience_audit: payload }).eq("id", supabaseId);
  return payload;
}

async function findOnePost(postId: string): Promise<{ name: string; post: ScoutedPostRow } | null> {
  const supabase = createAdminClient();
  if (isUuid(postId)) {
    const { data } = await supabase
      .from("scouted_posts")
      .select("id, title, hashtags, notes, platform, post_url, comments, comments_sample, author")
      .eq("id", postId)
      .maybeSingle();
    if (data) {
      return {
        name: data.author || "Post",
        post: data as ScoutedPostRow,
      };
    }
  }
  try {
    const dash = await getLarkDashboardData();
    const found = (dash.posts || []).find((p: any) => p?.id === postId);
    if (!found) return null;
    return {
      name: found.author || "Post",
      post: {
        id: String(found.id),
        title: found.title || "",
        hashtags: "",
        notes: "",
        platform: found.platform || "",
        post_url: found.postUrl || "",
      },
    };
  } catch {
    return null;
  }
}

export async function getLatestPostAudienceAudit(
  postId: string
): Promise<AudienceAuditResult | null> {
  if (!isUuid(postId)) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("scouted_posts")
    .select("content_audit")
    .eq("id", postId)
    .maybeSingle();
  if (data?.content_audit && typeof data.content_audit === "object") {
    return data.content_audit as AudienceAuditResult;
  }
  return null;
}

export async function runPostAudienceAudit(
  postId: string,
  options: RunAudienceAuditOptions = {}
): Promise<AudienceAuditResult> {
  const found = await findOnePost(postId);
  if (!found) throw new Error("Post not found");
  const { result, enrichments } = await analyzePosts(found.name, [found.post], options.heuristicsOnly);
  const auditedAt = new Date().toISOString();
  const payload = toCachePayload(result, auditedAt, postId);
  if (!isUuid(found.post.id)) return payload;

  const sponsor = enrichments[0];
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("scouted_posts")
    .update({
      content_audit: payload,
      is_sponsored: Boolean(sponsor?.isSponsored),
      sponsor_brand: sponsor?.sponsorBrand || "",
      sponsor_category: sponsor?.sponsorCategory || "",
      sponsor_disclosure_type: sponsor?.sponsorDisclosureType || "",
    })
    .eq("id", found.post.id);
  if (error) console.warn("[audience-audit] post snapshot skipped:", error.message);
  return payload;
}
