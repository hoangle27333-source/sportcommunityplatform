import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { ScoutError } from './errors';
import type { SocialPost } from './providers';
export const contentFilterSchema=z.object({enabled:z.boolean(),minViews:z.number().int().min(1).max(1000000000),minInteractions:z.number().int().min(1).max(1000000),metricRule:z.literal('views-first').default('views-first'),policyVersion:z.literal(1).default(1)});
export type ContentFilter=z.infer<typeof contentFilterSchema>;
export const DEFAULT_CONTENT_FILTER:ContentFilter={enabled:true,minViews:1000,minInteractions:50,metricRule:'views-first',policyVersion:1};
export async function loadContentSettings():Promise<ContentFilter> {
 const {data,error}=await createAdminClient().from('scout_content_settings').select('settings').eq('id',true).single();
 if(error || !data)throw new ScoutError('Scout content settings require the database migration. No collection was started.','CONTENT_SETTINGS_UNAVAILABLE',503);
 return contentFilterSchema.parse(data.settings);
}
export async function resolveContentFilter(params:Record<string,any>) {
 if(params.qualityFilter)return contentFilterSchema.parse(params.qualityFilter);
 // Explicit legacy form controls are still accepted as a per-run override.
 if(params.thresholdsEnabled!==undefined)return contentFilterSchema.parse({...DEFAULT_CONTENT_FILTER,enabled:params.thresholdsEnabled,minViews:params.minViews ?? 1000,minInteractions:params.minInteractions ?? 50});
 return loadContentSettings();
}
export function assessContentFilter(post:SocialPost,policy:ContentFilter) {
 const known=(value:unknown):value is number=>typeof value==='number' && Number.isFinite(value) && value>=0;
 const fields=['likes','comments','shares'] as const;
 const observed=fields.filter(key=>known(post[key]));
 const interactions=observed.reduce((sum,key)=>sum+(post[key] as number),0);
 const metric=known(post.views)?'views':observed.length?'interactions':'unknown';
 const value=metric==='views'?post.views:metric==='interactions'?interactions:null;
 const minimum=metric==='views'?policy.minViews:policy.minInteractions;
 const state=!policy.enabled?'passed':metric==='unknown'?'unknown':value!>=minimum?'passed':'failed';
 return {state:state as 'passed'|'failed'|'unknown',reason:!policy.enabled?'Low-engagement filtering is disabled.':metric==='unknown'?'Engagement metrics are unavailable.':`${metric==='views'?'Views':'Observed reactions / likes + comments + shares'}: ${value!.toLocaleString('en-US')}; minimum ${minimum.toLocaleString('en-US')}.`,evidence:metric==='unknown'?[]:[`${metric}: ${value}`],metric,value,observedFields:[...(known(post.views)?['views']:[]),...observed],missingFields:['views',...fields].filter(key=>!known(post[key as keyof SocialPost])),policy};
}
