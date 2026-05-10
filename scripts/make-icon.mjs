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

// Cool Flixly launcher mark.
//
// Concept: bold italic "F" where each horizontal arm ends in a play-arrow tip,
// suggesting streaming / forward motion. The F sits on a dark gradient
// background with a radial red ambient glow that bleeds beyond the letterform
// for premium depth. Subtle inner sheen on the letterform gives it dimension.
function drawF(x, y, size) {
  // ---- Coordinates (-1..1, origin at centre) ----
  const u0 = (x / size) * 2 - 1;
  const v = (y / size) * 2 - 1;
  // Italic lean: shift u based on v so the F leans forward (streaming energy)
  const slant = 0.10;
  const u = u0 - v * slant;

  // ---- Background: dark vignette + subtle radial off-centre highlight ----
  const distFromCentre = Math.sqrt(u0 * u0 + v * v);
  // Vignette at edges
  const vignette = 1 - Math.min(1, Math.max(0, (distFromCentre - 0.3) * 0.6));
  // Slight cool tint top-left → near-black bottom-right
  const bgBase = 10 + Math.round((1 - (y / size)) * 6) + Math.round(vignette * 3);
  let R = bgBase, G = bgBase, B = bgBase + 2;

  // ---- Red ambient halo behind the F (centered on F's optical centre) ----
  // Optical centre of the leaning F is roughly at (-0.05, 0).
  const haloDx = u0 - (-0.05);
  const haloDy = v - 0;
  const haloR = Math.sqrt(haloDx * haloDx + haloDy * haloDy);
  const haloFalloff = Math.max(0, 1 - haloR / 1.2);
  const haloIntensity = haloFalloff * haloFalloff * 0.55; // 0..0.55
  R = Math.round(R + (210 - R) * haloIntensity * 0.35);
  G = Math.round(G + (15 - G) * haloIntensity * 0.20);
  B = Math.round(B + (25 - B) * haloIntensity * 0.18);

  // ---- F geometry ----
  const left = -0.46;
  const stroke = 0.30;
  const top = -0.68, bottom = 0.70;
  const topArmRight = 0.46;
  const midArmRight = 0.22;
  const midArmCenter = 0.02;
  const aa = 1 / size * 2;

  let inF = 0;

  // Vertical bar
  const vbarH = Math.min(
    smooth(left - aa, left + aa, u),
    smooth(left + stroke + aa, left + stroke - aa, u),
  );
  const vbarV = Math.min(
    smooth(top - aa, top + aa, v),
    smooth(bottom + aa, bottom - aa, v),
  );
  inF = Math.max(inF, vbarH * vbarV);

  // Top horizontal arm — ends in a right-pointing triangle tip (play-arrow style)
  const topArmTop = top;
  const topArmBot = top + stroke;
  // Rect part: left → topArmRight
  const topRectH = Math.min(
    smooth(left - aa, left + aa, u),
    smooth(topArmRight + aa, topArmRight - aa, u),
  );
  const topRectV = Math.min(
    smooth(topArmTop - aa, topArmTop + aa, v),
    smooth(topArmBot + aa, topArmBot - aa, v),
  );
  inF = Math.max(inF, topRectH * topRectV);
  // Triangle tip: from topArmRight to topArmRight+tipLen, narrowing to a point at midV of the arm
  {
    const tipLen = 0.16;
    const tipMid = (topArmTop + topArmBot) / 2;
    const halfH = stroke / 2;
    const t = (u - topArmRight) / tipLen; // 0 at base, 1 at point
    if (t >= -aa && t <= 1 + aa) {
      const armHalf = halfH * Math.max(0, 1 - t);
      const tipH = smooth(-aa, aa, t) * smooth(1 + aa, 1 - aa, t);
      const tipV = Math.min(
        smooth(tipMid - armHalf - aa, tipMid - armHalf + aa, v),
        smooth(tipMid + armHalf + aa, tipMid + armHalf - aa, v),
      );
      inF = Math.max(inF, tipH * tipV);
    }
  }

  // Middle horizontal arm — same arrow-tip treatment, shorter
  const midArmTop = midArmCenter - stroke / 2;
  const midArmBot = midArmCenter + stroke / 2;
  const midRectH = Math.min(
    smooth(left - aa, left + aa, u),
    smooth(midArmRight + aa, midArmRight - aa, u),
  );
  const midRectV = Math.min(
    smooth(midArmTop - aa, midArmTop + aa, v),
    smooth(midArmBot + aa, midArmBot - aa, v),
  );
  inF = Math.max(inF, midRectH * midRectV);
  {
    const tipLen = 0.13;
    const tipMid = (midArmTop + midArmBot) / 2;
    const halfH = stroke / 2;
    const t = (u - midArmRight) / tipLen;
    if (t >= -aa && t <= 1 + aa) {
      const armHalf = halfH * Math.max(0, 1 - t);
      const tipH = smooth(-aa, aa, t) * smooth(1 + aa, 1 - aa, t);
      const tipV = Math.min(
        smooth(tipMid - armHalf - aa, tipMid - armHalf + aa, v),
        smooth(tipMid + armHalf + aa, tipMid + armHalf - aa, v),
      );
      inF = Math.max(inF, tipH * tipV);
    }
  }

  // ---- F fill: rich red with internal gradient (top-left lighter → bottom-right deeper) ----
  if (inF > 0) {
    // Internal sheen: brighter at the upper-left of each stroke
    const sheen = Math.max(0, Math.min(1, 0.5 - (u + v) * 0.35));
    const fr = Math.round(225 + sheen * 28); // 225..253
    const fg = Math.round(9 + sheen * 22);   // 9..31
    const fb = Math.round(20 + sheen * 30);  // 20..50

    R = Math.round(R * (1 - inF) + fr * inF);
    G = Math.round(G * (1 - inF) + fg * inF);
    B = Math.round(B * (1 - inF) + fb * inF);
  }

  return [Math.min(255, R), Math.min(255, G), Math.min(255, B), 255];
}

const small = makePNG(130, drawF);
fs.writeFileSync(path.join(ROOT, 'public', 'icon.png'), small);
console.log('public/icon.png', small.length, 'bytes');

const large = makePNG(256, drawF);
fs.writeFileSync(path.join(ROOT, 'public', 'icon-large.png'), large);
console.log('public/icon-large.png', large.length, 'bytes');
