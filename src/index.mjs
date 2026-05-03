#!/usr/bin/env node
/**
 * LIQAA MCP Server — exposes the LIQAA Public API as Model Context Protocol tools.
 *
 * Lets AI agents (Claude Desktop, Cursor, Continue, etc.) create video rooms,
 * issue browser-safe SDK tokens, manage webhooks, and read live docs.
 *
 * Configure via env: LIQAA_PK (pk_live_...) and LIQAA_SK (sk_live_... server-only).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import crypto from 'node:crypto';

const PK = process.env.LIQAA_PK;
const SK = process.env.LIQAA_SK;
const API_BASE = process.env.LIQAA_API_BASE || 'https://liqaa.io/api/public/v1';

if (!PK || !SK) {
  console.error('[liqaa-mcp] LIQAA_PK and LIQAA_SK env vars are required.');
  console.error('[liqaa-mcp] Get keys at https://liqaa.io/console');
  process.exit(1);
}

// ── HTTP helper ─────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    method: opts.method || 'GET',
    headers: {
      Authorization: `Bearer ${SK}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'liqaa-mcp/1.0.0',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LIQAA ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

// ── Tool definitions ────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'liqaa_create_room',
    description:
      'Create or reuse a persistent video room between two users. Idempotent on `external_conversation_id`. Returns join URLs for both caller and callee.',
    inputSchema: {
      type: 'object',
      required: ['caller_email', 'callee_email'],
      properties: {
        caller_email: { type: 'string', format: 'email' },
        caller_name: { type: 'string' },
        callee_email: { type: 'string', format: 'email' },
        callee_name: { type: 'string' },
        external_conversation_id: { type: 'string' },
        title: { type: 'string' },
      },
    },
    handler: async (args) => api('/conversations', { method: 'POST', body: args }),
  },
  {
    name: 'liqaa_get_room',
    description: 'Fetch the current state of a video room by ID.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' } },
    },
    handler: async ({ id }) => api(`/conversations/${encodeURIComponent(id)}`),
  },
  {
    name: 'liqaa_end_room',
    description: 'End an active call.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' } },
    },
    handler: async ({ id }) => {
      await api(`/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return { ok: true, ended: id };
    },
  },
  {
    name: 'liqaa_issue_sdk_token',
    description:
      'Issue a 1-hour browser-safe JWT for a given identity. The agent should NEVER paste sk_ to the browser — only this token.',
    inputSchema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email' },
        name: { type: 'string' },
      },
    },
    handler: async ({ email, name }) => {
      const identity = Buffer.from(
        JSON.stringify({ email, name, ts: Math.floor(Date.now() / 1000) })
      ).toString('base64');
      const signature = crypto.createHmac('sha256', SK).update(identity).digest('hex');
      return api('/sdk-token', {
        method: 'POST',
        body: { public_key: PK, identity_base64: identity, signature },
      });
    },
  },
  {
    name: 'liqaa_list_webhooks',
    description: 'List all webhook subscriptions.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => api('/webhooks'),
  },
  {
    name: 'liqaa_create_webhook',
    description:
      'Subscribe to events. Returns a one-time signing_secret — store it before this call ends.',
    inputSchema: {
      type: 'object',
      required: ['url', 'events'],
      properties: {
        url: { type: 'string', format: 'uri' },
        events: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'call.started',
              'call.ended',
              'call.declined',
              'message.sent',
              'conversation.created',
              '*',
            ],
          },
        },
        description: { type: 'string' },
      },
    },
    handler: async (args) => api('/webhooks', { method: 'POST', body: args }),
  },
];

// ── Resources ────────────────────────────────────────────────────────────
const RESOURCES = [
  {
    uri: 'liqaa://docs/quickstart',
    name: 'LIQAA Quickstart Guide',
    mimeType: 'text/markdown',
    fetcher: async () => {
      const r = await fetch('https://liqaa.io/docs');
      return await r.text();
    },
  },
  {
    uri: 'liqaa://docs/api',
    name: 'LIQAA OpenAPI 3.1 spec',
    mimeType: 'application/yaml',
    fetcher: async () => {
      const r = await fetch(
        'https://raw.githubusercontent.com/hartemyaakoub/liqaa-openapi/main/openapi.yaml'
      );
      return await r.text();
    },
  },
  {
    uri: 'liqaa://status',
    name: 'LIQAA service status',
    mimeType: 'text/html',
    fetcher: async () => {
      const r = await fetch('https://liqaa.io/status');
      return await r.text();
    },
  },
];

// ── MCP server wiring ────────────────────────────────────────────────────
const server = new Server(
  { name: 'liqaa-mcp', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name);
  if (!tool) throw new Error(`Unknown tool: ${req.params.name}`);
  try {
    const result = await tool.handler(req.params.arguments || {});
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error: ${e.message}` }],
    };
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: RESOURCES.map(({ uri, name, mimeType }) => ({ uri, name, mimeType })),
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const res = RESOURCES.find((r) => r.uri === req.params.uri);
  if (!res) throw new Error(`Unknown resource: ${req.params.uri}`);
  const text = await res.fetcher();
  return {
    contents: [{ uri: res.uri, mimeType: res.mimeType, text }],
  };
});

// ── Start ────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[liqaa-mcp] Server connected via stdio. Ready.');
