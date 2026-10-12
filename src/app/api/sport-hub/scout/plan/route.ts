import { NextRequest, NextResponse } from 'next/server';
import { requestSchema, scoutAccess, scoutFailure } from '@/lib/apify/sessions';
import { buildSearchPlan } from '@/lib/apify/search-plan';
import { z } from 'zod';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest) {
 try {await scoutAccess();const body=await req.json();const kind=z.enum(['preview','trends']).parse(body.kind);const params=requestSchema.parse(body);
 if(!params.keyword) return NextResponse.json({success:false,error:'Enter a search query.'},{status:400});
 return NextResponse.json({success:true,plan:await buildSearchPlan(kind,params)});
 } catch(e){return scoutFailure(e);}
}
