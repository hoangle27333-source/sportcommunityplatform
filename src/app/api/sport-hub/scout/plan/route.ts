import { resolveContentFilter } from '@/lib/apify/content-settings';
import { NextRequest, NextResponse } from 'next/server';
import { requestSchema, scoutAccess, scoutFailure } from '@/lib/apify/sessions';
import { buildEntityTopPlan } from '@/lib/apify/top-post-plan';
import { buildSearchPlan } from '@/lib/apify/search-plan';
import { z } from 'zod';
import { buildAccountPostPlan } from '@/lib/apify/account-posts';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest) {
 try {await scoutAccess();const body=await req.json();if(body.kind==='account-posts')return NextResponse.json({success:true,plan:await buildAccountPostPlan(body)});const kind=z.enum(['preview','trends','kol-posts','community-posts']).parse(body.kind);const params=requestSchema.parse(body);
 if(kind!=='preview')params.qualityFilter=await resolveContentFilter(params);
 if(['preview','trends'].includes(kind) && !params.keyword) return NextResponse.json({success:false,error:'Enter a search query.'},{status:400});
 return NextResponse.json({success:true,plan:['kol-posts','community-posts'].includes(kind)?await buildEntityTopPlan(kind,params):await buildSearchPlan(kind as 'preview'|'trends',params)});
 } catch(e){return scoutFailure(e);}
}
