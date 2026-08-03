import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, requireEditor, AuthError } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

/**
 * /api/posts (SPEC §5)
 *   GET  ?status=...   list posts (any authed user; RLS scopes rows)
 *   POST               create a draft post (editor+)
 */

const createPostSchema = z.object({
  campaignId: z.string().uuid().optional(),
  caption: z.string().max(5000).optional(),
  hashtags: z.array(z.string()).max(60).optional(),
  cta: z.string().max(500).optional(),
  link: z.string().url().optional(),
  primaryPlatform: z.enum(["facebook", "instagram"]).optional(),
  /** social_account ids this post should fan out to (creates post_targets). */
  targetAccountIds: z.array(z.string().uuid()).optional(),
  /** ordered media asset ids for the post. */
  mediaIds: z.array(z.string().uuid()).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { db } = await requireUser();
    const status = req.nextUrl.searchParams.get("status");

    let query = db
      .from("posts")
      .select(
        "id, campaign_id, status, caption, hashtags, cta, link, primary_platform, scheduled_at, published_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ posts: data });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db, user } = await requireEditor();
    const body = createPostSchema.parse(await req.json());

    const { data: post, error } = await db
      .from("posts")
      .insert({
        campaign_id: body.campaignId ?? null,
        caption: body.caption ?? null,
        hashtags: body.hashtags ?? [],
        cta: body.cta ?? null,
        link: body.link ?? null,
        primary_platform: body.primaryPlatform ?? "facebook",
        status: "draft",
        created_by: user.id,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !post) {
      return NextResponse.json(
        { error: error?.message ?? "insert failed" },
        { status: 500 },
      );
    }

    // Attach media (ordered) and fan-out targets, if provided.
    if (body.mediaIds?.length) {
      const rows = body.mediaIds.map((media_id, position) => ({
        post_id: post.id,
        media_id,
        position,
      }));
      await db.from("post_media").insert(rows);
    }

    if (body.targetAccountIds?.length) {
      const rows = body.targetAccountIds.map((social_account_id) => ({
        post_id: post.id,
        social_account_id,
        status: "pending" as const,
      }));
      await db.from("post_targets").insert(rows);
    }

    return NextResponse.json({ id: post.id }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof z.ZodError) {
    return NextResponse.json(
      { error: "validation", issues: e.issues },
      { status: 422 },
    );
  }
  return NextResponse.json(
    { error: (e as Error).message ?? "internal error" },
    { status: 500 },
  );
}
