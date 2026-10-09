import { createApp } from './http.js';

const port = Number(process.env.PORT ?? 4317);
const host = process.env.HOST ?? '127.0.0.1';
// On a public host the server answers only to its own name (DNS-rebinding protection). Render tells a service its
// public name in RENDER_EXTERNAL_HOSTNAME; the loopback names stay allowed because the simulator's agent reaches /mcp through them.
const named = (process.env.RELAY_ALLOWED_HOSTS ?? process.env.RENDER_EXTERNAL_HOSTNAME ?? '').split(',').map(name => name.trim()).filter(Boolean);
const allowedHosts = named.length ? [...new Set([...named, 'localhost', '127.0.0.1'])] : undefined;
const { app } = createApp({ host, allowedHosts });   // RELAY_PUBLIC_URL (or Render's own) is the address reply links are built on
app.listen(port, host, () => console.log(`Relay Home is running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port} (MCP endpoint: /mcp)${allowedHosts ? `, answering to ${allowedHosts.join(', ')}` : ''}`));
