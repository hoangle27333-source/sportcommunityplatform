import { NextRequest, NextResponse } from 'next/server';
import { scoutAccess, scoutFailure, startSession } from '@/lib/apify/sessions';
import { commentPreview } from '@/lib/apify/tasks';
import { z } from 'zod';
export async function POST(req:NextRequest,ctx:{params:Promise<{id:string}>}) {
  try { await scoutAccess(); const kolId=z.string().uuid().parse((await ctx.params).id); const body=z.object({action:z.enum(['preview','start']),forceRefresh:z.boolean().optional(),selectedPostIds:z.array(z.string().uuid()).min(1).max(5).refine(ids=>new Set(ids).size===ids.length,'Select each post once.').optional()}).parse(await req.json());
    if(body.action==='preview') return NextResponse.json(await commentPreview(kolId));
    const preview=await commentPreview(kolId);
    const allowed=new Set(preview.posts.map(p=>p.id));
    if(!body.selectedPostIds || body.selectedPostIds.some(id=>!allowed.has(id))) return NextResponse.json({success:false,error:'Comment selection changed. Preview the sample again.'},{status:409});
    return startSession('comments',{kolId,forceRefresh:body.forceRefresh,selectedPostIds:body.selectedPostIds});
  } catch(e) { return scoutFailure(e); }
}
