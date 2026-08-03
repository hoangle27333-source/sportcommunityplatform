import { NextResponse, type NextRequest } from 'next/server';
import { requireUser, AuthError } from '@/lib/auth/require-user';
import { listVoicesWithMeta, previewVoiceSample } from '@/lib/remix/tts';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const sp = req.nextUrl.searchParams;
    const preview = sp.get('preview');
    
    if (preview) {
      const apiKey = process.env.GOOGLE_TTS_API_KEY;
      if (!apiKey) return NextResponse.json({ error: 'TTS not configured' }, { status: 503 });
      const audio = await previewVoiceSample(preview, apiKey);
      return new Response(new Uint8Array(audio), { headers: { 'Content-Type': 'audio/mpeg' } });
    }
    
    const filter: Record<string, string> = {};
    if (sp.get('gender')) filter.gender = sp.get('gender')!;
    if (sp.get('region')) filter.region = sp.get('region')!;
    if (sp.get('style')) filter.style = sp.get('style')!;
    if (sp.get('tier')) filter.tier = sp.get('tier')!;
    
    const voices = listVoicesWithMeta(Object.keys(filter).length ? filter : undefined);
    return NextResponse.json({ voices });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: (e as any).message }, { status: (e as any).status ?? 401 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
