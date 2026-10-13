import { parseProfile,parsePost,type SocialProfile } from '../apify/providers';
import { canonicalUrl,platformMatches,urlKind } from '../apify/discovery-quality';
/** New-schema mapping stays isolated from historical session parsers. */
export function experimentalApifyProfile(row:any,platform:string) {
 const p=parseProfile({...row,bio:row.biography || row.bio || [row.intro,row.work || row.WORK].filter(Boolean).join('\n'),location:row.location || row.address || row.current_city || row.CURRENT_CITY},platform);
 if(!p)return null;
 const ids=[row.facebookId,row.pageId].filter((id:any)=>/^\d+$/.test(String(id))).map(String);
 const aliases=[p.url,row.profileUrl,row.pageUrl,row.facebookUrl,...(platform==='Facebook'?ids.map((id:string)=>`https://facebook.com/${id}`):[])].filter(Boolean).map(canonicalUrl);
 return {...p,providerAccountIds:ids,identityAliases:[...new Set<string>(aliases)]};
}
export function experimentalApifyPost(row:any,p:SocialProfile) {
 const post=parsePost({...row,thumbnailUrl:row.thumbnailUrl || row.media?.[0]?.thumbnail || row.media?.[0]?.photo_image?.uri},p.platform);
 if(!post)return null;
 // Facebook emits numeric author URLs while discovery returns vanity URLs.
 // Bind only through the exact account ID observed in profile details, never a name/input URL.
 if(p.platform==='Facebook' && row.user?.id && p.providerAccountIds?.includes(String(row.user.id)))post.authorUrl=p.url;
 const links=Array.isArray(row.collaborators)?row.collaborators.flatMap((c:any)=>{
  const url=canonicalUrl(c.profileUrl || c.url || (p.platform==='Facebook'&&/^\d+$/.test(String(c.id || ''))?`https://facebook.com/${c.id}`:''));
  return platformMatches(p.platform,url)&&['profile','group'].includes(urlKind(url))?[url]:[];
 }):[];
 post.publicLinks=[...new Set([...(post.publicLinks || []),...links])];
 return post;
}
