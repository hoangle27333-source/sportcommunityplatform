import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { execSync } from 'child_process';
import { readFileSync, rmSync } from 'fs';
import { uploadMediaAsset } from './src/lib/storage/media';

config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data: jobs } = await supabase.from('remix_jobs').select('*').in('id', ['ba256e9e-d123-474a-a9b1-c27b3adb6850', '64886eee-b204-49d9-8713-4f1eaad867a2']);
  
  if (!jobs || jobs.length === 0) {
    console.log('No jobs to fix.');
    return;
  }
  
  for (const job of jobs) {
    if (job.source_media_id) {
      console.log(`Job ${job.id} already has source_media_id, skipping.`);
      continue;
    }
    console.log(`Fixing job ${job.id}...`);
    try {
      const url = job.source_url;
      const tmpPath = `/tmp/fix_${job.id}.mp4`;
      
      console.log(`Downloading ${url}...`);
      execSync(`yt-dlp -S vcodec:h264,res,acodec:m4a -o "${tmpPath}" "${url}"`, { stdio: 'inherit' });
      
      const sourceBuffer = readFileSync(tmpPath);
      const stored = await uploadMediaAsset(supabase, {
        buffer: sourceBuffer,
        mimeType: "video/mp4",
        ext: "mp4",
        prefix: "remix_source",
        generatedBy: "upload",
        prompt: job.source_url ?? undefined,
      });
      await supabase.from("remix_jobs").update({ source_media_id: stored.id }).eq("id", job.id);
      console.log(`Successfully fixed job ${job.id}, new media id: ${stored.id}`);
      rmSync(tmpPath, { force: true });
    } catch (e) {
      console.error(`Failed to fix job ${job.id}:`, e);
    }
  }
  process.exit(0);
}
run();
