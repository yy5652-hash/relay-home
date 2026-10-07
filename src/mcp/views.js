// MCP Apps views: one small HTML document per card, delivered as a ui:// resource and shown by the host in a
// sandboxed frame. The script and styles are inlined, so a view needs nothing from the network.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const VIEW_MIME = 'text/html;profile=mcp-app';

let parts;
function page(key, title) {
  parts ??= { script: readFileSync(join(ROOT, 'dist/view.js'), 'utf8').replaceAll('</script', '<\\/script'), style: readFileSync(join(ROOT, 'web/view.css'), 'utf8') };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${parts.style}</style></head><body data-view="${key}"><main id="card"></main><script type="module">${parts.script}</script></body></html>`;
}

const view = (key, title, description) => ({ name: title, uri: `ui://relay-home/${key}.html`, title, description, mimeType: VIEW_MIME, html: () => page(key, title) });

export const VIEWS = {
  plan: view('plan', 'Evening plan', 'Pickup and dinner in one card, with the two actions the plan needs'),
  helpers: view('helpers', 'Pickup helpers', 'A row of cards: every adult with the reason they can or cannot be asked'),
  dinners: view('dinners', 'Dinner options', 'A carousel of meals with pantry coverage, time and cost'),
  receipt: view('receipt', 'Order receipt', 'What was bought, the total, the slot, and a way to cancel')
};

export const viewMeta = key => ({ ui: { resourceUri: VIEWS[key].uri } });
