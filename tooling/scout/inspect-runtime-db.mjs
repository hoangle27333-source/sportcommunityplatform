import {readFileSync} from 'node:fs';
import dotenv from 'dotenv'; import pg from 'pg';
dotenv.config({path:'.env.local',quiet:true});
const url=new URL(process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL);const host=url.hostname;
const client=new pg.Client({host,port:Number(url.port || 5432),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:url.pathname.slice(1),connectionTimeoutMillis:5000,ssl:{rejectUnauthorized:true,servername:host,ca:readFileSync(new URL('./supabase-ca.crt',import.meta.url),'utf8')}});
try {await client.connect();const tables=await client.query("select to_regclass('public.scout_sessions') sessions,to_regclass('public.scout_provider_runs') provider_runs,to_regclass('supabase_migrations.schema_migrations') history");console.log(tables.rows);
if(tables.rows[0].history)console.log((await client.query('select version from supabase_migrations.schema_migrations order by version desc limit 5')).rows);
console.log((await client.query("select column_name from information_schema.columns where table_name='scout_sessions'")).rows.map(r=>r.column_name));
}catch(e){console.log(e.message);process.exitCode=1;}finally{await client.end();}
