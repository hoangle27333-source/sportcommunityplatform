import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor, AuthError } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderBannerToStorage, listBannerTemplates } from "@/lib/content/banner";

export const dynamic = "force-dynamic";

/**
 * POST /api/content/banner (SPEC §7.2 — templated banner generation)
 *   Renders a Satori/Sharp banner and stores it as a media_asset. Editor+ only.
 *   Rendering is fast (sub-second) so it runs inline; heavy batches can be
 *   queued on content-gen (kind=render-banner) instead.
 *
 * GET returns the available template names.
 */

const bodySchema = z.object({
  template: z.string().min(1),
  data: z.record(z.unknown()).default({}),
  width: z.number().int().min(64).max(4096).optional(),
  height: z.number().int().min(64).max(4096).optional(),
});

export async function GET() {
  try {
    await requireEditor();
    return NextResponse.json({ templates: listBannerTemplates() });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireEditor();
    const body = bodySchema.parse(await req.json());

    // Storage writes use the service-role client (media bucket is system-owned).
    const admin = createAdminClient();
    const asset = await renderBannerToStorage(admin, {
      template: body.template,
      data: body.data,
      width: body.width,
      height: body.height,
      createdBy: user.id,
    });

    return NextResponse.json({ asset });
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
