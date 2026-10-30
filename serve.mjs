import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(projectRoot, 'dist');
const args = process.argv.slice(2);
const noOpen =
  args.includes('--no-open') || process.env.SCHEMOGOST_NO_OPEN === '1';
const portArg = args.find((arg) => arg.startsWith('--port='));
const requestedPort = Number(
  portArg ? portArg.slice('--port='.length) : process.env.PORT || 5188,
);
const port = Number.isFinite(requestedPort) ? requestedPort : 5188;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function sendFile(res, filePath, method) {
  const stat = fs.statSync(filePath);
  const isHtml = filePath.endsWith('.html');
  const isHashedAsset =
    filePath.includes(`${path.sep}assets${path.sep}`) && !isHtml;
  res.writeHead(200, {
    'Content-Type': contentType(filePath),
    'Content-Length': stat.size,
    'Cache-Control': isHashedAsset
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function sendText(res, status, text) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(text);
}

function openBrowser(url) {
  if (noOpen) return;
  try {
    if (process.platform === 'win32') {
      const child = spawn('cmd.exe', ['/c', 'start', '', url], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
      return;
    }
    const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
    const child = spawn(command, [url], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch {
    console.log(`Откройте вручную: ${url}`);
  }
}

if (!fs.existsSync(path.join(distRoot, 'index.html'))) {
  console.error('Не найдена папка dist/index.html.');
  console.error('Сначала соберите приложение: npm run build');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method Not Allowed');
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  } catch {
    sendText(res, 400, 'Bad Request');
    return;
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const safeRelative = path
    .normalize(pathname)
    .replace(/^([/\\])+/, '')
    .replace(/^(\.\.([/\\]|$))+/, '');
  let filePath = path.resolve(distRoot, safeRelative);
  if (filePath !== distRoot && !filePath.startsWith(`${distRoot}${path.sep}`)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      sendFile(res, filePath, req.method);
      return;
    }
    const extension = path.extname(filePath);
    if (!extension && fs.existsSync(path.join(distRoot, 'index.html'))) {
      filePath = path.join(distRoot, 'index.html');
      sendFile(res, filePath, req.method);
      return;
    }
    sendText(res, 404, 'Not Found');
  } catch {
    sendText(res, 500, 'Internal Server Error');
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`Порт ${port} уже занят.`);
    console.log(`Возможно, СхемоГОСТ уже запущен: http://127.0.0.1:${port}/`);
    openBrowser(`http://127.0.0.1:${port}/`);
    setTimeout(() => process.exit(0), 300);
    return;
  }
  console.error(error);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log('');
  console.log('  СхемоГОСТ — редактор блок-схем по ГОСТ 19.701-90');
  console.log(`  Открыто: ${url}`);
  console.log('  Закройте это окно или нажмите Ctrl+C, чтобы остановить.');
  console.log('');
  openBrowser(url);
});

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
