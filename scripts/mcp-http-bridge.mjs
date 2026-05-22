#!/usr/bin/env node
import express from 'express';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.MCP_HTTP_PORT ?? 3847);
const projectId = process.env.MCP_PROJECT_ID ?? '/qs/mcp-architector';

function mcpExchange(extraMessages) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['dist/index.js'], {
      cwd: root,
      env: { ...process.env, MCP_PROJECT_ID: projectId },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      const lines = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return { parseError: true, raw: l };
          }
        });
      resolve({ code, lines, stderr });
    });

    const base = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'curl-test', version: '1.0.0' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
    ];

    for (const msg of [...base, ...extraMessages]) {
      proc.stdin.write(`${JSON.stringify(msg)}\n`);
    }
    proc.stdin.end();
  });
}

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, server: 'mcp-architector', projectId });
});

app.post('/mcp', async (req, res) => {
  try {
    const body = req.body;
    const messages = Array.isArray(body) ? body : [body];
    const result = await mcpExchange(messages);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.listen(port, () => {
  console.error(`MCP HTTP bridge http://127.0.0.1:${port} projectId=${projectId}`);
});
