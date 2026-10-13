import { unrestrictedGeography } from './geography';
import {assessProfile,tokens} from './discovery-quality';
import type {SocialPost} from './providers';
function topicTokens(text:string) {
 // Recognize explicit sport phrases inside hashtags, without treating arbitrary substrings as evidence.
 const expanded=text.replace(/#[\p{L}\p{N}_]+/gu,tag=>{const plain=tag.slice(1).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return /^(?:badminton|caulong|(?:giai|tap|danh|choi|hoc|yeu|congdong|clb|hoi)caulong)/.test(plain)?`${tag} badminton`:tag;});
 return tokens(expanded).join(' ').replace(/\bcau long\b|\bcaulong(?:vietnam)?\b/g,'badminton').split(' ').filter(Boolean);
}
export function hasTopicEvidence(text:string,keyword:string) {
 const query=topicTokens(keyword).filter(t=>!['vietnam','hcm','hanoi','danang','tp','city','nationwide'].includes(t));
 const evidence=new Set(topicTokens(text));
 return query.length>0 && query.every(t=>evidence.has(t));
}
export function assessTopicPost(post:SocialPost,keyword:string,geography:string|string[],newerThan:string) {
 if(!hasTopicEvidence(post.caption,keyword))return {state:'excluded',reason:'The caption does not support the search topic.'};
 const scopes=Array.isArray(geography)?geography:[geography];
 const location=scopes.some(scope=>unrestrictedGeography(scope) || assessProfile({name:'',bio:post.caption,url:post.authorUrl,location:post.location},'running',tokens(scope).filter(t=>!['tp','city'].includes(t)).join(' '),'Individual KOLs').locationMatch);
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

/** Pure search assessment: query context never counts as observed evidence. */
export function assessSearchPost(post:SocialPost, criteria:ContentQuality & {keyword:string; searchMode:string; geography:string|string[]; newerThan:string}) {
 if(criteria.searchMode==='hashtag' && !post.hashtags.some(tag=>tag.replace(/^#/,'').normalize('NFC').toLowerCase()===criteria.keyword.replace(/^#/,'').normalize('NFC').toLowerCase())) return {state:'excluded',reason:'The requested hashtag is absent.'};
 const topic=assessTopicPost({...post,caption:[post.caption,...post.hashtags.map(tag=>`#${tag.replace(/^#/,'')}`)].join(' ')},criteria.keyword,criteria.geography,criteria.newerThan);
 if(topic.state!=='matched') return topic;
 if(criteria.qualityMode!=='high-engagement')return topic;
 const qualifyingViews=post.views!==null && post.views>=(criteria.minViews ?? 10000);
 if(!qualifyingViews && (post.likes===null || post.comments===null))return {state:'unverified',reason:'Interaction counts are incomplete and observed views do not verify the selected threshold.'};
 return assessEngagement(post,criteria);
}
