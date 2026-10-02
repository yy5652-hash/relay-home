import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const token = process.env.RELAY_MCP_TOKEN ?? readFileSync(new URL('../.data/mcp-token', import.meta.url), 'utf8').trim();
const url = new URL(process.env.RELAY_MCP_URL ?? 'http://127.0.0.1:4317/mcp');
const client = new Client({ name: 'relay-reproducibility-check', version: '1.0.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  const tools = await client.listTools();
  console.log(`Connected to ${url}. Tools: ${tools.tools.map(tool => tool.name).join(', ')}`);
  const context = await client.callTool({ name: 'household_context', arguments: {} });
  console.log(JSON.stringify(context.structuredContent, null, 2));
} finally { await client.close(); }
