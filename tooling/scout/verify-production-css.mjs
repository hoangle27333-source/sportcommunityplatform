/** Fail release verification when Tailwind directives were not compiled. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const origin = process.argv[2] || 'https://sportcommunityplatform.vercel.app';
const response = await fetch(new URL('/login', origin));
assert.equal(response.status, 200, 'Login document must load');
const html = await response.text();
const styles = [...html.matchAll(/<link\b[^>]*>/g)]
  .filter(([tag]) => /rel="stylesheet"/.test(tag))
  .map(([tag]) => tag.match(/href="([^"]+)"/)?.[1]).filter(Boolean);
assert.ok(styles.length, 'Document must reference a stylesheet');
const assets = [];
let combined = '';
for (const href of styles) {
  const url = new URL(href.replaceAll('&amp;', '&'), origin);
  assert.equal(url.origin, new URL(origin).origin, 'Verify same-origin styles only');
  const asset = await fetch(url);
  assert.equal(asset.status, 200, `Stylesheet unavailable: ${url.pathname}`);
  assert.match(asset.headers.get('content-type') || '', /text\/css/);
  const css = await asset.text();
  combined += css;
  assets.push({ path: url.pathname, status: asset.status, bytes: Buffer.byteLength(css) });
}
assert.ok(!/@tailwind\s+(?:base|components|utilities)/.test(combined), 'Uncompiled Tailwind directives');
assert.ok(/\.flex\s*\{\s*display:\s*flex/.test(combined), 'Missing flex utility');
assert.ok(/\.grid\s*\{\s*display:\s*grid/.test(combined), 'Missing grid utility');
assert.ok(/--tw-/.test(combined), 'Missing Tailwind generated styles');
const receipt = { checkedAt: new Date().toISOString(), origin, passed: true, assets };
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
