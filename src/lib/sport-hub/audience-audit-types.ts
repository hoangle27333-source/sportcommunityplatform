/** Audience authenticity & sponsored-content audit contracts (API + cache). */

/** Drop model sentences that explain a missing comment sample as if the audit failed. */
export function cleanAuditSummary(summary: string, commentsScanned: number): string {
  const text = String(summary || "").replace(/\s+/g, " ").trim();
  if (!text || commentsScanned > 0) return text;
  const kept = text.split(/(?<=[.!?])\s+/).filter((sentence) => {
    return !/comment|seeding|authenticity|could not|unable to|preventing an analysis|not contain/i.test(
      sentence
    );
  });
  return kept.join(" ").trim();
}

export type SeedingRiskLevel = "Low" | "Moderate" | "High";
export type CommercialSaturation =
  | "Low Commercial"
  | "Balanced"
  | "Heavy Commercial";

export type SponsorDisclosureType =
  | "vn_ad_hashtag"
  | "branded_content_label"
  | "paid_partnership"
  | "inferred_brand_mention"
  | "none"
  | string;

export interface TagDistributionItem {
  tag: string;
  percentage: number;
}

export interface BookedCategoryItem {
  category: string;
  percentage: number;
  count: number;
}

export interface PartnerBrandItem {
  brand: string;
  handle: string;
  industry: string;
  postCount: number;
}

export interface SampleComments {
  organic: string[];
  seeding: string[];
}

/** CamelCase API / cache payload returned to the UI. */
export interface AudienceAuditResult {
  totalPostsScanned: number;
  totalCommentsScanned: number;
  realAudienceRate: number;
  seedingRate: number;
  seedingRiskLevel: SeedingRiskLevel;
  topTagDistribution: TagDistributionItem[];
  sponsoredContentRate: number;
  commercialSaturation: CommercialSaturation;
  bookedCategories: BookedCategoryItem[];
  partnerBrands: PartnerBrandItem[];
  sampleComments: SampleComments;
  auditSummary: string;
  auditedAt?: string;
  auditId?: string;
}

export interface AudienceAuditApiResponse {
  success: boolean;
  data?: AudienceAuditResult;
  error?: string;
  message?: string;
}

/** Per-post sponsor enrichment persisted on scouted_posts. */
export interface PostSponsorEnrichment {
  postId: string;
  isSponsored: boolean;
  sponsorBrand: string;
  sponsorCategory: string;
  sponsorDisclosureType: SponsorDisclosureType;
}

export interface RunAudienceAuditOptions {
  /** Max scouted posts to analyze (default 40). */
  postLimit?: number;
  /** Force a fresh audit even if a recent cache exists. */
  force?: boolean;
  /** Skip live AI and use heuristics only (tests / offline). */
  heuristicsOnly?: boolean;
}
