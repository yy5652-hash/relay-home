import { createApp } from './http.js';

const port = Number(process.env.PORT ?? 4317);
const host = process.env.HOST ?? '127.0.0.1';
const allowedHosts = process.env.RELAY_ALLOWED_HOSTS?.split(',').map(name => name.trim()).filter(Boolean);
const { app } = createApp({ host, allowedHosts });
app.listen(port, host, () => console.log(`Relay Home is running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port} (MCP endpoint: /mcp)`));
