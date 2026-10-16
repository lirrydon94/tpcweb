import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const root = path.resolve(import.meta.dirname, '..');
let publishTimer;
let publishing = false;
let publishRequested = false;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

async function publishToGitHub() {
  const { stdout: branch } = await execFileAsync('git', ['branch', '--show-current'], { cwd: root });
  if (branch.trim() !== 'main') throw new Error(`Current branch is ${branch.trim() || '(detached)'}, expected main.`);

  const { stdout: status } = await execFileAsync('git', ['status', '--porcelain', '--', 'src/default-data.js'], { cwd: root });
  if (status.trim()) {
    await execFileAsync('git', ['add', '--', 'src/default-data.js'], { cwd: root });
    let staged;
    try {
      await execFileAsync('git', ['diff', '--cached', '--quiet', '--', 'src/default-data.js'], { cwd: root });
      staged = false;
    } catch (error) {
      if (error.code !== 1) throw error;
      staged = true;
    }
    if (staged) {
      await execFileAsync('git', ['commit', '-m', 'Publish schedule update'], { cwd: root });
      console.log('[GitHub Pages] Schedule update committed.');
    }
  }

  await execFileAsync('git', ['push', 'origin', 'main'], { cwd: root });
  console.log('[GitHub Pages] Schedule update pushed; Pages will deploy it automatically.');
}

function queueGitHubPublish() {
  publishRequested = true;
  clearTimeout(publishTimer);
  publishTimer = setTimeout(async () => {
    if (publishing) return;
    publishing = true;
    try {
      while (publishRequested) {
        publishRequested = false;
        await publishToGitHub();
      }
    } catch (error) {
      console.error(`[GitHub Pages] Could not publish schedule: ${error.stderr?.toString().trim() || error.message}`);
    } finally {
      publishing = false;
      if (publishRequested) queueGitHubPublish();
    }
  }, 1000);
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin) {
    let localOrigin = false;
    try {
      const parsedOrigin = new URL(origin);
      localOrigin = parsedOrigin.protocol === 'http:'
        && ['localhost', '127.0.0.1'].includes(parsedOrigin.hostname);
    } catch {}
    if (!localOrigin) { res.writeHead(403).end('Local origin required'); return; }
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
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
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 5_000_000) { res.writeHead(413).end('Workspace too large'); return; }
      }
      const data = JSON.parse(body);
      const validState = state => state?.schemaVersion === 1
        && Array.isArray(state.teams) && Array.isArray(state.exceptions);
      if (data && validState(data.working) && validState(data.published)
        && Number.isSafeInteger(data.revision) && data.revision >= 0) {
        // The user chose to publish the complete local workspace to this public repo.
        const workspace = {
          working: data.working,
          published: data.published,
          revision: data.revision,
          appliedFixes: Array.isArray(data.appliedFixes) ? data.appliedFixes : [],
        };
        const fileContent = `export const defaultWorkspace = ${JSON.stringify(workspace, null, 2)};\n`;
        const target = path.join(root, 'src', 'default-data.js');
        const previous = await fs.readFile(target, 'utf8').catch(() => '');
        try {
          const previousData = JSON.parse(previous.replace(/^\s*export const defaultWorkspace\s*=\s*/, '').replace(/;\s*$/, ''));
          if (JSON.stringify(previousData) === JSON.stringify(workspace)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, revision: data.revision, unchanged: true }));
            return;
          }
        } catch {}
        await fs.writeFile(target, fileContent, 'utf8');
        console.log(`[Auto-Sync] Complete local workspace saved to src/default-data.js (revision ${data.revision})`);
        queueGitHubPublish();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, revision: data.revision, publishing: true }));
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
