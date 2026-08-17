import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireEditor, AuthError } from "@/lib/auth/require-user";
import { collectFolderDescendantIds, folderCreatesCycle } from "@/lib/remix/folders";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, user } = await requireEditor();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const { data: folders, error: foldersError } = await db
      .from("remix_folders")
      .select("id, parent_id")
      .eq("org_id", user.id);

    if (foldersError) return NextResponse.json({ error: foldersError.message }, { status: 500 });
    if (body.parentId !== undefined && folderCreatesCycle(id, body.parentId ?? null, folders ?? [])) {
      return NextResponse.json({ error: "Không thể di chuyển folder vào chính nó hoặc folder con của nó." }, { status: 422 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.parentId !== undefined) updateData.parent_id = body.parentId ?? null;
    if (body.sortOrder !== undefined) updateData.sort_order = body.sortOrder;

    const { data, error } = await db
      .from("remix_folders")
      .update(updateData)
      .eq("id", id)
      .eq("org_id", user.id)
      .select("*")
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message ?? "Cập nhật folder thất bại." }, { status: 500 });
    return NextResponse.json({ folder: data });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, user } = await requireEditor();
    const { id } = await params;
    const deleteJobs = req.nextUrl.searchParams.get("deleteJobs") === "true";

    const { data: folders, error: foldersError } = await db
      .from("remix_folders")
      .select("id, parent_id")
      .eq("org_id", user.id);

    if (foldersError) return NextResponse.json({ error: foldersError.message }, { status: 500 });
    const targetExists = (folders ?? []).some((folder) => folder.id === id);
    if (!targetExists) return NextResponse.json({ error: "Folder không tồn tại." }, { status: 404 });

    const descendantIds = collectFolderDescendantIds(id, folders ?? []);

    if (deleteJobs && descendantIds.length) {
      const { error: jobsError } = await db
        .from("remix_jobs")
        .delete()
        .in("folder_id", descendantIds);
      if (jobsError) return NextResponse.json({ error: jobsError.message }, { status: 500 });
    }

    const { error } = await db
      .from("remix_folders")
      .delete()
      .in("id", descendantIds);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, deletedFolderIds: descendantIds });
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
