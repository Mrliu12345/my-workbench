// 一键打开工作台：如果服务没在跑，就在后台拉起一个，再用浏览器打开
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const START_PORT = Number(process.env.PORT || 4300);

async function alive(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/info`, { signal: AbortSignal.timeout(900) });
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

function openBrowser(url) {
  const edge = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].find((file) => existsSync(file));
  if (edge) {
    spawn(edge, ['--new-window', url], { detached: true, stdio: 'ignore' }).unref();
    return 'Edge';
  }
  spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  return '默认浏览器';
}

let port = await findPort();
if (!port) {
  const child = spawn(process.execPath, [path.join(root, 'server.js')], { detached: true, stdio: 'ignore' });
  child.unref();
  for (let i = 0; i < 40 && !port; i++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    port = await findPort();
  }
}
if (!port) {
  console.error('启动失败，请手动运行：node server.js');
  process.exit(1);
}
const url = `http://127.0.0.1:${port}`;
console.log(`工作台地址：${url}`);
console.log(`已用 ${openBrowser(url)} 打开。`);
