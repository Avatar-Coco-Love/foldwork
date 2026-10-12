// Tiny zero-dependency static server for local development.
// Usage: node dev-server.js [port]   (or PORT=8080 node dev-server.js)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
};

async function resolvePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const full = normalize(join(ROOT, decoded));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null; // path traversal
  const info = await stat(full).catch(() => null);
  if (!info) return null;
  return info.isDirectory() ? join(full, 'index.html') : full;
}

createServer(async (req, res) => {
  try {
    const file = await resolvePath(req.url || '/');
    const body = file && (await readFile(file).catch(() => null));
    if (!body) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(String(err));
  }
}).listen(PORT, () => {
  console.log(`Foldwork dev server: http://localhost:${PORT}/`);
});
