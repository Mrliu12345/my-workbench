// 个人工作台 · 桌面应用主进程
// 内嵌本地服务（端口随机、只监听 127.0.0.1），窗口直接加载本地页面。

import { app, BrowserWindow, Menu, Tray, nativeImage, shell, dialog } from 'electron';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

// 数据放在用户目录，卸载/升级应用不会丢
const dataDir = path.join(app.getPath('userData'), 'data');
const dataFile = path.join(dataDir, 'workbench.json');
const backupDir = path.join(dataDir, 'backups');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

let mainWindow = null;
let tray = null;
let server = null;
let serverUrl = '';

/* ---------------- 数据 ---------------- */

function emptyData() {
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
    if (!fs.existsSync(dataFile)) return emptyData();
    return { ...emptyData(), ...JSON.parse(fs.readFileSync(dataFile, 'utf8')) };
  } catch {
    try {
      fs.mkdirSync(backupDir, { recursive: true });
      fs.copyFileSync(dataFile, path.join(backupDir, `broken-${Date.now()}.json`));
    } catch {
      /* 忽略 */
    }
    return emptyData();
  }
}

function writeData(data) {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${dataFile}.tmp`;
  const payload = { ...data, updatedAt: new Date().toISOString() };
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, dataFile);
  return payload;
}

/* ---------------- 本地服务 ---------------- */

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function serveStatic(res, pathname) {
  const clean = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const file = path.normalize(path.join(publicDir, clean));
  if (!file.startsWith(publicDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('not found');
  }
  res.writeHead(200, {
    'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  return res.end(fs.readFileSync(file));
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    try {
      if (url.pathname === '/api/state' && req.method === 'GET') return sendJson(res, 200, readData());
      if (url.pathname === '/api/state' && req.method === 'PUT') {
        const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        const saved = writeData(body);
        return sendJson(res, 200, { ok: true, updatedAt: saved.updatedAt });
      }
      if (url.pathname === '/api/export' && req.method === 'GET') {
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'content-disposition': `attachment; filename="workbench-${new Date().toISOString().slice(0, 10)}.json"`,
        });
        return res.end(JSON.stringify(readData(), null, 2));
      }
      if (url.pathname === '/api/info') {
        return sendJson(res, 200, {
          version: app.getVersion(),
          dataFile,
          port: server ? server.address().port : 0,
          desktop: true,
        });
      }
      return serveStatic(res, url.pathname);
    } catch (error) {
      if (!res.headersSent) sendJson(res, 400, { error: String(error && error.message ? error.message : error) });
      else res.end();
    }
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    server = createServer();
    server.once('error', reject);
    // 端口 0：由系统分配空闲端口，永不冲突
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      serverUrl = `http://127.0.0.1:${port}`;
      resolve(serverUrl);
    });
  });
}

/* ---------------- 窗口 ---------------- */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0b0f14',
    title: '个人工作台',
    autoHideMenuBar: true,
    icon: path.join(rootDir, 'assets', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadURL(serverUrl);

  // 外部链接用系统浏览器打开，不在应用里跳走
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(serverUrl)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  // 点关闭 = 收进托盘，后台继续计时
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (tray) tray.displayBalloon?.({ title: '个人工作台', content: '已最小化到托盘，专注计时仍在继续。' });
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function toggleWindow() {
  if (!mainWindow) return createWindow();
  if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function createTray() {
  const iconPath = path.join(rootDir, 'assets', 'tray.png');
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    // 没有图标时用一个 16x16 的占位图，避免托盘创建失败
    image = nativeImage.createEmpty();
  }
  tray = new Tray(image);
  tray.setToolTip('个人工作台');
  const menu = Menu.buildFromTemplate([
    {
      label: '打开工作台',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { label: '置顶显示', type: 'checkbox', click: (item) => mainWindow && mainWindow.setAlwaysOnTop(item.checked) },
    { type: 'separator' },
    {
      label: '打开数据文件所在文件夹',
      click: () => shell.openPath(dataDir),
    },
    {
      label: '备份一份数据',
      click: () => {
        fs.mkdirSync(backupDir, { recursive: true });
        const name = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        try {
          fs.copyFileSync(dataFile, path.join(backupDir, name));
          dialog.showMessageBox({ message: '已备份到：\n' + path.join(backupDir, name) });
        } catch (error) {
          dialog.showMessageBox({ message: '备份失败：' + error.message });
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', toggleWindow);
}

/* ---------------- 启动 ---------------- */

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await startServer();
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // 常驻托盘，不退出
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (server) server.close();
});
