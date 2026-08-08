import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data, error } = await supabase
    .from('remix_jobs')
    .update({ status: 'failed', error: 'Tiến trình worker bị treo (zombie). Đã dọn dẹp hệ thống. Vui lòng ấn thử lại.' })
    .eq('id', '21ece117-c9f9-4e95-b6c8-c09440510534')
    .select();
    
  if (error) console.error(error);
  else console.log('Updated to failed:', data);
}
run();
