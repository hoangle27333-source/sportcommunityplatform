import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/lib/ai";

/**
 * POST /api/seeding/ai-comment
 *
 * Generates 3 comment variants using AI (Gemini) from a brief description.
 * Used in the seeding UI when mode = 'ai_generate'.
 *
 * Body: { brief: string; tone?: string; targetContext?: string }
 * Returns: { variants: string[] }
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { brief, tone, targetContext } = body as {
    brief?: string;
    tone?: string;
    targetContext?: string;
  };

  if (!brief || brief.trim().length < 5) {
    return NextResponse.json(
      { error: "brief phải có ít nhất 5 ký tự" },
      { status: 400 },
    );
  }

  const ai = getAIProvider();

  const prompt = `Bạn là chuyên gia viết comment seeding cho mạng xã hội Facebook tại Việt Nam.
Nhiệm vụ: Sinh ra ĐÚNG 3 biến thể comment bằng tiếng Việt, tự nhiên như người thật viết.

Brief: ${brief}
${tone ? `Giọng điệu: ${tone}` : ""}
${targetContext ? `Ngữ cảnh bài đăng: ${targetContext}` : ""}

Yêu cầu:
- Mỗi comment ngắn gọn (1-3 câu), không có hashtag
- Viết tự nhiên, không lộ vẻ marketing
- 3 biến thể phải khác nhau về cách diễn đạt
- Trả về JSON array: ["comment 1", "comment 2", "comment 3"]
- CHỈ trả về JSON, không có text nào khác`;

  try {
    const result = await ai.completeJson<string[]>(prompt);

    if (!result.data || !Array.isArray(result.data) || result.data.length === 0) {
      return NextResponse.json(
        { error: "AI không trả về đúng định dạng" },
        { status: 500 },
      );
    }

    return NextResponse.json({ variants: result.data.slice(0, 3) });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
