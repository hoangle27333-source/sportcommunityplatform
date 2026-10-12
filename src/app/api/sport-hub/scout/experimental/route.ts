import { NextRequest, NextResponse } from 'next/server';
import { scoutAccess, scoutFailure } from '@/lib/apify/sessions';
import { experimentalConfiguration, keywordSuggestions } from '@/lib/scout-experimental/plan';
import { createAdminClient } from '@/lib/supabase/admin';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest) {
 try {
  await scoutAccess();
  const q=req.nextUrl.searchParams;
  const configuration=await experimentalConfiguration();
  const dataset=q.get('dataset');
  let seeds:any[]=[];
  if(dataset && /^[a-f0-9]{64}$/.test(dataset)) {
   const {data,error}=await createAdminClient().from('scout_seed_records').select('record').eq('dataset_id',dataset);
   if(error)throw error;
   seeds=(data || []).filter(({record})=>!record.needsResolution).map(({record})=>({url:record.url,name:record.name,sport:record.sport,platform:record.platform}));
  }
  return NextResponse.json({...configuration,seeds,suggestions:keywordSuggestions((q.get('topic') || '').slice(0,300),(q.get('geography') || '').slice(0,100),(q.get('target') || '').slice(0,100))});
 }catch(e){return scoutFailure(e);}
}
