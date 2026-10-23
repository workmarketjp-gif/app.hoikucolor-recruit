/**
 * Deploy ONLY as a new, isolated Cloudflare Worker preview after authorization.
 * Never attach this route to an existing HC, Poppy, or blog deployment.
 */
import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import { z } from 'zod/v4';
import { createColorMcpGateway } from '../sdk-bridge.mjs';
import { bindWorkerMcpSdk, createPreviewGateway } from './preview-policy.mjs';

export default {
  async fetch(request, env, ctx) {
    try {
      const gateway = createPreviewGateway(
        bindWorkerMcpSdk({ McpServer, createMcpHandler, z }, env, ctx),
        env, createColorMcpGateway,
      );
      return await gateway.fetch(request);
    } catch {
      // No configuration detail (including keys or origins) is reflected.
      return new Response('Service Unavailable', {
        status: 503, headers: { 'cache-control': 'no-store' },
      });
    }
  },
};
