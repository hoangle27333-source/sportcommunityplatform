import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor, AuthError } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { editImage } from "@/lib/content/image-edit";

export const dynamic = "force-dynamic";

/**
 * POST /api/content/image-edit (SPEC §7.2/§7.4 — Image-Edit Agent)
 *   Given a source image (storage path or URL) + a natural-language instruction,
 *   the agent plans a whitelisted op sequence and executes it with Sharp, storing
 *   a new media_asset. It never generates free-form imagery. Editor+ only.
 */

const bodySchema = z
  .object({
    storagePath: z.string().min(1).optional(),
    sourceUrl: z.string().url().optional(),
    instruction: z.string().min(1).max(1000),
  })
  .refine((b) => b.storagePath || b.sourceUrl, {
    message: "storagePath or sourceUrl is required",
  });

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireEditor();
    const body = bodySchema.parse(await req.json());

    const admin = createAdminClient();
    const result = await editImage(admin, {
      storagePath: body.storagePath,
      sourceUrl: body.sourceUrl,
      instruction: body.instruction,
      createdBy: user.id,
    });

    return NextResponse.json(result);
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
