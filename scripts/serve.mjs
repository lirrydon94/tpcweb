import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeWorkspace } from './workspace-file.mjs';

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8',
};

export function createWorkspaceServer(root) {
  // Serialize writes so a delayed request cannot replace a newer saved revision.
  let writes = Promise.resolve();
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin) {
      let localOrigin = false;
      try {
        const parsed = new URL(origin);
        localOrigin = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
      } catch {}
      if (!localOrigin) { res.writeHead(403).end('Local origin required'); return; }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    const json = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'POST' && url.pathname === '/api/save-workspace') {
        if (!req.headers['content-type']?.startsWith('application/json')) {
          json(415, { ok: false, error: 'JSON required' }); return;
        }
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 5_000_000) { json(413, { ok: false, error: 'Workspace too large' }); return; }
        }
        let data;
        try { data = JSON.parse(body); }
        catch { json(400, { ok: false, error: 'Invalid JSON' }); return; }
        const write = writes.then(() => writeWorkspace(root, data));
        writes = write.catch(() => {});
        try { json(200, await write); }
        catch (error) { json(error.status || 500, { ok: false, error: error.message }); }
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const content = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch { res.writeHead(404).end('Not found'); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(import.meta.dirname, '..');
  const port = process.env.PORT || 5173;
  createWorkspaceServer(root).listen(port, '127.0.0.1', () => {
    console.log(`Local: http://127.0.0.1:${port}`);
    console.log('Ändringar sparas till src/default-data.js. Gör commit och push när du vill publicera.');
    console.log('Du kan även fortsätta använda http://127.0.0.1:5500/index.html medan denna server körs.');
  });
}
