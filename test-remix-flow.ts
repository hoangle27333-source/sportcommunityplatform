import { probeVideo, applyVideoOps } from './src/lib/remix/video-ops';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { VideoOp } from './src/lib/remix/types';

async function test() {
  const inputPath = './test.mp4.f27654033870892167v.mp4';
  const info = await probeVideo(inputPath);
  const workDir = path.join(process.cwd(), 'test_remix_temp');
  await mkdir(workDir, { recursive: true });

  const ops: VideoOp[] = [
    {
      op: 'reframe',
      width: 1080,
      height: 1920,
      mode: 'crop'
    },
    {
      op: 'subtitles',
      srt: "1\n00:00:01,000 --> 00:00:05,000\nĐây là phụ đề test\n",
    }
  ];

  try {
    const out = await applyVideoOps({
      inputPath,
      ops,
      workDir,
      blurRegion: { x: 0, y: 0.82, w: 1, h: 0.18 }
    });
    console.log("SUCCESS:", out);
  } catch (err) {
    console.log("ERROR:", err);
  }
}
test();
