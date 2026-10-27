// 打包成 Windows 可执行程序（离线：直接用本机已解压的 Electron 运行环境）
// 用法：node scripts/build-exe.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const electronDir = path.join(root, 'node_modules', 'electron', 'dist');
const outRoot = path.join(root, 'dist');
const appDir = path.join(outRoot, '个人工作台-win32-x64');
const appName = '个人工作台';

if (!fs.existsSync(path.join(electronDir, 'electron.exe'))) {
  console.error('缺少 Electron 运行环境：node_modules/electron/dist/electron.exe');
  process.exit(1);
}

function log(message) {
  process.stdout.write(message + '\n');
}

fs.rmSync(appDir, { recursive: true, force: true });
fs.mkdirSync(appDir, { recursive: true });

// 1) 复制 Electron 运行环境
log('复制 Electron 运行环境...');
for (const entry of fs.readdirSync(electronDir)) {
  fs.cpSync(path.join(electronDir, entry), path.join(appDir, entry), { recursive: true });
}

// 2) 把 electron.exe 改名成应用名
const exeTarget = path.join(appDir, `${appName}.exe`);
fs.renameSync(path.join(appDir, 'electron.exe'), exeTarget);
log(`生成可执行文件：${path.basename(exeTarget)}`);

// 3) 写入应用代码到 resources/app
const resources = path.join(appDir, 'resources');
fs.mkdirSync(resources, { recursive: true });
const packagedApp = path.join(resources, 'app');
fs.mkdirSync(packagedApp, { recursive: true });

const copyList = ['desktop', 'public', 'assets', 'server.js', 'package.json', 'README.md'];
for (const item of copyList) {
  const from = path.join(root, item);
  if (!fs.existsSync(from)) continue;
  fs.cpSync(from, path.join(packagedApp, item), { recursive: true });
}

// 4) 精简 package.json，只保留运行时需要的字段
//    注意：打包后只保留 ASCII 字段，避免某些编码环境把中文 productName 读乱
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const slim = {
  name: pkg.name,
  productName: 'WhaleWorkbench',
  version: pkg.version,
  main: pkg.main,
  description: 'Local personal workbench',
  author: pkg.author,
  license: pkg.license,
};
fs.writeFileSync(path.join(packagedApp, 'package.json'), JSON.stringify(slim, null, 2));
log('写入 resources/app/package.json');

// 5) 附一份说明
fs.writeFileSync(
  path.join(outRoot, 'readme.txt'),
  [
    'My Workbench',
    '',
    'Double click 个人工作台.exe to start.',
    'Data file: %APPDATA%\\个人工作台\\data\\workbench.json',
    'Closing the window keeps the app in the system tray.',
    '',
    'If no window appears, this computer cannot start the Electron runtime.',
    'Use the browser version instead: double click 启动工作台-网页版.bat',
    'in the my-workbench folder.',
  ].join('\r\n'),
  'utf8',
);

log('打包完成：' + appDir);
log('可执行文件：' + exeTarget);
