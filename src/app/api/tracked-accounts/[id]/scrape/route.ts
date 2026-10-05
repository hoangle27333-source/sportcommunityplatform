import { NextRequest } from 'next/server';
import { startSession,scoutFailure } from '@/lib/apify/sessions';
import { z } from 'zod';
export async function POST(_req:NextRequest,ctx:{params:Promise<{id:string}>}) {
 try {const id=z.string().uuid().parse((await ctx.params).id);const body=await _req.json().catch(()=>({}));return await startSession('tracked',{trackedAccountId:id,uiContext:body.uiContext});} catch(e) {return scoutFailure(e);}
}
