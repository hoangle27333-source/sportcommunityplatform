import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await db.from('ai_generations')
    .select('prompt_tokens, output_tokens, cost_usd, cost_vnd, kind')
    .order('created_at', { ascending: false })
    .limit(50);
  
  if (error) console.error(error);
  else {
    const videoData = data.filter(r => r.kind === 'video');
    console.log("Recent video generation costs:", videoData.slice(0, 5));
    const avgVnd = videoData.reduce((sum, row) => sum + (row.cost_vnd || 0), 0) / (videoData.length || 1);
    console.log("Average VND:", avgVnd);
  }
}
run();
