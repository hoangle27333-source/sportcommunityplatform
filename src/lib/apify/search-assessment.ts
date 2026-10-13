import { applyManualAttributes } from './manual-attributes';
import { accountEvidence, latestOwnedPosts, assessAccountEntity, assessAccountGeography, legacyClassification, selectedEntityTypes, type EntityAssessment, type EntityType } from './account-evidence';
import { sizeRange, topicQueries, type AccountSizeCriteria } from './account-criteria';
import { contextKey } from './discovery-quality';
import { assessProfile } from './discovery-quality';
import { canonicalScopes } from './geography';
import { assessEngagement, hasTopicEvidence, type ContentQuality } from './content-quality';
import type { SocialPost, SocialProfile } from './providers';
import { contentInputHash } from '../scout-experimental/evidence';
export type ResultGroup='Qualified'|'Needs Verification'|'Below Target'|'Excluded';
export type Dimension={state:'passed'|'failed'|'unknown';reason:string;evidence:string[]};
export const EXPERIMENTAL_TOPIC_POLICY_REVISION='owned-text-1';
export function assessAccountSize(profile:Pick<SocialProfile,'followers'|'members'>,criteria:AccountSizeCriteria):Dimension | undefined {
 const {metric,minimum,maximum}=sizeRange(criteria);
 if(minimum===undefined && maximum===undefined)return undefined;
 const observed=profile[metric];const known=typeof observed==='number' && Number.isFinite(observed) && observed>=0;
 const state=!known?'unknown':(minimum===undefined || observed>=minimum) && (maximum===undefined || observed<=maximum)?'passed':'failed';
 const range=[minimum===undefined?'No minimum':minimum.toLocaleString('en-US'),maximum===undefined?'No maximum':maximum.toLocaleString('en-US')].join(' – ');
 return {state,reason:!known?`Observed ${metric} are unknown; range ${range} requires verification.`:state==='passed'?`Observed ${metric} meet the selected range (${range}).`:`Observed ${metric} are outside the selected range (${range}).`,evidence:[`${metric}: ${known?observed.toLocaleString('en-US'):'Unknown'}`]};
}
export function assessProfileFollowers(profile:Pick<SocialProfile,'followers'>,minimum?:number):Dimension | undefined {
 return minimum?assessAccountSize(profile,{minFollowers:minimum}):undefined;
}
export type AccountAssessmentOptions=AccountSizeCriteria & {version?:number;entityTypes?:EntityType[];geographyMode?:'profile'|'profile-or-recent-posts';entityAssessment?:EntityAssessment};
export function assessSearchProfile(profile:SocialProfile,keyword:string,geography:string,target:string, options?: AccountAssessmentOptions) {
 if((options?.version || 0)>=7)return assessExperimentalProfile(profile,keyword,geography,target,options!);
 return assessLegacyProfile(profile,keyword,geography,target,options);
}
function assessLegacyProfile(profile:SocialProfile,keyword:string,geography:string,target:string,options?:AccountAssessmentOptions) {
 const ownedPosts=profile.posts.filter(p=>p.authorUrl===profile.url);
 const evidenceBio=[profile.bio,...ownedPosts.map(p=>p.caption)].filter(Boolean).join('\n');
 const result=assessProfile(profile,keyword,geography,target);
 // Owned posts support the topic, never turn a gym into an athlete or a visit into residency.
 const topic=assessProfile({...profile,bio:evidenceBio},keyword,geography,target);
 if(!result.relevant && topic.relevant){result.relevant=true;result.reasons[0]='Profile matches the search topic';result.evidence=topic.evidence;
  const wrongType=result.classification!=='Unknown' && result.classification!==(target==='Communities & Clubs'?'Community':'Individual');
  result.reviewState=wrongType || result.reasons.includes('Observed location conflicts with selected geography')?'Excluded':result.classification==='Unknown' || !result.locationMatch?'Needs Review':'Matched';
 }
 // Search cards with no biography are incomplete observations, not proof of irrelevance.
 if(!result.relevant && !profile.bio && !profile.category && !ownedPosts.length && (result.classification==='Unknown' || result.classification===(target==='Communities & Clubs'?'Community':'Individual')) && !result.reasons.includes('Observed location conflicts with selected geography'))result.reviewState='Needs Review';
 if ((options?.version || 0) >= 5) {
  const entityAssessment = options?.entityAssessment || assessAccountEntity(profile);
  const geographyAssessment = assessAccountGeography(profile,geography,options?.geographyMode);
  const allowed = selectedEntityTypes(target,options?.entityTypes);
  const range=sizeRange(options || {});
  const followers=(options?.version || 0)>=6?assessAccountSize(profile,options || {}):assessProfileFollowers(profile,options?.minFollowers);
  if((options?.version || 0)>=6){
   const text=[profile.bio,profile.category,...ownedPosts.filter(p=>!p.isRepost).flatMap(p=>[p.caption,...p.hashtags])].filter(Boolean).join('\n');
   result.relevant=!!text && topicQueries(keyword).some(query=>hasTopicEvidence(text,query));
   result.evidence=[profile.bio,profile.category,...ownedPosts.filter(p=>!p.isRepost && topicQueries(keyword).some(query=>hasTopicEvidence([p.caption,...p.hashtags].join(' '),query))).map(p=>p.url)].filter(Boolean);
   result.reasons[0]=result.relevant?'Account biography, category or owned posts support the topic':'Topic is not supported by account evidence';
  }
  const entityState = entityAssessment.status !== 'supported' || entityAssessment.suggestedType === 'Unknown' ? 'unknown' : allowed.includes(entityAssessment.suggestedType) ? 'passed' : 'failed';
  const topicState = result.relevant ? 'passed' : !profile.bio && !profile.category && !ownedPosts.length ? 'unknown' : 'failed';
  const reviewState = entityState === 'failed' || topicState === 'failed' || followers?.state==='failed' ? 'Excluded' : entityState === 'unknown' || topicState === 'unknown' || geographyAssessment.state !== 'passed' || followers?.state==='unknown' ? 'Needs Review' : 'Matched';
  return {...result, classification:legacyClassification(entityAssessment.suggestedType), reviewState, locationMatch:geographyAssessment.state==='passed', verifiedGeography:geographyAssessment.verifiedGeography,
   entityAssessment,geographyAssessment,assessmentVersion:(options?.version || 0)>=6?6:5,
   reasons:[result.reasons[0],`Entity type: ${entityAssessment.suggestedType}`,geographyAssessment.reason,...entityAssessment.missingInformation,...(followers?[followers.reason]:[])],
   resultGroup:reviewState==='Matched'?'Qualified':reviewState==='Needs Review'?'Needs Verification':'Excluded',
   assessment:{...(followers?{[range.metric]:followers}:{}),topic:{state:topicState,reason:result.reasons[0],evidence:result.evidence},entityType:{state:entityState,reason:`Entity type: ${entityAssessment.suggestedType}`,evidence:entityAssessment.evidence},geography:{state:geographyAssessment.state,reason:geographyAssessment.reason,evidence:geographyAssessment.observations.map(o=>o.postUrl || o.raw)}}};
 }
 const resultGroup:ResultGroup=result.reviewState==='Matched'?'Qualified':result.reviewState==='Needs Review'?'Needs Verification':'Excluded';
 return {...result,resultGroup,assessment:{topic:{state:result.relevant?'passed':resultGroup==='Needs Verification'?'unknown':'failed',reason:result.reasons[0],evidence:result.evidence},geography:{state:result.locationMatch?'passed':result.reasons.includes('Observed location conflicts with selected geography')?'failed':'unknown',reason:result.reasons[result.reasons.length-1],evidence:[profile.location].filter(Boolean)},entityType:{state:result.classification==='Unknown'?'unknown':result.classification===(target==='Communities & Clubs'?'Community':'Individual')?'passed':'failed',reason:`Entity type: ${result.classification}`,evidence:[profile.entityType,profile.category].filter(Boolean)}}};
}

function assessExperimentalProfile(profile:SocialProfile,keyword:string,geography:string,target:string,options:AccountAssessmentOptions) {
 const base=assessLegacyProfile(profile,keyword,geography,target,{...options,version:6});
 const e=profile.contentEvidence;
 const valid=e?.revision==='seed-content-1' && e.inputHash===contentInputHash(profile,keyword);
 const owned=latestOwnedPosts(profile);
 // Explicit collected captions/hashtags do not require model availability.
 const textual=owned.filter(p=>topicQueries(keyword).some(query=>hasTopicEvidence([p.caption,...p.hashtags].join(' '),query)));
 const cited=new Set([...textual.map(p=>p.url),...(valid?e.posts.filter(p=>p.topic&&owned.some(o=>o.url===p.url)).map(p=>p.url):[])]);
 const selfRole=valid && ['Athlete','Coach'].includes(e.role || '') && e.roleEvidence.includes(profile.url) && /athlete|coach|huấn luyện viên|vận động viên|\bvdv\b/i.test(`${profile.bio} ${profile.category}`);
 const trustedRole=valid && e.roleSources?.some(source=>source.accountUrl===profile.url);
 const roleSupported=!!selfRole&&cited.size>=1 || !!trustedRole;
 const profileHint=topicQueries(keyword).some(query=>hasTopicEvidence(`${profile.name} ${profile.bio} ${profile.category}`,query));
 const missingAnalysis=!valid?' Media analysis is unavailable for the current evidence.':'';
 const topic:Dimension={state:cited.size>=3||roleSupported?'passed':'unknown',reason:cited.size>=3?'Multiple owned posts support the sport.':trustedRole?'A collected trusted publisher explicitly links this account to the sport role.':roleSupported?'Declared athlete or coach role and owned content support the sport.':cited.size?`${cited.size.toLocaleString('en-US')} distinct owned post${cited.size===1?' supports':'s support'} the sport; 3 or a verified sport role are required.${missingAnalysis}`:profileHint?`Profile text contains a topic hint, but no owned sport posts or verified sport role are confirmed.${missingAnalysis}`:`No owned sport posts or verified sport role are confirmed.${missingAnalysis}`,evidence:[...cited,...(trustedRole?e!.roleSources.map(source=>source.url):[])]};
 // A media sample has no authority to identify faces. Only explicit profile/post evidence is used.
 const reviewed=options.entityAssessment?.source==='review'?options.entityAssessment:undefined;
 const type=reviewed?.suggestedType || (valid?e.entityType:'Unknown');
 const entityAssessment:EntityAssessment=reviewed || {suggestedType:type,status:type==='Unknown'?'uncertain':'supported',source:'model',modelVersion:valid?e.model:'unavailable',evidenceHash:valid?e.inputHash:contentInputHash(profile,keyword),evidence:valid?e.identityEvidence:[],missingInformation:type==='Unknown'?['Account identity is unverified.']:[]};
 const entityType:Dimension={state:type==='Unknown'?'unknown':selectedEntityTypes(target,options.entityTypes).includes(type)?'passed':'failed',reason:`Entity type: ${type}`,evidence:entityAssessment.evidence};
 const sportProfile={...profile,posts:owned.filter(p=>cited.has(p.url))};
 const geo={...assessAccountGeography(sportProfile,geography,'profile-or-recent-posts'),coverage:accountEvidence(profile).coverage};
 const geographyDimension:Dimension={state:geo.state,reason:geo.state==='passed'&&geo.observations.some(o=>o.source==='geotag')?`Content observed in ${geography}.`:geo.reason,evidence:geo.observations.filter(o=>o.source!=='mention').map(o=>o.postUrl || o.raw)};
 const assessment={...base.assessment,topic,entityType,geography:geographyDimension};
 const dimensions=Object.values(assessment) as Dimension[];
 const reviewState=dimensions.some(d=>d.state==='failed')?'Excluded':dimensions.every(d=>d.state==='passed')?'Matched':'Needs Review';
 return {...base,relevant:topic.state==='passed',classification:legacyClassification(type),entityAssessment,geographyAssessment:{...geo,reason:geographyDimension.reason},assessmentVersion:7,assessment,evidence:topic.evidence,locationMatch:geo.state==='passed',verifiedGeography:geo.verifiedGeography,reasons:[topic.reason,entityType.reason,geographyDimension.reason,...Object.entries(assessment).filter(([k])=>['followers','members'].includes(k)).map(([,d])=>d!.reason),...(valid&&e.commercialActivity?['Commercial activity']:[])],reviewState,resultGroup:reviewState==='Matched'?'Qualified':reviewState==='Excluded'?'Excluded':'Needs Verification'} as typeof base;
}
/** Negative feedback remains active unless a newer, scoped manual review replaces it. */
export function activeNegativeFeedback(profile:Pick<SocialProfile,'platform'|'url'|'manualAttributeReview'>,keyword:string,geography:string,feedback:any[]) {
 const review=profile.manualAttributeReview;
 return feedback.find(f=>f.account_key===`${profile.platform}:${profile.url}` && f.context_key===contextKey(keyword,geography) && ['Not Relevant','Wrong Location'].includes(f.reason) && (!review || review.contextKey!==contextKey(keyword,geography) || !f.created_at || f.created_at>review.confirmedAt));
}
/** Shared review feedback is applied before counting, previewing or importing an account. */
export function assessReviewedProfile(profile:SocialProfile,keyword:string,geography:string,target:string,options:AccountAssessmentOptions | undefined,feedback:any[]=[]) {
 const accountKey=`${profile.platform}:${profile.url}`;
 const applicable=feedback.filter(f=>f.account_key===accountKey);
 const correction=applicable.find(f=>f.classification && ['Correct Classification','Wrong Entity Type'].includes(f.reason));
 const entityAssessment=options?.entityAssessment || assessAccountEntity(profile);
 const correctedType=correction?(correction.entity_type || (correction.classification==='Individual'?'Individual':correction.classification==='Community'?'Community':correction.classification==='Brand/Business'?'Brand/Business':'Unknown')):undefined;
 const automatic=assessSearchProfile(profile,keyword,geography,target,correctedType && options?{...options,entityAssessment:{...entityAssessment,suggestedType:correctedType,reviewedType:correctedType,status:correctedType==='Unknown'?'uncertain':'supported',source:'review'}}:options);
 const assessment=applyManualAttributes(automatic,profile.manualAttributeReview,keyword,geography);
 if(correction)assessment.reasons.push('Entity type confirmed by team review');
 const rejected=activeNegativeFeedback(profile,keyword,geography,applicable);
 if(rejected){assessment.reviewState='Excluded';assessment.resultGroup='Excluded';assessment.reasons.push(`Team feedback: ${rejected.reason}`);}
 return assessment;
}
export function assessSearchContent(post:SocialPost,criteria:ContentQuality & {keyword:string;searchMode:string;geography:string|string[];newerThan:string}) {
 const reasons:string[]=[];const assessment:Record<string,Dimension>={};
 const topicMatch=hasTopicEvidence([post.caption,...post.hashtags.map(t=>`#${t}`)].join(' '),criteria.keyword);
 const exact=criteria.searchMode!=='hashtag' || post.hashtags.some(t=>t.replace(/^#/,'').toLowerCase().normalize('NFC')===criteria.keyword.replace(/^#/,'').toLowerCase().normalize('NFC'));
 const topicState=!exact?'failed':topicMatch?'passed':post.caption || post.hashtags.length?'failed':'unknown';
 assessment.topic={state:topicState,reason:!exact?'The requested hashtag is absent.':topicMatch?'Observed caption or hashtags support the topic.':'Topic evidence is missing or unrelated.',evidence:[post.caption,...post.hashtags]};
 const scopes=canonicalScopes(criteria.geography);const geoResults=(Array.isArray(scopes)?scopes:[scopes]).map(scope=>assessProfile({name:'',bio:post.caption,url:post.authorUrl,location:post.location},'running',scope,'Individual KOLs'));
 const geoState=geoResults.some(g=>g.locationMatch)?'passed':geoResults.every(g=>g.reasons.includes('Observed location conflicts with selected geography'))?'failed':'unknown';
 assessment.geography={state:geoState,reason:geoState==='passed'?'Location meets the selected scope.':geoState==='failed'?'Observed location conflicts with the selected scope.':'Location is unverified.',evidence:[post.location || '',post.caption].filter(Boolean)};
 const dateState=!post.publishedAt?'unknown':post.publishedAt<criteria.newerThan?'failed':'passed';
 assessment.recency={state:dateState,reason:dateState==='unknown'?'Publication date is unknown.':dateState==='failed'?'The post is older than the selected window.':'Publication date meets the selected window.',evidence:post.publishedAt?[post.publishedAt]:[]};
 const engagement=criteria.qualityMode!=='high-engagement'?{state:'matched',reason:'No engagement threshold selected.'}:post.views!==null && post.views>=(criteria.minViews ?? 10000)?{state:'matched',reason:'Observed views meet the threshold.'}:post.likes===null || post.comments===null?{state:'unverified',reason:'Interaction counts are incomplete and views do not verify the threshold.'}:assessEngagement(post,criteria);
 assessment.engagement={state:engagement.state==='matched'?'passed':engagement.state==='unverified'?'unknown':'failed',reason:engagement.reason,evidence:[`Likes: ${post.likes ?? 'Unknown'}`,`Comments: ${post.comments ?? 'Unknown'}`,`Views: ${post.views ?? 'Unknown'}`]};
 for(const d of Object.values(assessment))if(d.state!=='passed')reasons.push(d.reason);
 const resultGroup:ResultGroup=topicState==='failed' || assessment.geography.state==='failed'?'Excluded':Object.values(assessment).some(d=>d.state==='unknown')?'Needs Verification':dateState==='failed' || assessment.engagement.state==='failed'?'Below Target':'Qualified';
 return {resultGroup,reviewState:resultGroup,assessment,reasons,reason:reasons.join(' ') || 'All selected criteria are supported by observed evidence.'};
}
export function groupCounts(items:{resultGroup:ResultGroup}[]) {
 return {qualified:items.filter(i=>i.resultGroup==='Qualified').length,unverified:items.filter(i=>i.resultGroup==='Needs Verification').length,belowTarget:items.filter(i=>i.resultGroup==='Below Target').length,excluded:items.filter(i=>i.resultGroup==='Excluded').length};
}
