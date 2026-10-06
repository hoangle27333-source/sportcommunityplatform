import {assessProfile,tokens} from './discovery-quality';
import type {SocialPost} from './providers';
function topicTokens(text:string) {
 return tokens(text).join(' ').replace(/\bcau long\b|\bcaulong(?:vietnam)?\b/g,'badminton').split(' ').filter(Boolean);
}
export function assessTopicPost(post:SocialPost,keyword:string,geography:string|string[],newerThan:string) {
 const query=topicTokens(keyword).filter(t=>!['vietnam','hcm','hanoi','danang','tp','city','nationwide'].includes(t));
 const evidence=new Set(topicTokens(post.caption));
 if(!query.length || !query.every(t=>evidence.has(t)))return {state:'excluded',reason:'The caption does not support the search topic.'};
 const scopes=Array.isArray(geography)?geography:[geography];
 const location=scopes.some(scope=>assessProfile({name:'',bio:post.caption,url:post.authorUrl,location:post.location},'running',tokens(scope).filter(t=>!['tp','city'].includes(t)).join(' '),'Individual KOLs').locationMatch);
 if(!location && tokens(`${post.location} ${post.caption}`).some(t=>['hanoi','hcm','danang'].includes(t)))return {state:'excluded',reason:'Observed city evidence does not match the selected geography.'};
 if(!location)return {state:'unverified',reason:'The caption and provider location do not verify the selected geography.'};
 if(!post.publishedAt)return {state:'unverified',reason:'The provider did not return a usable publication date.'};
 if(post.publishedAt<newerThan)return {state:'excluded',reason:'The post is older than this collection window.'};
 return {state:'matched',reason:'Topic, geography and publication date are supported by observed evidence.'};
}

export interface ContentQuality { qualityMode?: 'high-engagement' | 'topic'; minInteractions?: number; minViews?: number; recentDays?: number; }
export function observedInteractions(post:SocialPost) {
 // Missing observations are not zero; known counts provide a conservative lower bound.
 return post.likes === null && post.comments === null ? null : (post.likes ?? 0) + (post.comments ?? 0);
}
export function assessEngagement(post:SocialPost,quality:ContentQuality) {
 const interactions=observedInteractions(post);
 const minInteractions=quality.minInteractions ?? 100, minViews=quality.minViews ?? 10000;
 if((interactions !== null && interactions >= minInteractions) || (post.views !== null && post.views >= minViews))return {state:'matched',reason:'Observed interactions or views meet the selected threshold.'};
 if(interactions === null && post.views === null)return {state:'unverified',reason:'The provider returned no usable interaction or view counts.'};
 return {state:'excluded',reason:`Observed metrics do not meet ${minInteractions.toLocaleString('en-US')} likes + comments or ${minViews.toLocaleString('en-US')} views. Missing metrics remain unknown.`};
}
export function comparePostEngagement(a:SocialPost,b:SocialPost) {
 return (observedInteractions(b) ?? -1)-(observedInteractions(a) ?? -1) || (b.views ?? -1)-(a.views ?? -1) || (b.publishedAt || '').localeCompare(a.publishedAt || '') || a.url.localeCompare(b.url);
}
