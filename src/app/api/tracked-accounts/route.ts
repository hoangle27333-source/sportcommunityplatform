import { NextResponse, type NextRequest } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/require-user";
import { parseProfileUrl } from "@/lib/scraper/url-parser";
import { scoutAccess } from '@/lib/apify/sessions';

export const dynamic = "force-dynamic";

/**
 * GET /api/tracked-accounts
 *   ?platform=facebook|instagram
 *   ?label=competitor|own|reference
 *   ?status=pending|active|scraping|error|paused
 *
 * POST /api/tracked-accounts
 *   Body: { url: string, label?: 'competitor'|'own'|'reference' }
 */

export async function GET(req: NextRequest) {
  try {
    const { db } = await requireUser();

    const platform = req.nextUrl.searchParams.get("platform");
    const label = req.nextUrl.searchParams.get("label");
    const status = req.nextUrl.searchParams.get("status");

    let query = db
      .from("tracked_accounts")
      .select("*")
      .order("created_at", { ascending: false });

    if (platform) query = query.eq("platform", platform);
    if (label) query = query.eq("label", label);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ accounts: data ?? [] });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await scoutAccess();
    const { db, user } = await requireUser();

    const body = (await req.json()) as { url?: string; label?: string };
    const rawUrl = body.url?.trim();

    if (!rawUrl) {
      return NextResponse.json({ error: "A profile URL is required." }, { status: 400 });
    }

    const parsed = parseProfileUrl(rawUrl);
    if (!parsed) {
      return NextResponse.json(
        {
          error:
            "Enter a valid Facebook Page or Instagram profile URL.",
        },
        { status: 400 },
      );
    }

    const label = (body.label as string) || "competitor";
    if (!["competitor", "own", "reference"].includes(label)) {
      return NextResponse.json({ error: "Invalid label." }, { status: 400 });
    }

    // Insert
    const { data: account, error: insertError } = await db
      .from("tracked_accounts")
      .insert({
        created_by: user.id,
        platform: parsed.platform,
        profile_url: parsed.normalizedUrl,
        username: parsed.username,
        label,
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({success:true,account,message:'Account saved. Choose Refresh Data to collect observations.'}, {status:201});
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
