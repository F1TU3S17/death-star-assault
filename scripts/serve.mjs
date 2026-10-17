import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep, extname } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.obj': 'text/plain', '.mtl': 'text/plain', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bin': 'application/octet-stream' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end('File not found'); }
});
const port = Number(process.env.PORT || 4173);
const url = `http://127.0.0.1:${port}`;
function openBrowser() {
  if (process.platform === 'win32' && !process.env.NO_OPEN) {
    spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true, stdio: 'ignore' }).on('error', () => {});
  }
}
server.once('error', async error => {
  if (error.code === 'EADDRINUSE') {
    try {
      const existing = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if ((await existing.text()).includes('<title>Атака на Звезду Смерти — Битва при Явине</title>')) {
        console.log(`The game is already running: ${url}`);
        openBrowser();
        return;
      }
    } catch { /* Report the original listen error if this is another service. */ }
  }
  console.error(`Unable to listen on port ${port}: ${error.message}`);
  console.error('Close the other game window, or run with a different PORT.');
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`\n  DEATH STAR ASSAULT\n  ${url}\n\n  Keep this window open. Press Ctrl+C to stop.\n`);
  openBrowser();
});
