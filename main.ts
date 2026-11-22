const { closeSync, fstatSync, openSync, readFileSync, readSync, writeSync } = require('node:fs');
const wasmMod = new WebAssembly.Module(Buffer.from('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', 'base64'));
const IN_BASE = 132096, OUT_BASE = 656448, IN_CAP = 524288, FLUSH_THRESH = 2600000;
const BRK = Buffer.from(']');
function isWs(b) { return b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09; }
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
  const inst = new WebAssembly.Instance(wasmMod);
  const { memory, reset_case, process_chunk, finish_case, build_prefix } = inst.exports;
  const memU8 = new Uint8Array(memory.buffer);
  const rawBuf = Buffer.from(memory.buffer, IN_BASE, IN_CAP);
  const memI32 = new Int32Array(memory.buffer, 0, 160);
  let filePos = 0, validLen = 0;
  while (validLen < IN_CAP && filePos < inSize) { const n = readSync(inFd, memU8, IN_BASE + validLen, IN_CAP - validLen, filePos); if (n <= 0) break; validLen += n; filePos += n; }
  let scanPos = 0;
  while (scanPos < validLen && isWs(rawBuf[scanPos])) scanPos += 1;
  if (scanPos >= validLen || rawBuf[scanPos] !== 0x5b) { closeSync(inFd); return fallbackRunFile(inPath, outPath); }
  scanPos += 1;
  const outFd = openSync(outPath, 'w');
  let outFilePos = 0, caseCount = 0;
  const refill = () => {
    if (filePos >= inSize) return false;
    if (scanPos > 0) {
      const rem = validLen - scanPos;
      if (rem > 0) memU8.copyWithin(IN_BASE, IN_BASE + scanPos, IN_BASE + validLen);
      validLen = rem; scanPos = 0;
    }
    if (validLen >= IN_CAP) return false;
    while (validLen < IN_CAP && filePos < inSize) { const n = readSync(inFd, memU8, IN_BASE + validLen, IN_CAP - validLen, filePos); if (n <= 0) break; validLen += n; filePos += n; }
    return true;
  };
  const writeFull = (off, len, pos) => {
    let w = 0;
    while (w < len) w += writeSync(outFd, memU8, off + w, len - w, pos + w);
  };
  while (true) {
    while (true) {
      while (scanPos < validLen && (isWs(rawBuf[scanPos]) || rawBuf[scanPos] === 0x2c)) scanPos += 1;
      if (scanPos < validLen) break;
      if (!refill()) { closeSync(outFd); closeSync(inFd); return fallbackRunFile(inPath, outPath); }
    }
    if (rawBuf[scanPos] === 0x5d) {
      let tail = scanPos + 1;
      while (tail < validLen && isWs(rawBuf[tail])) tail += 1;
      if (tail === validLen && filePos === inSize) {
        if (caseCount === 0) writeSync(outFd, Buffer.from('[]'), 0, 2, 0);
        else writeSync(outFd, BRK, 0, 1, outFilePos);
        closeSync(outFd); closeSync(inFd); return;
      }
    }
    let keyIdx = rawBuf.subarray(0, validLen).indexOf('"text":"', scanPos);
    while (keyIdx === -1 || keyIdx + 8 > validLen) {
      if (!refill()) { closeSync(outFd); closeSync(inFd); return fallbackRunFile(inPath, outPath); }
      keyIdx = rawBuf.subarray(0, validLen).indexOf('"text":"', scanPos);
    }
    scanPos = keyIdx + 8;
    const leadChar = caseCount === 0 ? 0x5b : 0x2c;
    reset_case();
    let prefixFlushed = false, caseOutStart = outFilePos;
    while (true) {
      process_chunk(IN_BASE + scanPos, IN_BASE + validLen, filePos >= inSize ? 1 : 0);
      const status = memI32[552 >> 2];
      if (status < 0) { closeSync(outFd); closeSync(inFd); return fallbackRunFile(inPath, outPath); }
      const columnsDone = memI32[528 >> 2], row0Len = memI32[544 >> 2], opEnd = memI32[516 >> 2], nextP = memI32[512 >> 2];
      scanPos = nextP - IN_BASE;
      if (status === 1) {
        const header = memI32[556 >> 2];
        let endOp = finish_case(header, leadChar);
        if (endOp < 0) {
          if (opEnd > OUT_BASE) {
            if (columnsDone === 1 && !prefixFlushed) {
              const skip = 26 + row0Len;
              outFilePos += skip;
              if (opEnd > OUT_BASE + skip) {
                const len = opEnd - (OUT_BASE + skip);
                writeFull(OUT_BASE + skip, len, outFilePos);
                outFilePos += len;
              }
              prefixFlushed = true;
            } else {
              const len = opEnd - OUT_BASE;
              writeFull(OUT_BASE, len, outFilePos);
              outFilePos += len;
            }
            memI32[516 >> 2] = OUT_BASE;
          }
          endOp = finish_case(header, leadChar);
          if (endOp < 0) { closeSync(outFd); closeSync(inFd); return fallbackRunFile(inPath, outPath); }
        }
        if (columnsDone === 1 && !prefixFlushed) build_prefix(header, leadChar);
        const totalLen = endOp - OUT_BASE;
        if (totalLen > 0) { writeFull(OUT_BASE, totalLen, outFilePos); outFilePos += totalLen; }
        if (columnsDone === 1 && prefixFlushed) {
          const pEnd = build_prefix(header, leadChar);
          writeFull(OUT_BASE, pEnd - OUT_BASE, caseOutStart);
        }
        caseCount += 1;
        break;
      }
      if (opEnd - OUT_BASE >= FLUSH_THRESH) {
        if (columnsDone === 1 && !prefixFlushed) {
          const skip = 26 + row0Len;
          outFilePos += skip;
          if (opEnd > OUT_BASE + skip) {
            const len = opEnd - (OUT_BASE + skip);
            writeFull(OUT_BASE + skip, len, outFilePos);
            outFilePos += len;
          }
          prefixFlushed = true;
        } else {
          const len = opEnd - OUT_BASE;
          writeFull(OUT_BASE, len, outFilePos);
          outFilePos += len;
        }
        memI32[516 >> 2] = OUT_BASE;
      }
      if (!refill()) { closeSync(outFd); closeSync(inFd); return fallbackRunFile(inPath, outPath); }
    }
  }
}
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input', O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
runMain(I + '/cases.json', O + '/answers.json');
