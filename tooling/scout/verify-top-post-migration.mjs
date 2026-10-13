import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.SCOUT_PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
try {
 await db.exec('create table scouted_posts(id int primary key);insert into scouted_posts values (1);');
 const sql=await readFile('supabase/migrations/20261013000000_scout_top_posts.sql','utf8');
 await db.exec(sql);await db.exec(sql);
 assert.equal((await db.query('select shares from scouted_posts')).rows[0].shares,null);
 await assert.rejects(()=>db.exec('update scouted_posts set shares=-1'),/check constraint/);
 await db.exec('update scouted_posts set shares=0');
 assert.equal(Number((await db.query('select shares from scouted_posts')).rows[0].shares),0);
 console.log('Shares migration passed: idempotency, historical unknown, observed zero and negative validation.');
} finally {await db.close();}
