import dotenv from 'dotenv'; import {resolve4,resolve6} from 'node:dns/promises';
dotenv.config({path:'.env.local',quiet:true});const host=new URL(process.env.DATABASE_URL).hostname;
for(const resolve of [resolve4,resolve6])try{const a=await resolve(host);console.log(resolve.name,a.length ? 'available' : 'empty');}catch(e){console.log(resolve.name,e.code);}
