import { NextResponse, type NextRequest } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

/**
 * GET /api/tracked-accounts/[id]   — account detail + last 30 snapshots
 * PATCH /api/tracked-accounts/[id] — update label or status
 * DELETE /api/tracked-accounts/[id] — delete (CASCADE removes snapshots)
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await requireUser();
    const { id } = await params;

    const { data: account, error: accountError } = await db
      .from("tracked_accounts")
      .select("*")
      .eq("id", id)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: "Không tìm thấy." }, { status: 404 });
    }

    const { data: snapshots } = await db
      .from("tracked_account_snapshots")
      .select("*")
      .eq("tracked_account_id", id)
      .order("captured_at", { ascending: false })
      .limit(30);

    return NextResponse.json({ account, snapshots: snapshots ?? [] });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await requireUser();
    const { id } = await params;

    const body = (await req.json()) as { label?: string; status?: string };
    const update: Record<string, string> = {};

    if (body.label) {
      if (!["competitor", "own", "reference"].includes(body.label)) {
        return NextResponse.json({ error: "label không hợp lệ." }, { status: 400 });
      }
      update.label = body.label;
    }
    if (body.status) {
      if (!["pending", "active", "scraping", "error", "paused"].includes(body.status)) {
        return NextResponse.json({ error: "status không hợp lệ." }, { status: 400 });
      }
      update.status = body.status;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Không có trường nào để cập nhật." }, { status: 400 });
    }

    update.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from("tracked_accounts")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ account: data });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await requireUser();
    const { id } = await params;

    const { error } = await db.from("tracked_accounts").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
