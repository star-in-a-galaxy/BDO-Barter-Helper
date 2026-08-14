// Build the deployable site into dist/: copies static assets and produces
// minified + name-mangled copies of our JS modules under random opaque file
// names (no meaningful prefix, so the source structure can't be mapped).
// Import specifiers and the index.html entry are rewritten to match.
// Client-side code can never be fully hidden, but this raises the bar a lot.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { minify } from 'terser';

const DIST = 'dist';

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

// Static content copied verbatim.
for (const src of ['assets', 'tiles', 'docs']) {
  await cp(src, `${DIST}/${src}`, { recursive: true });
}

// Our ES modules to minify/mangle, then rename to opaque names.
const MODULES = [
  'app.js', 'catalog.js', 'inventory.js', 'map-overlay.js',
  'optimizer.js', 'planner.js', 'scanner.js', 'sea-routes.js',
  'simulator.js', 'walkthrough.js'
];

await mkdir(`${DIST}/js`, { recursive: true });

const files = [];
for (const f of MODULES) {
  const code = await readFile(`js/${f}`, 'utf8');
  const result = await minify(code, {
    module: true,
    compress: true,
    mangle: { toplevel: true },
    format: { comments: false }
  });
  files.push({ base: f, content: result.code || code });
}

// Assign each module a random opaque filename with no source hint.
const used = new Set();
for (const file of files) {
  let name;
  do {
    name = randomBytes(5).toString('hex') + '.js'; // 10 hex chars
  } while (used.has(name));
  used.add(name);
  file.name = name;
}

// Rewrite relative import specifiers to the opaque names (both static
// `from './x.js'` and dynamic `import('./x.js')`).
const nameMap = new Map(files.map(f => [f.base, f.name]));
for (const file of files) {
  let content = file.content;
  for (const [base, opaque] of nameMap) {
    content = content.split(`./${base}`).join(`./${opaque}`);
  }
  await writeFile(`${DIST}/js/${file.name}`, content);
}

// Point the module entry in the copied index.html at the opaque app name.
const entry = files.find(f => f.base === 'app.js');
await cp('index.html', `${DIST}/index.html`);
if (entry) {
  const html = await readFile(`${DIST}/index.html`, 'utf8');
  await writeFile(`${DIST}/index.html`, html.replace('js/app.js', `js/${entry.name}`));
}

console.log('build complete ->', DIST);
console.log('entry:', `js/${entry ? entry.name : 'app.js'}`);
console.log('modules:', files.map(f => f.name).join(' '));
