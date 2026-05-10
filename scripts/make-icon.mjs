// Generate a proper-looking app icon: black square with red rounded "D" carved into it.
// Pure-Node PNG synthesis (no canvas/sharp deps).
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// CRC32 lookup
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = (crc >>> 8) ^ crcTable[(crc ^ b) & 0xff];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.concat([t, data]);
  const crcOut = Buffer.alloc(4); crcOut.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, t, data, crcOut]);
}
function makePNG(size, drawPixel) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const rowBytes = 1 + size * 4;
  const raw = Buffer.alloc(size * rowBytes);
  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0; // filter byte 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = drawPixel(x, y, size);
      const o = y * rowBytes + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Smoothstep for AA edges
const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// Draw a stylized "D":
//   - Vertical bar on the left (rectangle with rounded outer corners)
//   - Bowl on the right (half-ring shape, thick stroke)
//   - Inset from edges so it sits in a comfortable optical centre
function drawD(x, y, size) {
  // Background: black with a subtle vertical gradient for depth
  const tBg = y / size;
  const bgR = Math.round(8 + (1 - tBg) * 4);
  const bgG = Math.round(8 + (1 - tBg) * 4);
  const bgB = Math.round(10 + (1 - tBg) * 4);

  // Coordinate space: -1 .. 1 with 0,0 at centre
  const u = (x / size) * 2 - 1;
  const v = (y / size) * 2 - 1;

  // D geometry tuned for visual balance (slightly left of centre).
  const left = -0.55, right = 0.55, top = -0.65, bottom = 0.65;
  const stroke = 0.28;       // pen thickness
  const aaPx = 1 / size * 2; // anti-alias band width in u/v units

  let inD = 0;

  // Left vertical bar
  if (u >= left - aaPx && u <= left + stroke + aaPx && v >= top - aaPx && v <= bottom + aaPx) {
    const horizFade = Math.min(
      smooth(left - aaPx, left + aaPx, u),
      smooth(left + stroke + aaPx, left + stroke - aaPx, u),
    );
    const vertFade = Math.min(
      smooth(top - aaPx, top + aaPx, v),
      smooth(bottom + aaPx, bottom - aaPx, v),
    );
    inD = Math.max(inD, horizFade * vertFade);
  }

  // Bowl (half-ring on the right side)
  // Outer ellipse semi-axes
  const cx = left + stroke / 2;
  const ax = right - cx;
  const ay = (bottom - top) / 2;
  const cy = (top + bottom) / 2;
  const dx = u - cx;
  const dy = v - cy;
  const outer = (dx * dx) / (ax * ax) + (dy * dy) / (ay * ay);
  const inner = (dx * dx) / ((ax - stroke) * (ax - stroke)) + (dy * dy) / ((ay - stroke) * (ay - stroke));
  if (u >= cx - aaPx) {
    const aaBand = aaPx * 2;
    const outerEdge = smooth(1 + aaBand, 1 - aaBand, outer);
    const innerEdge = smooth(1 - aaBand, 1 + aaBand, inner);
    const ring = Math.min(outerEdge, innerEdge);
    inD = Math.max(inD, ring);
  }

  // Red colour with a subtle vertical sheen so it doesn't feel flat.
  const t = (y / size);
  const r = Math.round(229 + (1 - t) * 14);   // 229..243
  const g = Math.round(9 + (1 - t) * 12);     // 9..21
  const b = Math.round(20 + (1 - t) * 18);    // 20..38

  if (inD > 0) {
    return [
      Math.round(bgR * (1 - inD) + r * inD),
      Math.round(bgG * (1 - inD) + g * inD),
      Math.round(bgB * (1 - inD) + b * inD),
      255,
    ];
  }
  return [bgR, bgG, bgB, 255];
}

const small = makePNG(130, drawD);
fs.writeFileSync(path.join(ROOT, 'public', 'icon.png'), small);
console.log('public/icon.png', small.length, 'bytes');

const large = makePNG(256, drawD);
fs.writeFileSync(path.join(ROOT, 'public', 'icon-large.png'), large);
console.log('public/icon-large.png', large.length, 'bytes');
