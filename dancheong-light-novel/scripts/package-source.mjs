import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { zipSync } from 'fflate';

// Explicit source roots keep checkout-local credentials, saves and build output
// out of the public download. This also works in an extracted ZIP without Git.
const root = fileURLToPath(new URL('../', import.meta.url));
const sourceRoots = [
  '.gitignore', '.npmrc', '.openai/hosting.json', 'README.md',
  'package.json', 'package-lock.json', 'cloudflare-env.d.ts', 'components.json',
  'drizzle.config.ts', 'eslint.config.mjs', 'next.config.ts',
  'postcss.config.mjs', 'tsconfig.json', 'vite.config.ts',
  'app', 'build', 'components', 'db', 'docs', 'drizzle', 'examples',
  'hooks', 'lib', 'public', 'scripts', 'tests', 'vendor',
];
const generated = new Set(['public/downloads', 'public/vn-runtime']);
const privateName = /^(?:\.env(?:\..*)?|credentials(?:\..*)?|secrets(?:\..*)?)$|\.(?:pem|key|p12|pfx|log|tsbuildinfo)$/iu;
const entries = {};
const manifest = [];
const prefix = 'dancheong-light-novel/';

async function collect(relative) {
  if (generated.has(relative)) return;
  const absolute = path.join(root, relative);
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink()) throw new Error(`Source archive cannot include a symlink: ${relative}`);
  if (stat.isDirectory()) {
    const children = (await readdir(absolute)).sort();
    for (const name of children) {
      if (name.startsWith('.') || name === 'node_modules' || privateName.test(name)) continue;
      await collect(`${relative}/${name}`);
    }
    return;
  }
  if (!stat.isFile()) throw new Error(`Unsupported source file: ${relative}`);
  const data = await readFile(absolute);
  entries[prefix + relative] = data;
  manifest.push({ path: relative, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}

for (const relative of sourceRoots) await collect(relative);
manifest.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
entries[prefix + 'SOURCE-MANIFEST.json'] = Buffer.from(JSON.stringify({
  release: 'v12',
  description: 'Complete application source; shared Neoreum/Jieum services and browser-local data are external.',
  files: manifest,
}, null, 2) + '\n');
const output = path.join(root, 'public/downloads/dancheong-light-novel-source.zip');
await mkdir(path.dirname(output), { recursive: true });
const archive = zipSync(entries, { level: 6, mtime: new Date(2000, 0, 1) });
await writeFile(output, archive);
console.log(`Source ZIP: ${manifest.length} source files, ${archive.length} bytes → public/downloads/dancheong-light-novel-source.zip`);
