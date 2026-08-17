import { NextResponse, type NextRequest } from "next/server";
import { requireEditor, AuthError } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, user } = await requireEditor();
    const { id } = await params;

    const { data: targetPreset, error: targetError } = await db
      .from("remix_caption_presets")
      .select("id")
      .eq("id", id)
      .eq("org_id", user.id)
      .maybeSingle();

    if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });
    if (!targetPreset) return NextResponse.json({ error: "Caption preset không tồn tại hoặc bạn không có quyền truy cập." }, { status: 404 });

    const { error: resetError } = await db
      .from("remix_caption_presets")
      .update({ is_default: false })
      .eq("org_id", user.id);

    if (resetError) return NextResponse.json({ error: resetError.message }, { status: 500 });

    const { data, error } = await db
      .from("remix_caption_presets")
      .update({ is_default: true })
      .eq("id", id)
      .eq("org_id", user.id)
      .select("*")
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message ?? "Cập nhật default caption preset thất bại" }, { status: 500 });
    return NextResponse.json({ preset: data });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: (e as any).message }, { status: (e as any).status ?? 401 });
    return NextResponse.json({ error: (e as Error).message ?? "internal error" }, { status: 500 });
  }
}
