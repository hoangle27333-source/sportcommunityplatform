import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQueue, QUEUE_NAMES } from "@/lib/queue";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
      
    if (!["admin", "editor"].includes(profile?.role ?? "")) {
      return NextResponse.json({ error: "Forbidden - role: " + profile?.role }, { status: 403 });
    }

    const body = await req.json();
    const { accountId, accountName } = body as {
      accountId?: string;
      accountName?: string;
    };

    if (!accountId || !accountName) {
      return NextResponse.json(
        { error: "accountId and accountName required" },
        { status: 400 },
      );
    }

    // Verify the account exists and is unofficial
    const db = createAdminClient();
    const { data: account, error: accountError } = await db
      .from("social_accounts")
      .select("id, channel_type")
      .eq("id", accountId)
      .single();

    if (accountError) {
      console.error("DB Error fetching account:", accountError);
      return NextResponse.json({ error: "Account lookup failed: " + accountError.message }, { status: 500 });
    }

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    
    if (account.channel_type !== "unofficial") {
      return NextResponse.json(
        { error: "Account is not unofficial type" },
        { status: 400 },
      );
    }

    // Enqueue the connect job
    const queue = getQueue(QUEUE_NAMES.playwright);
    const jobId = `connect-${accountId}`;
    await queue.add(
      "connect",
      { type: "connect", accountId, accountName },
      { jobId, removeOnComplete: { age: 3600 }, removeOnFail: { age: 3600 } },
    );

    return NextResponse.json({ jobId, accountId });
  } catch (err: any) {
    console.error("Connect API error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

