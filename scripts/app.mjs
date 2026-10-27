// 一键把工作台以"应用窗口"方式打开：Edge --app 模式，无地址栏、无标签页
// 用法：node scripts/app.mjs
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const START_PORT = Number(process.env.PORT || 4300);
const profileDir = path.join(root, 'data', 'edge-profile');

async function alive(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/info`, { signal: AbortSignal.timeout(700) });
    return res.ok;
  } catch {
    return false;
  }
}

async function findPort() {
  for (let port = START_PORT; port < START_PORT + 20; port++) {
    // eslint-disable-next-line no-await-in-loop
    if (await alive(port)) return port;
  }
  return 0;
}

function findEdge() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return candidates.find((file) => existsSync(file)) || '';
}

// 服务没跑就拉起来（后台、脱离当前窗口）
let port = await findPort();
if (!port) {
  const child = spawn(process.execPath, [path.join(root, 'server.js')], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  for (let i = 0; i < 40 && !port; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    port = await findPort();
  }
}
if (!port) {
  console.error('启动失败：本地服务没有起来');
  process.exit(1);
}

const url = `http://127.0.0.1:${port}`;
const edge = findEdge();
mkdirSync(profileDir, { recursive: true });

if (edge) {
  // 独立配置目录：应用窗口有自己干净的会话，不和日常浏览混在一起
  const child = spawn(
    edge,
    [
      `--app=${url}`,
      `--user-data-dir=${profileDir}`,
      '--window-size=1480,940',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
} else {
  // 没有 Edge 就退回默认浏览器
  spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

// 记下端口，方便之后判断服务是否还在
try {
  writeFileSync(path.join(root, 'data', 'last-port.txt'), String(port));
} catch {
  /* 忽略 */
}

console.log('工作台地址：' + url);
console.log('已用应用窗口方式打开（无地址栏）。关闭窗口即可，服务会在后台继续运行。');
