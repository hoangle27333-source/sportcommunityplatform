import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

// An ephemeral container: never connects to an application's database.
const container = `scout-post-qa-${randomUUID().slice(0, 8)}`;
function command(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] }); let output = '', error = '';
    child.stdout.on('data', data => output += data); child.stderr.on('data', data => error += data);
    child.on('error', reject); child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(error || output || `docker exited ${code}`)));
    child.stdin.end(input);
  });
}
const sql = text => command(['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], text);
const post = '00000000-0000-4000-8000-000000000010', kol = '00000000-0000-4000-8000-000000000001';
try {
  await command(['run', '--detach', '--rm', '--name', container, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:18-alpine']);
  let ready = false;
  for (let i = 0; i < 40; i++) { try { await sql('select 1;'); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 250)); } }
  assert(ready, 'Temporary PostgreSQL did not become ready.');
  await sql(`create role anon; create role authenticated; create role service_role;
    create table kols(id uuid primary key); create table communities(id uuid primary key);
    create table scouted_posts(id uuid primary key,kol_id uuid references kols,community_id uuid references communities,scout_provenance jsonb);
    create table scout_sessions(id uuid primary key,kind text,params jsonb);
    create table scout_provider_runs(id uuid primary key,session_id uuid,provider_run_id text);
    insert into kols values('${kol}'); insert into scouted_posts values('${post}',null,null,null);
    insert into scout_sessions values('00000000-0000-4000-8000-000000000020','trends','{"keyword":"Chạy bộ"}');
    insert into scout_provider_runs values('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000020','observed-provider-run');
    insert into scouted_posts values('00000000-0000-4000-8000-000000000011',null,null,'{"runId":"observed-provider-run"}');`);
  const migration = await readFile('supabase/migrations/20261013030000_scout_post_workspaces.sql', 'utf8');
  await sql(migration); await sql(migration);
  assert.equal(await sql(`select collection_sources->0->>'kind' from scouted_posts where id='00000000-0000-4000-8000-000000000011';`), 'topic');
  assert.equal(await sql(`select jsonb_array_length(collection_sources) from scouted_posts where id='${post}';`), '0');
  const merge = (source, account = 'null') => `select merge_scout_post_metadata('${post}','TikTok:https://tiktok.com/@runner','https://tiktok.com/@runner','${JSON.stringify(source)}'::jsonb,${account});`;
  // Two transactions contend for the same row: both discovery paths must survive.
  await Promise.all([
    sql(`begin; select id from scouted_posts where id='${post}' for update; select pg_sleep(0.2); ${merge({ kind: 'topic', sessionId: 'topic-session' })} commit;`),
    sql(merge({ kind: 'account', sessionId: 'account-session' }, `'${JSON.stringify({ entityType: 'kol', id: kol })}'::jsonb`)),
  ]);
  assert.equal(await sql(`select jsonb_array_length(collection_sources) from scouted_posts where id='${post}';`), '2');
  await sql(merge({ kind: 'topic', sessionId: 'topic-session' }));
  assert.equal(await sql(`select jsonb_array_length(collection_sources) from scouted_posts where id='${post}';`), '2');
  assert.equal(await sql(`select kol_id from scouted_posts where id='${post}';`), kol);
  await assert.rejects(() => sql(`select merge_scout_post_metadata('${post}','TikTok:https://tiktok.com/@other','https://tiktok.com/@other',null,null);`), /POST_AUTHOR_CONFLICT/);
  await assert.rejects(() => sql(`select merge_scout_post_metadata('${post}',null,null,'{}',null);`), /INVALID_POST_SOURCE/);
  await assert.rejects(() => sql(`set role authenticated; ${merge({ kind: 'topic' })}`), /permission denied/);
  console.log('Post workspace migration passed: rerun/backfill, row-lock concurrency, source union, exact author linking, conflict guards, authenticated RPC denial.');
} finally {
  await command(['rm', '--force', container]).catch(() => {});
}
