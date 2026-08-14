// Build the deployable site into dist/: copies static assets and produces
// minified + name-mangled copies of our JS modules so the deployed source is
// much harder to read. Vendored third-party files (pako/upng) are copied
// verbatim. Client-side code can never be fully hidden, but this raises the
// bar significantly.
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { minify } from 'terser';

const DIST = 'dist';

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

// Static content copied verbatim.
for (const src of ['index.html', 'assets', 'static', 'tiles', 'docs']) {
  await cp(src, `${DIST}/${src}`, { recursive: true });
}

// Our ES modules to minify/mangle.
const MODULES = [
  'app.js', 'catalog.js', 'inventory.js', 'map-overlay.js',
  'optimizer.js', 'planner.js', 'scanner.js', 'sea-routes.js',
  'simulator.js', 'walkthrough.js'
];
// Vendored classic-script deps: already-minified or left untouched.
const VENDORED = ['pako.min.js', 'upng.js'];

await mkdir(`${DIST}/js`, { recursive: true });
for (const f of VENDORED) {
  await cp(`js/${f}`, `${DIST}/js/${f}`);
}
for (const f of MODULES) {
  const code = await readFile(`js/${f}`, 'utf8');
  const result = await minify(code, {
    module: true,
    compress: true,
    mangle: { toplevel: true },
    format: { comments: false }
  });
  await writeFile(`${DIST}/js/${f}`, result.code || code);
}

console.log('build complete ->', DIST);
