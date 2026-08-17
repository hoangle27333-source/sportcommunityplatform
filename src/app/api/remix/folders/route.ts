import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor, requireUser, AuthError } from "@/lib/auth/require-user";
import { buildFolderTree, type RemixFolderRecord } from "@/lib/remix/folders";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.string().uuid().nullable().optional(),
});

export async function GET(_req: NextRequest) {
  try {
    const { db } = await requireUser();
    const [{ data: folders, error: folderError }, { data: jobs, error: jobsError }] =
      await Promise.all([
        db
          .from("remix_folders")
          .select("id, org_id, name, parent_id, sort_order, created_at, updated_at")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        db.from("remix_jobs").select("id, folder_id"),
      ]);

    if (folderError) return NextResponse.json({ error: folderError.message }, { status: 500 });
    if (jobsError) return NextResponse.json({ error: jobsError.message }, { status: 500 });

    const counts: Record<string, number> = {};
    let unfiledCount = 0;
    for (const job of jobs ?? []) {
      if (!job.folder_id) unfiledCount += 1;
      else counts[job.folder_id] = (counts[job.folder_id] ?? 0) + 1;
    }

    return NextResponse.json({
      folders: buildFolderTree((folders ?? []) as RemixFolderRecord[], counts),
      unfiledCount,
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db, user } = await requireEditor();
    const body = createSchema.parse(await req.json());

    const { data: siblings } = await db
      .from("remix_folders")
      .select("sort_order")
      .eq("org_id", user.id)
      .is("parent_id", body.parentId ?? null)
      .order("sort_order", { ascending: false })
      .limit(1);

    const sortOrder = ((siblings?.[0]?.sort_order as number | undefined) ?? -1) + 1;

    const { data, error } = await db
      .from("remix_folders")
      .insert({
        org_id: user.id,
        name: body.name,
        parent_id: body.parentId ?? null,
        sort_order: sortOrder,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Tạo folder thất bại." }, { status: 500 });
    }
    return NextResponse.json({ folder: data }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}

function handleError(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof z.ZodError) {
    return NextResponse.json({ error: "validation", issues: e.issues }, { status: 422 });
  }
  return NextResponse.json({ error: (e as Error).message ?? "internal error" }, { status: 500 });
}
