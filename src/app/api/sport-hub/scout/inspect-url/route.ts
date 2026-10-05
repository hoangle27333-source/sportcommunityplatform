import {metadataIdentity} from '@/lib/apify/metadata-identity';
import {urlKind} from '@/lib/apify/discovery-quality';
import { startSession,scoutFailure } from '@/lib/apify/sessions';
import { NextRequest, NextResponse } from "next/server";
import { detectSportNiche, calculateTier } from "@/lib/apify/scout";

function inspectionResponse(value:any,init?:ResponseInit){return NextResponse.json({...value,...(value.data ? {scouted:value.data,source:'public-metadata',coverage:{verified:false,missingFields:Object.keys(value.data).filter(k=>value.data[k]==null || value.data[k]==='Unknown')}} : {})},init);}

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
    if(body.action==='verify') {if(!['profile','group'].includes(urlKind(body.url)))return inspectionResponse({success:false,error:'Enter a profile or community URL. Post links cannot become profiles.'},{status:400});const host=new URL(body.url).hostname;const platform=host==='instagram.com' || host.endsWith('.instagram.com') ? 'Instagram' : host==='facebook.com' || host.endsWith('.facebook.com') ? 'Facebook' : host==='tiktok.com' || host.endsWith('.tiktok.com') ? 'TikTok' : null;if(!platform)return inspectionResponse({success:false,error:'This platform is unavailable for verified enrichment.'},{status:400});return startSession('inspect',{url:body.url,platform});}
    const { url, type } = body as { url: string; type: "kol" | "community" | "post" };

    if (!url || typeof url !== "string") {
      return inspectionResponse(
        { success: false, error: "Please enter a valid URL (e.g. https://...)" },
        { status: 400 }
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      return inspectionResponse(
        { success: false, error: "Invalid URL format. Please include http:// or https://" },
        { status: 400 }
      );
    }

    if(['kol','community'].includes(type) && ['post','reel','story','watch'].includes(urlKind(url))) return inspectionResponse({success:false,error:'This is a post URL. Enter a profile or community URL instead.'},{status:400});
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

    const combinedText = `${meta.title} ${meta.description} ${oembedData?.title || ""}`;
    const rawDetectedSports = combinedText.trim() ? detectSportNiche(combinedText).filter(s=>s!=="Khác") : [];
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
    const primarySport = detectedSports[0] || "Unknown";

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
      cleanName=metadataIdentity(cleanName);
      const nameWarning=!cleanName ? 'Public metadata did not identify a profile name. Enter the original name before saving.' : '';
      // A URL handle is retained as a suggestion, never promoted to an observed name.


      // Extract followers count from meta description
      let followers: number | null = null;
      const fMatch = meta.description.match(/([\d.,]+[kmbKMB]?)\s*(?:followers|người theo dõi|người đăng ký|subscribers)/i);
      if (fMatch) {
        const p = parseCountString(fMatch[1]);
        if (p !== null) followers = p;
      }

      const tier = followers === null ? "Unknown" : calculateTier(followers);
      const avgViews = null;
      const er = null;
      const quotation = null;

      // Extract contact or bio
      let bio = meta.description.slice(0, 300) || "";
      const contact = handle ? `Direct @${handle}` : "Direct Social Message";

      return inspectionResponse({
        success: true,
        type: "kol",
        data: {
          name: cleanName,
          suggestedName: cleanName ? undefined : handle,
          metadataWarnings: nameWarning ? [nameWarning] : [],
          platform: platform.split(" ")[0],
          sport: detectedSports,
          tier,
          geography: combinedText.toLowerCase().includes("hà nội") || combinedText.toLowerCase().includes("hanoi")
            ? "Hanoi"
            : combinedText.toLowerCase().includes("hồ chí minh") || combinedText.toLowerCase().includes("sài gòn")
            ? "Ho Chi Minh City"
            : "Unknown",
          followers,
          avgViews,
          er,
          quotation,
          status: "New Scout (Unverified)",
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
      groupName=metadataIdentity(groupName);
      if (!groupName) groupName = "";

      // Extract members count
      let members: number | null = null;
      const mMatch = meta.description.match(/([\d.,]+[kmbKMB]?)\s*(?:members|thành viên|athletes|vận động viên)/i);
      if (mMatch) {
        const p = parseCountString(mMatch[1]);
        if (p !== null) members = p;
      }

      const pricePerPin = null;
      const activityLevel = "Unknown";

      const purposes:string[] = [];
      if (combinedText.toLowerCase().includes("giải") || combinedText.toLowerCase().includes("tournament")) {
        purposes.push("Amateur Tournaments");
      }
      if (combinedText.toLowerCase().includes("mua bán") || combinedText.toLowerCase().includes("gear") || combinedText.toLowerCase().includes("vợt")) {
        purposes.push("Gear & Racket Trading");
      }

      return inspectionResponse({
        success: true,
        type: "community",
        data: {
          name: groupName,
          metadataWarnings: groupName ? [] : ['Public metadata did not identify a community name. Enter the original name before saving.'],
          platform: platform.includes("Facebook") ? "Facebook Group" : platform.includes("Strava") ? "Strava Club" : "Facebook Group",
          sport: detectedSports,
          geography: combinedText.toLowerCase().includes("hà nội") || combinedText.toLowerCase().includes("hanoi")
            ? "Hanoi"
            : combinedText.toLowerCase().includes("hồ chí minh") || combinedText.toLowerCase().includes("sài gòn")
            ? "Ho Chi Minh City"
            : "Unknown",
          members,
          activityLevel,
          privacy: "Unknown",
          purpose: purposes,
          adminContact: "",
          pricePerPin,
          status: "New Scout (Unverified)",
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
        postTitle = "";
      }

      if (!author) {
        if (handle) author = handle;
      }

      // Extract hashtags
      const hashtagMatches = (postTitle + " " + meta.description).match(/#[\p{L}\w]+/gu);
      const hashtags = hashtagMatches ? Array.from(new Set(hashtagMatches)).slice(0, 5).join(" ") : "";

      // Metrics are unknown until obtained from a verified provider
      const views = null;
      const likes = null;
      const comments = null;
      const er = null;
      const viralTier = "Unknown";
      const postPlatform = platform;

      return inspectionResponse({
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

    return inspectionResponse(
      { success: false, error: "Invalid inspection type" },
      { status: 400 }
    );
  } catch (err: any) {
    if(err?.code) return scoutFailure(err);
    console.error("API /api/sport-hub/scout/inspect-url error:", err);
    return inspectionResponse(
      { success: false, error: err.message || "Failed to inspect URL" },
      { status: 500 }
    );
  }
}
