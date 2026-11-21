// Draws the MindPC icons (a white "M" on a blue rounded square) with no image
// dependencies. Run `node scripts/make-icons.js` to regenerate:
//   assets/icon.png         1024px app icon (electron-builder derives .icns/.ico)
//   assets/tray.png         32px colour tray icon (Windows, Linux)
//   assets/trayTemplate.png 22px black-on-transparent tray icon (macOS menu bar)
//   assets/trayTemplate@2x.png

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');

// The "M" outline in a 1024 x 1024 design space.
const M_POLYGON = [
  [250, 744], [250, 280], [352, 280], [512, 520], [672, 280], [774, 280],
  [774, 744], [672, 744], [672, 450], [512, 690], [352, 450], [352, 744],
];

const SUBSAMPLES = 4;

// Fraction (0..1) of each pixel in one row covered by the polygon, using
// even-odd scanline filling with vertical supersampling.
function polygonRowCoverage(polygon, py, size, scale) {
  const coverage = new Float32Array(size);
  for (let s = 0; s < SUBSAMPLES; s++) {
    const y = (py + (s + 0.5) / SUBSAMPLES) / scale;
    const xs = [];
    for (let i = 0; i < polygon.length; i++) {
      const [x0, y0] = polygon[i];
      const [x1, y1] = polygon[(i + 1) % polygon.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const from = xs[i] * scale;
      const to = xs[i + 1] * scale;
      for (let x = Math.max(0, Math.floor(from)); x < Math.min(size, Math.ceil(to)); x++) {
        coverage[x] += (Math.min(to, x + 1) - Math.max(from, x)) / SUBSAMPLES;
      }
    }
  }
  return coverage;
}

// Coverage of a rounded square (box inset by `inset`, corner radius `radius`),
// from its signed distance, so edges are anti-aliased.
function roundedSquareCoverage(x, y, size, inset, radius) {
  const half = size / 2 - inset;
  const dx = Math.abs(x + 0.5 - size / 2) - (half - radius);
  const dy = Math.abs(y + 0.5 - size / 2) - (half - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  const inside = Math.min(Math.max(dx, dy), 0);
  return Math.min(1, Math.max(0, 0.5 - (outside + inside - radius)));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// mode 'app': white M on a blue gradient rounded square.
// mode 'template': black M on transparent (macOS menu bar template image).
function render(size, mode) {
  const scale = size / 1024;
  const rgba = Buffer.alloc(size * size * 4);
  const inset = 100 * scale;
  const radius = 185 * scale;

  for (let y = 0; y < size; y++) {
    const m = polygonRowCoverage(M_POLYGON, y, size, scale);
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      if (mode === 'template') {
        rgba[o + 3] = Math.round(Math.min(1, m[x]) * 255);
        continue;
      }
      const bg = roundedSquareCoverage(x, y, size, inset, radius);
      const t = y / size;
      const r = lerp(59, 29, t);
      const g = lerp(130, 78, t);
      const b = lerp(246, 216, t);
      const white = Math.min(1, m[x]) * bg;
      rgba[o] = Math.round(lerp(r, 255, white));
      rgba[o + 1] = Math.round(lerp(g, 255, white));
      rgba[o + 2] = Math.round(lerp(b, 255, white));
      rgba[o + 3] = Math.round(bg * 255);
    }
  }
  return rgba;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function write(relPath, size, mode) {
  const file = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePng(size, render(size, mode)));
  console.log(`wrote ${relPath} (${size}x${size}, ${mode})`);
}

write('assets/icon.png', 1024, 'app');
write('assets/tray.png', 32, 'app');
write('assets/trayTemplate.png', 22, 'template');
write('assets/trayTemplate@2x.png', 44, 'template');
