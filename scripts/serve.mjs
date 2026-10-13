import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const url = new URL(req.url, 'http://localhost');

    // Endpoint for automatic file synchronization
    if (req.method === 'POST' && url.pathname === '/api/save-workspace') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      if (data && data.working && data.published) {
        const fileContent = `export const defaultWorkspace = ${JSON.stringify(data, null, 2)};\n`;
        await fs.writeFile(path.join(root, 'src', 'default-data.js'), fileContent, 'utf8');
        console.log(`[Auto-Sync] Workspace saved to src/default-data.js (revision ${data.revision})`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, revision: data.revision }));
        return;
      }
    }

    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const content = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(content);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

const port = process.env.PORT || 5173;
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
