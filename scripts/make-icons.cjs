// 生成应用图标（32/256 两种尺寸的 PNG），不需要任何图形库
// 用法：node scripts/make-icons.cjs
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 圆角方块 + 三条任务线，整体是青绿色渐变
function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const inset = size * 0.06;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const fx = x + 0.5;
      const fy = y + 0.5;
      // 圆角矩形遮罩
      let inside = true;
      const minX = inset;
      const maxX = size - inset;
      const minY = inset;
      const maxY = size - inset;
      if (fx < minX || fx > maxX || fy < minY || fy > maxY) inside = false;
      for (const [cx, cy] of [
        [minX + radius, minY + radius],
        [maxX - radius, minY + radius],
        [minX + radius, maxY - radius],
        [maxX - radius, maxY - radius],
      ]) {
        const inCornerZone =
          (cx === minX + radius ? fx < minX + radius : fx > maxX - radius) &&
          (cy === minY + radius ? fy < minY + radius : fy > maxY - radius);
        if (inCornerZone && Math.hypot(fx - cx, fy - cy) > radius) inside = false;
      }
      if (!inside) {
        px[i + 3] = 0;
        continue;
      }
      // 背景渐变
      const t = (fx / size) * 0.55 + (fy / size) * 0.45;
      let r = Math.round(20 + t * 30);
      let g = Math.round(46 + t * 120);
      let b = Math.round(56 + t * 120);
      // 三条任务线
      const lineH = size * 0.055;
      const starts = [0.3, 0.46, 0.62];
      const lens = [0.44, 0.32, 0.2];
      const x0 = size * 0.22;
      for (let k = 0; k < 3; k++) {
        const y0 = size * starts[k] - lineH / 2;
        const y1 = y0 + lineH;
        const x1 = x0 + size * lens[k];
        if (fy >= y0 && fy <= y1 && fx >= x0 && fx <= x1) {
          r = 232;
          g = 250;
          b = 246;
        }
      }
      // 三个小圆点
      for (let k = 0; k < 3; k++) {
        const cy = size * starts[k];
        const cx = size * 0.155;
        if (Math.hypot(fx - cx, fy - cy) <= size * 0.045) {
          r = k === 0 ? 94 : k === 1 ? 255 : 150;
          g = k === 0 ? 226 : k === 1 ? 181 : 240;
          b = k === 0 ? 160 : k === 1 ? 71 : 200;
        }
      }
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
  return encodePng(size, size, px);
}

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.png'), drawIcon(256));
fs.writeFileSync(path.join(outDir, 'tray.png'), drawIcon(32));
console.log('icons written to assets/icon.png and assets/tray.png');
