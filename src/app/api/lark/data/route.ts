import { NextResponse } from "next/server";
import { getLarkDashboardData } from "@/lib/lark/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getLarkDashboardData();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...data,
    });
  } catch (err: any) {
    console.error("API /api/lark/data error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Không thể tải dữ liệu từ Lark Base",
      },
      { status: 500 }
    );
  }
}
