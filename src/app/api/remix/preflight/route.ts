import { NextResponse } from "next/server";
import { requireEditor, AuthError } from "@/lib/auth/require-user";
import { getRemixServiceHealth } from "@/lib/remix/service-health";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireEditor();
    const health = await getRemixServiceHealth();
    return NextResponse.json(health);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: (e as Error).message ?? "internal error" },
      { status: 500 },
    );
  }
}
