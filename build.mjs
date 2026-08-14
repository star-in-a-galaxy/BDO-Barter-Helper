// Build the deployable site into dist/: copies static assets and produces
// minified + name-mangled copies of our JS modules under content-hashed file
// names (so the source structure is harder to map). Import specifiers and the
// index.html entry are rewritten to match. Client-side code can never be fully
// hidden, but this raises the bar significantly.
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { minify } from 'terser';

const DIST = 'dist';

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

// Static content copied verbatim.
for (const src of ['assets', 'tiles', 'docs']) {
  await cp(src, `${DIST}/${src}`, { recursive: true });
}

// Our ES modules to minify/mangle, then hash-rename.
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
  const content = result.code || code;
  const hash = createHash('sha1').update(content).digest('hex').slice(0, 8);
  files.push({ base: f, name: `${f.slice(0, -3)}.${hash}.js`, content });
}

// Rewrite relative import specifiers to the hashed names (both static
// `from './x.js'` and dynamic `import('./x.js')`).
const rename = (content, from, to) => content.split(`./${from}`).join(`./${to}`);

for (const file of files) {
  let content = file.content;
  for (const other of files) content = rename(content, other.base, other.name);
  await writeFile(`${DIST}/js/${file.name}`, content);
}

// Rewrite the module entry in the copied index.html to the hashed app name.
const entry = files.find(f => f.base === 'app.js');
await cp('index.html', `${DIST}/index.html`);
if (entry) {
  const html = await readFile(`${DIST}/index.html`, 'utf8');
  await writeFile(`${DIST}/index.html`, html.replace('js/app.js', `js/${entry.name}`));
}

console.log('build complete ->', DIST);
console.log('entry:', `js/${entry ? entry.name : 'app.js'}`);
