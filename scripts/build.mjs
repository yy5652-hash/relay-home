// Bundles the two browser pieces: the code inside the cards (dist/view.js, inlined into each ui:// resource) and the
// simulator page's host code (public/host.js). The outputs are committed, so running the project needs no build step.
import { build } from 'esbuild';

const common = { bundle: true, format: 'esm', target: 'es2022', minify: true, legalComments: 'none', logLevel: 'warning' };
await build({ ...common, entryPoints: ['web/view.js'], outfile: 'dist/view.js' });
await build({ ...common, entryPoints: ['web/host.js'], outfile: 'public/host.js' });
console.log('built dist/view.js and public/host.js');
