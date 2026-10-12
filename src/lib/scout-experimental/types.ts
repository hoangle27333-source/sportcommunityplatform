import type { EntityType } from '../apify/account-evidence';
export const EXPERIMENTAL_REVISION = 'seed-content-1';
export type ProviderId = 'apify' | 'brave' | 'brightdata' | 'gemini';
export type Operation = 'discovery' | 'profile' | 'posts' | 'analysis';
export type ProviderSelection = { discovery: 'apify'|'brave'; profile: 'apify'|'brightdata'; posts: 'apify'|'brightdata' };
export type TrialCapability = {
 id:string; provider:ProviderId; operation:Operation; platform:string; revision:string;
 verified:boolean; expires_at:string; total_units:number; used_units:number;
 units_per_request:number; max_value_usd:number; config:Record<string,any>;
};
export type ContentEvidence = {
 revision:typeof EXPERIMENTAL_REVISION; inputHash:string; model:string; observedAt:string;
 entityType:EntityType; identityEvidence:string[]; commercialActivity:boolean;
 role?:'Athlete'|'Coach'|'Creator'|'Player'|'Unknown'; roleEvidence:string[];
 posts:{url:string; topic:boolean; modality:'text'|'image'|'video'; excerpt:string; timestamp?:number}[];
 roleSources:{url:string; accountUrl:string; sport:string; role:'Athlete'|'Coach'; quote:string; publisher:string}[];
 usage?:{inputTokens:number;outputTokens:number;estimatedUsd:number;pricingRevision:string};
 mediaHashes?:Record<string,string>;
};
export type DiscoveryPath = {method:string; sourceUrl:string; query?:string; seedUrl?:string; depth:number};
