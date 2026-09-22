import { describe, expect, it } from "vitest";
import {
  buildTagDistribution,
  classifySeedingComment,
  commercialSaturationFromRate,
  detectSponsoredDisclosure,
  inferBrandFromText,
  inferTopicTags,
  round2,
  seedingRiskLevel,
} from "./audience-audit";

describe("detectSponsoredDisclosure", () => {
  it("detects Vietnam ad-law hashtags", () => {
    expect(detectSponsoredDisclosure("Check-in #duoctaitro với Garmin").isSponsored).toBe(
      true
    );
    expect(detectSponsoredDisclosure("Bài #quangcao chính thức").disclosureType).toBe(
      "vn_ad_hashtag"
    );
    expect(detectSponsoredDisclosure("Outfit ngày thi đấu #ad").isSponsored).toBe(true);
  });

  it("detects Meta/TikTok branded content phrasing", () => {
    expect(
      detectSponsoredDisclosure("Paid partnership with Nike — new court shoes").disclosureType
    ).toBe("paid_partnership");
    expect(
      detectSponsoredDisclosure("This is branded content with Joola").disclosureType
    ).toBe("branded_content_label");
  });

  it("returns none for organic captions", () => {
    const r = detectSponsoredDisclosure("Buổi tập sáng nay với team pickleball Hà Nội");
    expect(r.isSponsored).toBe(false);
    expect(r.disclosureType).toBe("none");
  });
});

describe("classifySeedingComment", () => {
  it("flags emoji-only and generic praise as seeding", () => {
    expect(classifySeedingComment("🔥🔥🔥")).toBe("seeding");
    expect(classifySeedingComment("Nice!")).toBe("seeding");
    expect(classifySeedingComment("quá đỉnh")).toBe("seeding");
    expect(classifySeedingComment("follow me")).toBe("seeding");
  });

  it("keeps substantive comments as organic", () => {
    expect(
      classifySeedingComment(
        "Form đánh backhand của anh ổn hơn tuần trước, giữ nhịp chân vững nhé!"
      )
    ).toBe("organic");
  });
});

describe("risk & saturation thresholds", () => {
  it("maps seeding rates to risk levels", () => {
    expect(seedingRiskLevel(10)).toBe("Low");
    expect(seedingRiskLevel(15)).toBe("Moderate");
    expect(seedingRiskLevel(31)).toBe("High");
  });

  it("maps sponsored rates to commercial saturation", () => {
    expect(commercialSaturationFromRate(20)).toBe("Low Commercial");
    expect(commercialSaturationFromRate(45)).toBe("Balanced");
    expect(commercialSaturationFromRate(71.4)).toBe("Heavy Commercial");
  });
});

describe("topic & brand inference", () => {
  it("infers sports and travel tags", () => {
    const tags = inferTopicTags("Pickleball tournament check-in tại Đà Nẵng");
    expect(tags).toContain("Sports");
    expect(tags).toContain("Travel");
  });

  it("builds top tag distribution percentages", () => {
    const dist = buildTagDistribution(
      ["Sports", "Sports", "Sports", "Travel", "Daily Topics"],
      5
    );
    expect(dist[0]?.tag).toBe("Sports");
    expect(dist[0]?.percentage).toBe(round2(60));
  });

  it("infers partner brand + industry", () => {
    const b = inferBrandFromText("Trải nghiệm đồng hồ @garmin trên đường chạy marathon");
    expect(b?.brand.toLowerCase()).toContain("garmin");
    expect(b?.industry).toBe("Sports Tech & Wearables");
  });
});
