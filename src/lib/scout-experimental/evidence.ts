import { createHash } from 'node:crypto';
import { topicQueries } from '../apify/account-criteria';
import { hasTopicEvidence } from '../apify/content-quality';
import { canonicalUrl } from '../apify/discovery-quality';
import { latestOwnedPosts, assessAccountEntity, ENTITY_TYPES } from '../apify/account-evidence';
import type { SocialProfile } from '../apify/providers';
import type { ContentEvidence } from './types';
import { EXPERIMENTAL_REVISION } from './types';
export function contentInputHash(p:SocialProfile,topic:string) {
 return createHash('sha256').update(JSON.stringify({revision:EXPERIMENTAL_REVISION,topic,url:p.url,bio:p.bio,name:p.name,category:p.category,entityType:p.entityType,posts:latestOwnedPosts(p).map(x=>({url:x.url,caption:x.caption,location:x.location,publishedAt:x.publishedAt,thumbnailUrl:x.thumbnailUrl,videoUrl:x.videoUrl}))})).digest('hex');
}
/** Validate every citation against collected input. Model output cannot invent posts or role sources. */
export function validateContentEvidence(raw:any,p:SocialProfile,topic:string,model:string,mediaPostUrls:string[]=[],videoPostUrls:string[]=[]):ContentEvidence {
 const posts=latestOwnedPosts(p);const urls=new Set(posts.map(x=>canonicalUrl(x.url)));
 const linked=(values:unknown)=>Array.isArray(values)?values.filter(x=>typeof x==='string'&&(x===p.url || urls.has(canonicalUrl(x)))).slice(0,10):[];
 const evidence:ContentEvidence={revision:EXPERIMENTAL_REVISION,inputHash:contentInputHash(p,topic),model,observedAt:new Date().toISOString(),entityType:ENTITY_TYPES.includes(raw?.entityType)?raw.entityType:'Unknown',identityEvidence:linked(raw?.identityEvidence),commercialActivity:raw?.commercialActivity===true,role:['Athlete','Coach','Creator','Player'].includes(raw?.role)?raw.role:'Unknown',roleEvidence:linked(raw?.roleEvidence),posts:[],roleSources:[]};
 const seen=new Set<string>();
 for(const item of Array.isArray(raw?.posts)?raw.posts:[]){const url=canonicalUrl(String(item.url||''));if(!urls.has(url)||seen.has(url))continue;seen.add(url);
  const post=posts.find(x=>canonicalUrl(x.url)===url)!;
  const modality=item.modality==='video'&&videoPostUrls.includes(url)?'video':item.modality==='image'&&mediaPostUrls.includes(url)?'image':'text';
  const excerpt=String(item.excerpt||'').slice(0,600);
  // Visual claims require an actually supplied image/video. Text claims must quote the post.
  const text=`${post.caption} ${post.hashtags.join(' ')}`;
  const supported=modality!=='text'?!!excerpt:!!excerpt&&text.includes(excerpt)&&topicQueries(topic).some(query=>hasTopicEvidence(text,query));
  evidence.posts.push({url,topic:item.topic===true&&supported,modality,excerpt,...(modality==='video'&&typeof item.timestamp==='number'&&item.timestamp>=0&&item.timestamp<=30?{timestamp:item.timestamp}:{})});
 }
 if(!evidence.identityEvidence.length)evidence.entityType=assessAccountEntity(p).suggestedType==='Individual'?'Individual':'Unknown';
 return evidence;
}
