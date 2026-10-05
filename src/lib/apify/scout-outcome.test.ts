import {describe,it,expect} from 'vitest';
import {scoutOutcome} from './scout-outcome';
import {metadataIdentity} from './metadata-identity';
describe('failure and identity truthfulness',()=>{
 it('restores failed status for the old single-platform budget exhaustion receipt',()=>{expect(scoutOutcome('kol-posts',{platform:['Instagram']},{success:true,partial:true,counts:{failed:1,inserted:0,refreshed:0,duplicate:0},posts:[],warnings:['Instagram: Scout budget exhausted.']})).toMatchObject({success:false,partial:false,code:'BUDGET_EXHAUSTED',httpStatus:409});});
 it('keeps legitimate zero results and multi-platform partial success',()=>{expect(scoutOutcome('kol-posts',{platform:['Instagram']},{success:true,counts:{failed:0,inserted:0},posts:[]})).toMatchObject({success:true});expect(scoutOutcome('trends',{platform:['Instagram','Facebook']},{success:true,partial:true,counts:{failed:1,inserted:0},posts:[]})).toMatchObject({success:true,partial:true});});
 it('rejects platform boilerplate while preserving original entity names',()=>{for(const name of ['Instagram','Facebook','Log in to Instagram','Instagram - Log In'])expect(metadataIdentity(name)).toBe('');expect(metadataIdentity('Đỗ Kim Phúc')).toBe('Đỗ Kim Phúc');expect(metadataIdentity('Facebook Gaming Vietnam')).toBe('Facebook Gaming Vietnam');});
});
