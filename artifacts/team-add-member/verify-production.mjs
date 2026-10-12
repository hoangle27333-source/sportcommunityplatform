import { writeFile } from 'node:fs/promises';
const base = 'https://sportcommunityplatform.vercel.app';
const results = await Promise.all([
  ['login', '/login'], ['team', '/team'],
  ['createMemberUnauthenticated', '/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }],
  ['workflowFixture', '/api/sport-hub/scout/workflow-fixture'],
].map(async ([name, route, options]) => {
  const response = await fetch(base + route, { ...options, redirect: 'manual' });
  const body = await response.text();
  return { name, status: response.status, ...(name === 'createMemberUnauthenticated' ? { body, location: response.headers.get('location') } : {}), ...(name === 'team' ? { html: body } : {}) };
}));
const team = results.find(r => r.name === 'team');
const scripts = [...team.html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
let featureFound = false;
for (const script of scripts) {
  const body = await (await fetch(new URL(script, base))).text();
  if (body.includes('Add Member') && body.includes('member-password') && body.includes('/api/users')) featureFound = true;
}
delete team.html;
const receipt = { recordedAt: new Date().toISOString(), productionUrl: base, deployment: 'dpl_FQgGULeJ9rFoHDVkXMKkr96onEKW', results, deployedAddMemberBundle: featureFound, accountCreatedDuringVerification: false };
await writeFile(new URL('./production-smoke.json', import.meta.url), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt, null, 2));
if (results[0].status !== 200 || team.status !== 200 || !(results[2].status === 401 || (results[2].status === 307 && results[2].location?.startsWith('/login'))) || results[3].status !== 404 || !featureFound) process.exitCode = 1;
