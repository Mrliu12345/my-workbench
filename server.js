// 个人工作台 · 本地服务
// 零依赖：静态页面 + 一个 JSON 数据文件，全部在本机，不联网。

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'workbench.json');
const backupDir = path.join(dataDir, 'backups');

const START_PORT = Number(process.env.PORT || 4300);
const HOST = '127.0.0.1';
const MAX_PORTS = 20;

fs.mkdirSync(dataDir, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/* ---------------- 数据存储 ---------------- */

function defaultData() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    todos: [],
    events: [],
    notes: [],
    links: [],
    habits: [],
    focus: { sessions: [], totalMinutes: 0 },
    tools: [],
    settings: { name: '', greeting: '' },
  };
}

function readData() {
  try {
    if (!fs.existsSync(dataFile)) return defaultData();
    const raw = fs.readFileSync(dataFile, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...defaultData(), ...parsed };
  } catch {
    // 文件坏了就备份一份，再给一份空白数据，避免整个工作台打不开
    try {
      const broken = path.join(backupDir, `broken-${Date.now()}.json`);
      fs.mkdirSync(backupDir, { recursive: true });
      fs.copyFileSync(dataFile, broken);
    } catch {
      /* 忽略 */
    }
    return defaultData();
  }
}

function writeData(data) {
  fs.mkdirSync(dataDir, { recursive: true });
  // 先写临时文件再重命名，避免写一半断电把数据弄坏
  const tmp = `${dataFile}.tmp`;
  const payload = { ...data, updatedAt: new Date().toISOString() };
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, dataFile);
  return payload;
}

/* ---------------- 工具函数 ---------------- */

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function serveStatic(res, pathname) {
  let target = pathname === '/' ? '/index.html' : pathname;
  target = decodeURIComponent(target);
  const file = path.normalize(path.join(publicDir, target));
  if (!file.startsWith(publicDir)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('not found');
  }
  res.writeHead(200, {
    'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  return res.end(fs.readFileSync(file));
}

/* ---------------- 路由 ---------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}`);
  const { pathname } = url;

  try {
    if (pathname === '/api/state' && req.method === 'GET') {
      return sendJson(res, 200, readData());
    }

    if (pathname === '/api/state' && req.method === 'PUT') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const saved = writeData(body);
      return sendJson(res, 200, { ok: true, updatedAt: saved.updatedAt });
    }

    if (pathname === '/api/export' && req.method === 'GET') {
      const payload = JSON.stringify(readData(), null, 2);
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="workbench-${new Date().toISOString().slice(0, 10)}.json"`,
      });
      return res.end(payload);
    }

    if (pathname === '/api/backup' && req.method === 'POST') {
      fs.mkdirSync(backupDir, { recursive: true });
      const name = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      fs.copyFileSync(dataFile, path.join(backupDir, name));
      return sendJson(res, 200, { ok: true, file: name });
    }

    if (pathname === '/api/info' && req.method === 'GET') {
      return sendJson(res, 200, {
        version: '1.0.0',
        dataFile,
        host: os.hostname(),
        port: server.address() ? server.address().port : START_PORT,
      });
    }

    return serveStatic(res, pathname);
  } catch (error) {
    if (!res.headersSent) {
      sendJson(res, 400, { error: error && error.message ? error.message : String(error) });
    } else {
      res.end();
    }
  }
});

/* ---------------- 启动：端口冲突自动顺延 ---------------- */

function listen(port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve(port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, HOST);
  });
}

(async () => {
  let port = 0;
  for (let i = 0; i < MAX_PORTS; i++) {
    const candidate = START_PORT + i;
    try {
      // eslint-disable-next-line no-await-in-loop
      port = await listen(candidate);
      break;
    } catch (error) {
      if (error.code === 'EADDRINUSE' && i < MAX_PORTS - 1) continue;
      console.error('启动失败：', error.message);
      process.exit(1);
    }
  }
  console.log(`个人工作台已启动：http://${HOST}:${port}`);
  console.log(`数据文件：${dataFile}`);
  console.log('关闭这个窗口就会停止服务。');
})();

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
