// A small QR Code encoder for the helper's reply link: byte mode, error correction level L, versions 1 to 5
// (up to 106 bytes), which is one Reed-Solomon block per symbol. No dependency, and the same file runs in the
// server's tests and inside the evening card. Returns the symbol as rows of '1' (dark) and '0', or null if the
// text is too long for version 5.
const VERSIONS = [null, { data: 19, ec: 7 }, { data: 34, ec: 10 }, { data: 55, ec: 15 }, { data: 80, ec: 20 }, { data: 108, ec: 26 }];

// Multiplication in GF(2^8) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.
function mul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z;
}

function errorCorrection(data, degree) {
  const divisor = new Array(degree).fill(0);
  divisor[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) { divisor[j] = mul(divisor[j], root); if (j + 1 < degree) divisor[j] ^= divisor[j + 1]; }
    root = mul(root, 2);
  }
  const rest = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ rest.shift();
    rest.push(0);
    divisor.forEach((coefficient, i) => { rest[i] ^= mul(coefficient, factor); });
  }
  return rest;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0
];

// Fewer long runs and fewer 2x2 blocks of one colour read more reliably; the mask with the lowest count is used.
function penalty(grid) {
  const size = grid.length;
  let score = 0;
  for (let a = 0; a < size; a += 1) {
    for (const line of [grid[a], grid.map(row => row[a])]) {
      let run = 1;
      for (let b = 1; b <= size; b += 1) {
        if (b < size && line[b] === line[b - 1]) { run += 1; continue; }
        if (run >= 5) score += run - 2;
        run = 1;
      }
    }
  }
  for (let y = 0; y < size - 1; y += 1) for (let x = 0; x < size - 1; x += 1) if (grid[y][x] === grid[y][x + 1] && grid[y][x] === grid[y + 1][x] && grid[y][x] === grid[y + 1][x + 1]) score += 3;
  return score;
}

export function qrCode(text) {
  const bytes = [...new TextEncoder().encode(text)];
  const version = VERSIONS.findIndex(spec => spec && bytes.length + 2 <= spec.data);
  if (version < 1) return null;
  const { data: capacity, ec } = VERSIONS[version];

  // Mode (byte), length, the bytes, a terminator, then padding up to the symbol's capacity.
  const bits = [];
  const put = (value, length) => { for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, 8);
  for (const byte of bytes) put(byte, 8);
  put(0, Math.min(4, capacity * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < capacity * 8; pad ^= 0xec ^ 0x11) put(pad, 8);
  const words = [];
  for (let i = 0; i < bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  const all = [...words, ...errorCorrection(words, ec)];

  const size = 17 + 4 * version;
  const dark = Array.from({ length: size }, () => new Array(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, on) => { if (x >= 0 && x < size && y >= 0 && y < size) { dark[y][x] = on; fixed[y][x] = true; } };
  for (let i = 0; i < size; i += 1) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy += 1) for (let dx = -4; dx <= 4; dx += 1) { const ring = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, ring !== 2 && ring !== 4); }
  }
  if (version > 1) for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) set(size - 7 + dx, size - 7 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  const format = mask => {
    const value = (1 << 3) | mask;            // level L, then the mask number
    let rest = value;
    for (let i = 0; i < 10; i += 1) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
    const code = ((value << 10) | rest) ^ 0x5412;
    const bit = i => ((code >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i += 1) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i += 1) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  format(0);                                  // reserves the format cells before the data goes in

  // The codewords run in a zigzag of two-module columns from the bottom right, skipping the vertical timing line.
  let index = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - step : step;
        if (fixed[y][x]) continue;
        dark[y][x] = index < all.length * 8 && ((all[index >>> 3] >>> (7 - (index & 7))) & 1) === 1;
        index += 1;
      }
    }
  }

  let best = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const grid = dark.map((row, y) => row.map((on, x) => (fixed[y][x] ? on : on !== MASKS[mask](x, y))));
    const saved = dark.map(row => [...row]);
    format(mask);
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (fixed[y][x]) grid[y][x] = dark[y][x];
    for (let y = 0; y < size; y += 1) dark[y] = saved[y];
    const score = penalty(grid);
    if (!best || score < best.score) best = { score, grid };
  }
  return best.grid.map(row => row.map(on => (on ? '1' : '0')).join(''));
}
