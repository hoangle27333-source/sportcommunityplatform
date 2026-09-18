import { NextRequest, NextResponse } from "next/server";
import { detectSportNiche, calculateTier } from "@/lib/apify/scout";

export const dynamic = "force-dynamic";

/**
 * Helper to parse human-readable metric counts (e.g. "1.5M", "250K", "15,200")
 */
function parseCountString(str: string): number | null {
  if (!str) return null;
  const cleaned = str.trim().replace(/,/g, "");
  const match = cleaned.match(/^([\d.]+)\s*([kmbKMB]|triệu|nghìn|ngàn)?$/i);
  if (!match) {
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : Math.round(num);
  }
  const val = parseFloat(match[1]);
  if (isNaN(val)) return null;
  const unit = (match[2] || "").toLowerCase();
  if (unit === "k" || unit === "nghìn" || unit === "ngàn") return Math.round(val * 1000);
  if (unit === "m" || unit === "triệu") return Math.round(val * 1000000);
  if (unit === "b") return Math.round(val * 1000000000);
  return Math.round(val);
}

/**
 * Extract OpenGraph tags and metadata from raw HTML
 */
function parseHtmlMetadata(html: string) {
  const getTag = (prop: string): string => {
    const m1 = html.match(new RegExp(`<meta[^>]+property=["'](?:og:)?${prop}["'][^>]+content=["']([^"']+)["']`, "i"));
    if (m1 && m1[1]) return m1[1];
    const m2 = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["'](?:og:)?${prop}["']`, "i"));
    if (m2 && m2[1]) return m2[1];
    const m3 = html.match(new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"));
    if (m3 && m3[1]) return m3[1];
    return "";
  };

  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = getTag("title") || (titleTag ? titleTag[1].trim() : "");
  const description = getTag("description");
  const image = getTag("image");

  return { title, description, image };
}

/**
 * Humanize a handle or slug (e.g. "dokimphuc.official" -> "Đỗ Kim Phúc" or "Do Kim Phuc")
 */
function humanizeSlug(slug: string): string {
  const clean = slug.replace(/^@/, "").replace(/[-_.]+/g, " ").trim();
  return clean
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * POST /api/sport-hub/scout/inspect-url
 * Auto-inspects social links & community URLs for form autofill
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, type } = body as { url: string; type: "kol" | "community" | "post" };

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { success: false, error: "Please enter a valid URL (e.g. https://...)" },
        { status: 400 }
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid URL format. Please include http:// or https://" },
        { status: 400 }
      );
    }

    const host = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname;
    const pathParts = pathname.split("/").filter(Boolean);

    // ─── 1. Identify Platform ───
    let platform = "Other";
    let isVideoPost = false;
    let handle = "";

    if (host.includes("instagram.com")) {
      platform = "Instagram";
      if (pathParts[0] === "reel" || pathParts[0] === "reels") {
        platform = "Instagram Reels";
        isVideoPost = true;
      } else if (pathParts[0] === "p") {
        platform = "Instagram Post";
        isVideoPost = false;
      } else if (pathParts[0]) {
        handle = pathParts[0];
      }
    } else if (host.includes("tiktok.com")) {
      platform = "TikTok";
      if (pathname.includes("/video/")) {
        platform = "TikTok Video";
        isVideoPost = true;
      }
      const userPart = pathParts.find((p) => p.startsWith("@"));
      if (userPart) handle = userPart.replace(/^@/, "");
    } else if (host.includes("facebook.com") || host.includes("fb.com") || host.includes("fb.watch")) {
      if (pathname.includes("/groups/")) {
        platform = "Facebook Group";
        const groupIdx = pathParts.indexOf("groups");
        if (groupIdx !== -1 && pathParts[groupIdx + 1]) {
          handle = pathParts[groupIdx + 1];
        }
      } else if (pathname.includes("/reel") || host.includes("fb.watch") || pathname.includes("/watch")) {
        platform = "Facebook Reels";
        isVideoPost = true;
      } else if (pathname.includes("/posts/") || pathname.includes("/story.php")) {
        platform = "Facebook Post";
      } else {
        platform = "Facebook";
        if (pathParts[0] && !["profile.php", "home", "groups"].includes(pathParts[0])) {
          handle = pathParts[0];
        }
      }
    } else if (host.includes("youtube.com") || host.includes("youtu.be")) {
      if (pathname.includes("/shorts/")) {
        platform = "YouTube Shorts";
        isVideoPost = true;
      } else if (pathname.includes("/watch") || host.includes("youtu.be")) {
        platform = "YouTube Video";
        isVideoPost = true;
      } else {
        platform = "YouTube";
        if (pathParts[0]?.startsWith("@")) handle = pathParts[0].replace(/^@/, "");
      }
    } else if (host.includes("strava.com")) {
      if (pathname.includes("/clubs/")) {
        platform = "Strava Club";
        const idx = pathParts.indexOf("clubs");
        if (idx !== -1 && pathParts[idx + 1]) handle = pathParts[idx + 1];
      } else {
        platform = "Strava";
        const idx = pathParts.indexOf("athletes");
        if (idx !== -1 && pathParts[idx + 1]) handle = pathParts[idx + 1];
      }
    } else if (host.includes("zalo.me")) {
      platform = "Zalo Community";
    } else if (host.includes("t.me") || host.includes("telegram.me")) {
      platform = "Telegram";
      if (pathParts[0]) handle = pathParts[0];
    }

    // ─── 2. Fetch oEmbed or OpenGraph HTML (Timeout 5s) ───
    let meta = { title: "", description: "", image: "" };
    let oembedData: any = null;

    // Try TikTok oEmbed
    if (host.includes("tiktok.com") && pathname.includes("/video/")) {
      try {
        const oRes = await fetch(
          `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (oRes.ok) oembedData = await oRes.json();
      } catch {
        // Fallback
      }
    }

    // Try YouTube oEmbed
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      try {
        const oRes = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (oRes.ok) oembedData = await oRes.json();
      } catch {
        // Fallback
      }
    }

    // Fetch OpenGraph HTML if oEmbed didn't give full metadata
    try {
      const htmlRes = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
        },
        signal: AbortSignal.timeout(4500),
      });
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        meta = parseHtmlMetadata(html);
      }
    } catch {
      // Graceful fallback to heuristics
    }

    const combinedText = `${meta.title} ${meta.description} ${oembedData?.title || ""} ${url}`;
    const rawDetectedSports = detectSportNiche(combinedText);
    const sportTranslation: Record<string, string> = {
      "Bóng đá": "Football",
      "Cầu lông": "Badminton",
      "Chạy bộ": "Running",
      "Chạy bộ / Marathon": "Running",
      "Đạp xe": "Cycling",
      "Khác": "Others",
      "Tennis": "Tennis",
      "Pickleball": "Pickleball",
      "Gym & Fitness": "Gym & Fitness",
      "Golf": "Golf",
    };
    const detectedSports = rawDetectedSports.map((s) => sportTranslation[s] || s);
    const primarySport = detectedSports[0] || "Pickleball";

    // ─── 3. Response Construction By Target Type ───

    if (type === "kol") {
      // Clean author / creator name
      let cleanName = "";
      if (oembedData?.author_name) {
        cleanName = oembedData.author_name;
      } else if (meta.title) {
        cleanName = meta.title
          .replace(/\|.*$/g, "")
          .replace(/-.*$/g, "")
          .replace(/•.*$/g, "")
          .replace(/on (Instagram|TikTok|Facebook|YouTube).*$/i, "")
          .replace(/\(@[^)]+\)/g, "")
          .trim();
      }
      if (!cleanName && handle) cleanName = humanizeSlug(handle);
      if (!cleanName) cleanName = "Creator " + (handle || "Athlete");

      // Extract followers count from meta description
      let followers = 28000;
      const fMatch = meta.description.match(/([\d.,]+[kmbKMB]?)\s*(?:followers|người theo dõi|người đăng ký|subscribers)/i);
      if (fMatch) {
        const p = parseCountString(fMatch[1]);
        if (p && p > 0) followers = p;
      }

      const tier = calculateTier(followers);
      const avgViews = Math.round(followers * 0.45);
      const er = +(3.8 + Math.min(followers / 50000, 3.2)).toFixed(1);
      const quotation =
        followers >= 1000000
          ? 60000000
          : followers >= 200000
          ? 35000000
          : followers >= 50000
          ? 15000000
          : followers >= 10000
          ? 6000000
          : 2500000;

      // Extract contact or bio
      let bio = meta.description.slice(0, 300) || `${cleanName} - Vận động viên & sáng tạo nội dung thể thao (${primarySport}).`;
      const contact = handle ? `Direct @${handle}` : "Direct Social Message";

      return NextResponse.json({
        success: true,
        type: "kol",
        data: {
          name: cleanName,
          platform: platform.includes("Reels") || platform.includes("Post") ? "Instagram" : platform,
          sport: detectedSports,
          tier,
          geography: combinedText.toLowerCase().includes("hà nội") || combinedText.toLowerCase().includes("hanoi")
            ? "Hanoi"
            : combinedText.toLowerCase().includes("hồ chí minh") || combinedText.toLowerCase().includes("sài gòn")
            ? "Ho Chi Minh City"
            : "Nationwide",
          followers,
          avgViews,
          er,
          quotation,
          status: "Active Partnership",
          contact,
          bio,
          profileUrl: url,
        },
      });
    }

    if (type === "community") {
      let groupName = "";
      if (meta.title) {
        groupName = meta.title
          .replace(/\|.*$/g, "")
          .replace(/-.*$/g, "")
          .replace(/•.*$/g, "")
          .replace(/on (Facebook|Strava).*$/i, "")
          .trim();
      }
      if (!groupName && handle) groupName = humanizeSlug(handle);
      if (!groupName) groupName = `Cộng Đồng ${primarySport} Việt Nam`;

      // Extract members count
      let members = 15000;
      const mMatch = meta.description.match(/([\d.,]+[kmbKMB]?)\s*(?:members|thành viên|athletes|vận động viên)/i);
      if (mMatch) {
        const p = parseCountString(mMatch[1]);
        if (p && p > 0) members = p;
      }

      const pricePerPin =
        members >= 80000
          ? 4000000
          : members >= 30000
          ? 3000000
          : members >= 10000
          ? 2000000
          : 1000000;

      const activityLevel =
        meta.description.includes("20 posts") || meta.description.includes("rất sôi động") || members > 30000
          ? "Very Active (> 20 posts/day)"
          : "Moderate (5 - 10 posts/day)";

      const purposes = ["Match Finding & Socializing", "Skill & Technique Sharing"];
      if (combinedText.toLowerCase().includes("giải") || combinedText.toLowerCase().includes("tournament")) {
        purposes.push("Amateur Tournaments");
      }
      if (combinedText.toLowerCase().includes("mua bán") || combinedText.toLowerCase().includes("gear") || combinedText.toLowerCase().includes("vợt")) {
        purposes.push("Gear & Racket Trading");
      }

      return NextResponse.json({
        success: true,
        type: "community",
        data: {
          name: groupName,
          platform: platform.includes("Facebook") ? "Facebook Group" : platform.includes("Strava") ? "Strava Club" : "Facebook Group",
          sport: detectedSports,
          geography: combinedText.toLowerCase().includes("hà nội") || combinedText.toLowerCase().includes("hanoi")
            ? "Hanoi"
            : combinedText.toLowerCase().includes("hồ chí minh") || combinedText.toLowerCase().includes("sài gòn")
            ? "Ho Chi Minh City"
            : "Nationwide",
          members,
          activityLevel,
          privacy: meta.description.toLowerCase().includes("private") || meta.description.toLowerCase().includes("riêng tư") ? "Private" : "Public",
          purpose: purposes,
          adminContact: handle ? `Admin ${handle}` : "Group Management Team",
          pricePerPin,
          status: "Active Partnership",
          groupUrl: url,
        },
      });
    }

    if (type === "post") {
      let postTitle = "";
      let author = "";
      let thumb = meta.image || "";

      if (oembedData) {
        postTitle = oembedData.title || "";
        author = oembedData.author_name || "";
        if (oembedData.thumbnail_url) thumb = oembedData.thumbnail_url;
      }

      if (!postTitle && meta.title) {
        postTitle = meta.title
          .replace(/\|.*$/g, "")
          .replace(/on (Instagram|TikTok|Facebook|YouTube).*$/i, "")
          .trim();
      }
      if (!postTitle && meta.description) {
        postTitle = meta.description.slice(0, 160);
      }
      if (!postTitle) {
        postTitle = `Khoảnh khắc thi đấu & tập luyện thể thao (${primarySport})`;
      }

      if (!author) {
        if (handle) author = humanizeSlug(handle);
        else author = "Sport Creator";
      }

      // Extract hashtags
      const hashtagMatches = (postTitle + " " + meta.description).match(/#[\p{L}\w]+/gu);
      const hashtags = hashtagMatches ? Array.from(new Set(hashtagMatches)).slice(0, 5).join(" ") : `#${primarySport.toLowerCase()} #sport`;

      // Estimated metrics for post
      const views = isVideoPost ? 55000 : 18000;
      const likes = Math.round(views * 0.055);
      const comments = Math.round(likes * 0.04);
      const er = +(((likes + comments) / views) * 100).toFixed(1);

      const viralTier =
        views >= 100000
          ? "Super Viral (> 100k views)"
          : views >= 20000
          ? "High Engagement (10k - 100k views)"
          : "Standard";

      let postPlatform = platform;
      if (platform === "TikTok" || platform === "TikTok Video") postPlatform = "TikTok Video";
      else if (platform === "Instagram" || platform === "Instagram Reels") postPlatform = "Instagram Reels";
      else if (platform === "Facebook" || platform === "Facebook Reels") postPlatform = "Facebook Reels";
      else if (platform === "YouTube" || platform === "YouTube Shorts") postPlatform = "YouTube Shorts";

      return NextResponse.json({
        success: true,
        type: "post",
        data: {
          title: postTitle,
          author,
          platform: postPlatform,
          sport: primarySport,
          likes,
          comments,
          views,
          er,
          viralTier,
          hashtags,
          postUrl: url,
          thumbnailUrl: thumb,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: "Invalid inspection type" },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("API /api/sport-hub/scout/inspect-url error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to inspect URL" },
      { status: 500 }
    );
  }
}
