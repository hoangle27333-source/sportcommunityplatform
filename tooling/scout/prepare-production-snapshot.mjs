/** Prepare a deployable snapshot without local credentials or build caches. */
import { cp, copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = process.cwd();
// Missing build configuration must fail preparation rather than produce an unstyled release.
const required = ['package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json',
  'postcss.config.cjs', 'tailwind.config.ts', 'vercel.json', '.vercelignore'];
for (const file of required) await readFile(path.join(root, file));
const snapshot = await mkdtemp(path.join(tmpdir(), 'sport-production-'));
for (const directory of ['src', 'public']) {
  await cp(path.join(root, directory), path.join(snapshot, directory), {
    recursive: true,
    filter: source => !source.includes(`${path.sep}scout-workspace-qa`) && path.basename(source) !== '.DS_Store',
  });
}
for (const file of required) await copyFile(path.join(root, file), path.join(snapshot, file));
for (const file of ['next-env.d.ts', '.env.example']) {
  try { await copyFile(path.join(root, file), path.join(snapshot, file)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await mkdir(path.join(snapshot, '.vercel'));
await copyFile(path.join(root, '.vercel/project.json'), path.join(snapshot, '.vercel/project.json'));
const config = JSON.parse(await readFile(path.join(snapshot, 'tsconfig.json'), 'utf8'));
config.include = ['next-env.d.ts', 'src/**/*.ts', 'src/**/*.tsx', '.next/types/**/*.ts'];
await writeFile(path.join(snapshot, 'tsconfig.json'), JSON.stringify(config, null, 2) + '\n');
console.log(snapshot);
