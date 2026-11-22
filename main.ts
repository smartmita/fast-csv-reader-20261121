require('node:v8').setFlagsFromString('--liftoff-only --no-incremental-marking --no-concurrent-recompilation --no-concurrent-sweeping');
const { closeSync, fstatSync, openSync, readFileSync, readSync, writeSync } = require('node:fs');
const wasmMod = new WebAssembly.Module(Buffer.from('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', 'base64'));
const IN_BASE = 132096, OUT_BASE = 656448, IN_CAP = 262144, FLUSH_THRESH = 524288;
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
