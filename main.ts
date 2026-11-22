require('node:v8').setFlagsFromString('--liftoff-only --no-incremental-marking --no-concurrent-recompilation');
const { closeSync, fstatSync, openSync, readFileSync, readSync, writeSync } = require('node:fs');
const wasmMod = new WebAssembly.Module(Buffer.from('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', 'base64'));
function isWs(b) { return b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09; }
function findHeaderEnd(buf, textStart, validLen) {
  let probe = textStart;
  while (true) {
    const idx = buf.indexOf('","header":', probe);
    if (idx === -1 || idx >= validLen) return null;
    let bs = 0, k = idx - 1;
    while (k >= textStart && buf[k] === 0x5c) { bs += 1; k -= 1; }
    if ((bs & 1) === 0) {
      if (idx + 17 <= validLen && buf[idx+11]===0x74 && buf[idx+12]===0x72 && buf[idx+13]===0x75 && buf[idx+14]===0x65 && buf[idx+15]===0x7d && buf[idx+16]===0x7d) return { textEnd: idx, header: 1, nextSearch: idx + 17 };
      if (idx + 18 <= validLen && buf[idx+11]===0x66 && buf[idx+12]===0x61 && buf[idx+13]===0x6c && buf[idx+14]===0x73 && buf[idx+15]===0x65 && buf[idx+16]===0x7d && buf[idx+17]===0x7d) return { textEnd: idx, header: 0, nextSearch: idx + 18 };
      if (idx + 18 > validLen) return null;
    }
    probe = idx + 11;
  }
}
async function fallbackRunFile(inPath, outPath) {
  const { run } = await import('./solve.js');
  const cases = JSON.parse(readFileSync(inPath, 'utf8'));
  const fd = openSync(outPath, 'w');
  writeSync(fd, '[');
  for (let i = 0; i < cases.length; i += 1) {
    const inp = cases[i].input; cases[i] = undefined;
    if (i > 0) writeSync(fd, ',');
    writeSync(fd, JSON.stringify(run(inp)));
  }
  writeSync(fd, ']'); closeSync(fd);
}
function runMain(inPath, outPath) {
  const inFd = openSync(inPath, 'r');
  const inSize = fstatSync(inFd).size;
  if (inSize === 0) { closeSync(inFd); return fallbackRunFile(inPath, outPath); }
  const fsBase = 4096, errBase = fsBase + 65536, errLimit = errBase + 4194304, inBase = errLimit;
  let inCap = Math.min(Math.max(inSize, 65536), 4194304);
  let outBase = (inBase + inCap + 64 + 15) & ~15;
  const outReserve = 4194304;
  const inst = new WebAssembly.Instance(wasmMod);
  const { memory, init_layout, process_case } = inst.exports;
  const needPages = Math.ceil((outBase + outReserve) / 65536);
  const curPages = memory.buffer.byteLength >>> 16;
  if (needPages > curPages) memory.grow(needPages - curPages);
  init_layout(fsBase, errBase, errLimit);
  let memU8 = new Uint8Array(memory.buffer), rawBuf = Buffer.from(memory.buffer, inBase, inCap), filePos = 0, validLen = 0;
  while (validLen < inCap && filePos < inSize) { const n = readSync(inFd, memU8, inBase + validLen, inCap - validLen, filePos); if (n <= 0) break; validLen += n; filePos += n; }
  let scanPos = 0;
  while (scanPos < validLen && isWs(rawBuf[scanPos])) scanPos += 1;
  if (scanPos >= validLen || rawBuf[scanPos] !== 0x5b) { closeSync(inFd); return fallbackRunFile(inPath, outPath); }
  scanPos += 1;
  const outFd = openSync(outPath, 'w');
  let caseCount = 0;
  while (true) {
    while (scanPos < validLen && (isWs(rawBuf[scanPos]) || rawBuf[scanPos] === 0x2c)) scanPos += 1;
    if (scanPos < validLen && rawBuf[scanPos] === 0x5d) {
      let tail = scanPos + 1;
      while (tail < validLen && isWs(rawBuf[tail])) tail += 1;
      if (tail === validLen && filePos === inSize) { writeSync(outFd, caseCount === 0 ? '[]' : ']'); closeSync(outFd); closeSync(inFd); return; }
    }
    const view = validLen === inCap ? rawBuf : rawBuf.subarray(0, validLen);
    const keyIdx = view.indexOf('"text":"', scanPos);
    if (keyIdx !== -1 && keyIdx + 8 <= validLen) {
      const textStart = keyIdx + 8, parsed = findHeaderEnd(view, textStart, validLen);
      if (parsed) {
        memU8[outBase] = caseCount === 0 ? 0x5b : 0x2c;
        const op = process_case(inBase + textStart, inBase + parsed.textEnd, parsed.header, outBase + 1);
        if (op < 0) { closeSync(outFd); closeSync(inFd); return fallbackRunFile(inPath, outPath); }
        if (memU8.buffer !== memory.buffer) { memU8 = new Uint8Array(memory.buffer); rawBuf = Buffer.from(memory.buffer, inBase, inCap); }
        let woff = 0, wtotal = op - outBase;
        while (woff < wtotal) woff += writeSync(outFd, memU8, outBase + woff, wtotal - woff);
        caseCount += 1; scanPos = parsed.nextSearch; continue;
      }
    }
    if (filePos >= inSize) { closeSync(outFd); closeSync(inFd); return fallbackRunFile(inPath, outPath); }
    if (scanPos > 0) { const rem = validLen - scanPos; memU8.copyWithin(inBase, inBase + scanPos, inBase + validLen); validLen = rem; scanPos = 0; }
    if (validLen === inCap) {
      const newInCap = Math.min(inSize - filePos + validLen + 65536, inCap * 2), newOutBase = (inBase + newInCap + 64 + 15) & ~15;
      const reqPages = Math.ceil((newOutBase + outReserve) / 65536), nowPages = memory.buffer.byteLength >>> 16;
      if (reqPages > nowPages) memory.grow(reqPages - nowPages);
      inCap = newInCap; outBase = newOutBase; memU8 = new Uint8Array(memory.buffer); rawBuf = Buffer.from(memory.buffer, inBase, inCap);
    }
    while (validLen < inCap && filePos < inSize) { const n = readSync(inFd, memU8, inBase + validLen, inCap - validLen, filePos); if (n <= 0) break; validLen += n; filePos += n; }
  }
}
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input', O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
runMain(I + '/cases.json', O + '/answers.json');
