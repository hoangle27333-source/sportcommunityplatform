import { canonicalUrl, platformMatches, urlKind } from '../apify/discovery-quality';
import { createHash } from 'node:crypto';
export function seedUrl(value:string) {
 const url=canonicalUrl(value.trim());
 const platform=['Facebook','TikTok','Instagram'].find(p=>platformMatches(p,url));
 if(!platform || !['profile','group'].includes(urlKind(url)))throw new Error('Seed must be a supported account URL.');
 return {url,platform};
}
export function historicalFollowers(value:unknown):number|null {
 if(value===null || value===undefined || value==='')return null;
 if(typeof value==='number')return Number.isFinite(value)&&value>=0?Math.round(value):null;
 const text=String(value).trim().toLowerCase();
 const match=text.match(/^(\d+(?:[.,]\d+)?)\s*([km])$/);
 if(match)return Math.round(Number(match[1].replace(',','.'))*(match[2]==='k'?1000:1000000));
 return /^\d+(?:,\d{3})*$/.test(text)?Number(text.replaceAll(',','')):null;
}
export function ingestSeedRows(rows:unknown[][],fileName:string,checksum:string,sheet:string) {
 const records=new Map<string,any>();const rawUrls=new Set<string>();let profileRows=0;
 rows.forEach((row,index)=>{
  if(typeof row[3]!=='string' || !row[3].startsWith('http'))return;
  rawUrls.add(row[3]);const url=canonicalUrl(row[3]);
  const platform=['Facebook','TikTok','Instagram'].find(p=>platformMatches(p,url));
  if(!platform)throw new Error(`Unsupported source URL at row ${index+1}.`);
  const identity={url,platform,needsResolution:!['profile','group'].includes(urlKind(url))};profileRows++;
  const source={sheet,row:index+1,raw:row.slice(0,7)};
  const previous=records.get(identity.url);
  if(previous){previous.sources.push(source);return;}
  records.set(identity.url,{...identity,name:String(row[2]||''),sport:({Road:'Running/Road',Trail:'Trail',Tri:'Triathlon'} as Record<string,string>)[String(row[1])] || String(row[1]||''),historicalFollowers:historicalFollowers(row[4]),historicalRegion:row[5]||null,note:row[6]||null,sources:[source]});
 });
 return {id:createHash('sha256').update(checksum+sheet).digest('hex'),fileName,checksum,sheet,profileRows,rawUniqueUrls:rawUrls.size,records:[...records.values()]};
}
