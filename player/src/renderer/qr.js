/**
 * Aura DIMS - Minimal Offline ISO/IEC 18004 QR Code SVG Generator (Versions 1-6, ECC-L, Byte mode)
 * Zero external dependencies; safe under strict renderer CSP (`default-src 'self'`).
 */
(function (global) {
  'use strict';

  // Version capacities (total codewords, EC codewords per block, 1 block for V1-V6 ECC-L)
  // [version, size, totalDataBytes, ecBytes, alignCenters]
  const VERSIONS = [
    null,
    { size: 21, data: 19, ec: 7, align: [] },
    { size: 25, data: 34, ec: 10, align: [6, 18] },
    { size: 29, data: 55, ec: 15, align: [6, 22] },
    { size: 33, data: 80, ec: 20, align: [6, 26] },
    { size: 37, data: 108, ec: 26, align: [6, 30] },
    { size: 41, data: 136, ec: 36, align: [6, 34] }, // 2 blocks of 18 EC in spec; V1-V5 are single-block!
  ];

  // GF(256) with primitive polynomial 0x11d
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  function gfMul(a, b) {
    return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
  }

  function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      const factor = EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }

  function rsComputeRemainder(data, ecCount) {
    const gen = rsGeneratorPoly(ecCount);
    const res = new Uint8Array(ecCount);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ res[0];
      for (let j = 0; j < ecCount - 1; j++) res[j] = res[j + 1];
      res[ecCount - 1] = 0;
      if (factor !== 0) {
        for (let j = 0; j < ecCount; j++) {
          res[j] ^= gfMul(gen[j + 1], factor);
        }
      }
    }
    return res;
  }

  function encodeData(text) {
    const bytes = [];
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c < 128) bytes.push(c);
      else if (c < 2048) {
        bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      } else {
        bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    }

    // Choose smallest single-block version (V1-V5, up to 106 UTF-8 bytes)
    let ver = 0;
    for (let v = 1; v <= 5; v++) {
      if (bytes.length + 2 <= VERSIONS[v].data) {
        ver = v;
        break;
      }
    }
    if (!ver) return null;

    const spec = VERSIONS[ver];
    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };

    // Byte mode indicator (0100) + 8-bit length
    pushBits(0b0100, 4);
    pushBits(bytes.length, 8);
    for (const b of bytes) pushBits(b, 8);

    // Terminator (up to 4 zero bits)
    const maxBits = spec.data * 8;
    const termLen = Math.min(4, maxBits - bits.length);
    pushBits(0, termLen);

    // Pad to byte boundary
    while (bits.length % 8 !== 0) bits.push(0);

    // Pack into data codewords and pad with 0xEC, 0x11
    const dataCw = new Uint8Array(spec.data);
    let idx = 0;
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      dataCw[idx++] = b;
    }
    let padToggle = 0;
    while (idx < spec.data) {
      dataCw[idx++] = padToggle === 0 ? 0xec : 0x11;
      padToggle ^= 1;
    }

    const ecCw = rsComputeRemainder(dataCw, spec.ec);
    const allCw = new Uint8Array(spec.data + spec.ec);
    allCw.set(dataCw, 0);
    allCw.set(ecCw, spec.data);

    return { ver, spec, codewords: allCw };
  }

  function buildMatrix(encoded) {
    const { size, align } = encoded.spec;
    const modules = Array.from({ length: size }, () => new Uint8Array(size));
    const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

    const setFunc = (r, c, dark) => {
      if (r >= 0 && r < size && c >= 0 && c < size) {
        modules[r][c] = dark ? 1 : 0;
        isFunc[r][c] = 1;
      }
    };

    // Finder patterns + separators
    const drawFinder = (r0, c0) => {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const r = r0 + dr;
          const c = c0 + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
          const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
          const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          setFunc(r, c, inOuter && (onBorder || inInner));
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      setFunc(6, i, i % 2 === 0);
      setFunc(i, 6, i % 2 === 0);
    }

    // Alignment patterns
    for (const r0 of align) {
      for (const c0 of align) {
        if (isFunc[r0][c0]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            setFunc(r0 + dr, c0 + dc, dark);
          }
        }
      }
    }

    // Reserve format info areas & dark module
    for (let i = 0; i <= 8; i++) {
      if (i !== 6) {
        setFunc(8, i, false);
        setFunc(i, 8, false);
      }
    }
    for (let i = size - 8; i < size; i++) {
      setFunc(8, i, false);
      setFunc(i, 8, false);
    }
    setFunc(size - 8, 8, true);

    // Place data bits in upward/downward 2-column zig-zag
    let bitIdx = 0;
    const totalBits = encoded.codewords.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      const upward = ((right + 1) & 2) === 0;
      for (let vert = 0; vert < size; vert++) {
        const r = upward ? size - 1 - vert : vert;
        for (let j = 0; j < 2; j++) {
          const c = right - j;
          if (!isFunc[r][c]) {
            let dark = 0;
            if (bitIdx < totalBits) {
              dark = (encoded.codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
              bitIdx++;
            }
            modules[r][c] = dark;
          }
        }
      }
    }

    // Apply Mask 0 ((r + c) % 2 === 0) and write format bits for ECC-L (01) + Mask 0 (000)
    // Format 5-bit data = 0b01000 -> BCH(15,5) + XOR 0x5412 = 0x77C4
    const mask = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!isFunc[r][c] && (r + c) % 2 === 0) {
          modules[r][c] ^= 1;
        }
      }
    }

    // Compute exact BCH(15,5) format bits for (ecBits=0b01, mask=0)
    const fmtData = (0b01 << 3) | mask;
    let rem = fmtData << 10;
    for (let i = 4; i >= 0; i--) {
      if ((rem >> (i + 10)) & 1) rem ^= 0x537 << i;
    }
    const fmtBits = ((fmtData << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) modules[8][i] = (fmtBits >> (14 - i)) & 1;
    modules[8][7] = (fmtBits >> 8) & 1;
    modules[8][8] = (fmtBits >> 7) & 1;
    modules[7][8] = (fmtBits >> 6) & 1;
    for (let i = 9; i < 15; i++) modules[14 - i][8] = (fmtBits >> (14 - i)) & 1;

    for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = (fmtBits >> i) & 1;
    for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = (fmtBits >> i) & 1;
    modules[size - 8][8] = 1;

    return { size, modules };
  }

  function renderQrSvg(text, pxSize) {
    const encoded = encodeData(String(text || ''));
    if (!encoded) return '';
    const { size, modules } = buildMatrix(encoded);
    const quiet = 4;
    const dim = size + quiet * 2;
    let rects = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (modules[r][c]) {
          rects += `<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1"/>`;
        }
      }
    }
    const w = pxSize || 180;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${w}" height="${w}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#ffffff"/><g fill="#020617">${rects}</g></svg>`;
  }

  global.AuraQr = { renderQrSvg };
})(typeof window !== 'undefined' ? window : globalThis);
