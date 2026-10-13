import { NextRequest,NextResponse } from 'next/server';
import { getServerUserRole } from '@/lib/auth/financial-sanitizer';
import { createAdminClient } from '@/lib/supabase/admin';
import { contentFilterSchema,loadContentSettings } from '@/lib/apify/content-settings';
import { ScoutError } from '@/lib/apify/errors';
import { scoutFailure } from '@/lib/apify/sessions';
export async function GET(){try{const user=await getServerUserRole();if(!user.userId)throw new ScoutError('Please log in.','UNAUTHORIZED',401);return NextResponse.json({success:true,settings:await loadContentSettings(),canEdit:user.role==='admin'});}catch(e){return scoutFailure(e);}}
export async function PUT(req:NextRequest){try{const user=await getServerUserRole();if(!user.userId || user.role!=='admin')throw new ScoutError('Administrator access required.','FORBIDDEN',403);const settings=contentFilterSchema.parse(await req.json());const {error}=await createAdminClient().from('scout_content_settings').update({settings,updated_at:new Date().toISOString()}).eq('id',true);if(error)throw error;return NextResponse.json({success:true,settings});}catch(e){return scoutFailure(e);}}
