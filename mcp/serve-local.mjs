/** Local-only launcher. Not a production deployment, requires SDK v2 deps. */
import http from 'node:http';
import { createColorMcpGateway } from './sdk-bridge.mjs';
import { createLocalAnonymousLimiter, createLocalPublicMcpAudit } from './anonymous-guard.mjs';

const [{ McpServer, createMcpHandler }, { toNodeHandler }, z] = await Promise.all([
  import('@modelcontextprotocol/server'),
  import('@modelcontextprotocol/node'),
  import('zod/v4'),
]);
const port = Number(process.env.PORT || '3107');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('LOCAL_PORT_INVALID');
const gateway = createColorMcpGateway({ McpServer, createMcpHandler, z }, {
  supabaseUrl: process.env.HC_SUPABASE_URL,
  publishableKey: process.env.HC_SUPABASE_PUBLISHABLE_KEY,
}, { allowedHosts: [`127.0.0.1:${port}`, `localhost:${port}`], allowedOrigins: [], allowLocalHttp: true,
  admit: createLocalAnonymousLimiter(), audit: createLocalPublicMcpAudit(),
});
const nodeHandler = toNodeHandler(gateway, { maxRequestBodySize: 64 * 1024 });
const server = http.createServer((req, res) => nodeHandler(req, res));
server.listen(port, '127.0.0.1', () => process.stdout.write(`HC MCP local-only: http://127.0.0.1:${port}/mcp\n`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  server.close(); gateway.close();
});
