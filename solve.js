import { closeSync, fstatSync, openSync, readFileSync, readSync, writeFileSync, writeSync } from 'node:fs';

function finishUnquoted(text, len, pos, line, value, hasSeg, errors, recordLine, recordRow) {
  let segStart = pos;
  while (pos < len) {
    const c = text.charCodeAt(pos);
    if (c === 44) {
      if (pos > segStart) {
        const s = text.slice(segStart, pos);
        value = hasSeg ? value + s : s;
      }
      return { value, pos: pos + 1, line, ended: true };
    }
    if (c === 10) {
      if (pos > segStart) {
        const s = text.slice(segStart, pos);
        value = hasSeg ? value + s : s;
      }
      return { value, pos: pos + 1, line: line + 1, ended: false };
    }
    if (c === 13) {
      if (pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
        if (pos > segStart) {
          const s = text.slice(segStart, pos);
          value = hasSeg ? value + s : s;
        }
        return { value, pos: pos + 2, line: line + 1, ended: false };
      }
      if (pos > segStart) {
        const s = text.slice(segStart, pos);
        value = hasSeg ? value + s : s;
        hasSeg = true;
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos += 1;
      segStart = pos;
      continue;
    }
    pos += 1;
  }
  if (pos > segStart) {
    const s = text.slice(segStart, pos);
    value = hasSeg ? value + s : s;
  }
  return { value, pos, line, ended: false };
}

/**
 * High-speed drop-in replacement for csv-reader 1.0.0.
 */
export function run(input) {
  const text = String(input.text);
  const len = text.length;
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = len > 0 && text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  let nextNl = text.indexOf('\n', pos);
  let nextCr = text.indexOf('\r', pos);
  let nextQuote = text.indexOf('"', pos);

  while (pos < len) {
    const firstC = text.charCodeAt(pos);
    if (firstC === 10) {
      pos += 1;
      line += 1;
      continue;
    }
    if (firstC === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      continue;
    }

    if (nextNl !== -1 && nextNl < pos) nextNl = text.indexOf('\n', pos);
    if (nextCr !== -1 && nextCr < pos) nextCr = text.indexOf('\r', pos);
    if (nextQuote !== -1 && nextQuote < pos) nextQuote = text.indexOf('"', pos);

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;

    const lineEnd = nextNl === -1 ? len : (nextCr === nextNl - 1 ? nextNl - 1 : nextNl);
    if ((nextQuote === -1 || nextQuote >= lineEnd) && (nextCr === -1 || nextCr >= lineEnd)) {
      const fields = text.slice(pos, lineEnd).split(',');
      if (nextNl === -1) {
        pos = len;
      } else {
        pos = nextNl + 1;
        line += 1;
      }
      if (width < 0) width = fields.length;
      if (header && columns === null) {
        columns = fields;
        continue;
      }
      const flen = fields.length;
      if (flen !== width) {
        if (flen < width) {
          errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: flen });
          for (let i = flen; i < width; i += 1) fields.push('');
        } else {
          errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
        }
      }
      rows.push(fields);
      continue;
    }

    const fields = [];
    let firstQuoted = false;

    fieldLoop: while (true) {
      const isQuoted = pos < len && text.charCodeAt(pos) === 34;
      if (fields.length === 0) firstQuoted = isQuoted;

      if (!isQuoted) {
        const segStart = pos;
        while (pos < len) {
          const c = text.charCodeAt(pos);
          if (c === 44) {
            fields.push(text.slice(segStart, pos));
            pos += 1;
            continue fieldLoop;
          }
          if (c === 10) {
            fields.push(text.slice(segStart, pos));
            pos += 1;
            line += 1;
            break fieldLoop;
          }
          if (c === 13) {
            if (pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
              fields.push(text.slice(segStart, pos));
              pos += 2;
              line += 1;
              break fieldLoop;
            }
            const res = finishUnquoted(
              text,
              len,
              pos,
              line,
              text.slice(segStart, pos),
              pos > segStart,
              errors,
              recordLine,
              recordRow,
            );
            fields.push(res.value);
            pos = res.pos;
            line = res.line;
            if (res.ended) continue fieldLoop;
            break fieldLoop;
          }
          pos += 1;
        }
        fields.push(text.slice(segStart, pos));
        break fieldLoop;
      }

      const open = pos;
      const openLine = line;
      pos += 1;
      if (nextQuote !== -1 && nextQuote < pos) nextQuote = text.indexOf('"', pos);
      if (nextCr !== -1 && nextCr < pos) nextCr = text.indexOf('\r', pos);
      if (nextNl !== -1 && nextNl < pos) nextNl = text.indexOf('\n', pos);

      let value = '';
      let hasSeg = false;
      let segStart = pos;
      let closed = false;

      while (nextQuote !== -1) {
        if (nextCr !== -1 && nextCr < nextQuote) {
          pos = segStart;
          while (pos < len) {
            const c = text.charCodeAt(pos);
            if (c === 34) {
              if (pos + 1 < len && text.charCodeAt(pos + 1) === 34) {
                value = (hasSeg ? value + text.slice(segStart, pos) : text.slice(segStart, pos)) + '"';
                hasSeg = true;
                pos += 2;
                segStart = pos;
                continue;
              }
              value = hasSeg ? value + text.slice(segStart, pos) : text.slice(segStart, pos);
              pos += 1;
              closed = true;
              break;
            }
            if (c === 13) {
              value = (hasSeg ? value + text.slice(segStart, pos) : text.slice(segStart, pos)) + '\n';
              hasSeg = true;
              line += 1;
              pos += pos + 1 < len && text.charCodeAt(pos + 1) === 10 ? 2 : 1;
              segStart = pos;
              continue;
            }
            if (c === 10) line += 1;
            pos += 1;
          }
          nextQuote = text.indexOf('"', pos);
          nextCr = text.indexOf('\r', pos);
          nextNl = text.indexOf('\n', pos);
          break;
        }

        while (nextNl !== -1 && nextNl < nextQuote) {
          line += 1;
          nextNl = text.indexOf('\n', nextNl + 1);
        }

        if (nextQuote + 1 < len && text.charCodeAt(nextQuote + 1) === 34) {
          value = (hasSeg ? value + text.slice(segStart, nextQuote) : text.slice(segStart, nextQuote)) + '"';
          hasSeg = true;
          pos = nextQuote + 2;
          segStart = pos;
          nextQuote = text.indexOf('"', pos);
          continue;
        }

        value = hasSeg ? value + text.slice(segStart, nextQuote) : text.slice(segStart, nextQuote);
        pos = nextQuote + 1;
        nextQuote = text.indexOf('"', pos);
        closed = true;
        break;
      }

      if (!closed) {
        pos = open + 1;
        line = openLine;
        nextNl = text.indexOf('\n', pos);
        nextCr = text.indexOf('\r', pos);
        nextQuote = text.indexOf('"', pos);
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        const res = finishUnquoted(text, len, pos, line, '"', true, errors, recordLine, recordRow);
        fields.push(res.value);
        pos = res.pos;
        line = res.line;
        if (res.ended) continue fieldLoop;
        break fieldLoop;
      }

      if (pos >= len) {
        fields.push(value);
        break fieldLoop;
      }
      const nextC = text.charCodeAt(pos);
      if (nextC === 44) {
        fields.push(value);
        pos += 1;
        continue fieldLoop;
      }
      if (nextC === 10) {
        fields.push(value);
        pos += 1;
        line += 1;
        break fieldLoop;
      }
      if (nextC === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
        fields.push(value);
        pos += 2;
        line += 1;
        break fieldLoop;
      }

      const beforeLen = value.length;
      const res = finishUnquoted(text, len, pos, line, value, true, errors, recordLine, recordRow);
      if (res.value.length > beforeLen) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      fields.push(res.value);
      pos = res.pos;
      line = res.line;
      if (res.ended) continue fieldLoop;
      break fieldLoop;
    }

    if (fields.length === 1 && fields[0] === '' && !firstQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    const flen = fields.length;
    if (flen !== width) {
      if (flen < width) {
        errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: flen });
        for (let i = flen; i < width; i += 1) fields.push('');
      } else {
        errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
      }
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}

let cachedWasmModule = null;

function getWasmModule() {
  if (!cachedWasmModule) {
    const wasmBytes = readFileSync(new URL('./solve.wasm', import.meta.url));
    cachedWasmModule = new WebAssembly.Module(wasmBytes);
  }
  return cachedWasmModule;
}

function extractCaseSpans(rawBuf) {
  const spans = [];
  const len = rawBuf.length;
  let searchPos = 0;
  while (true) {
    const textKeyIdx = rawBuf.indexOf('"text":"', searchPos);
    if (textKeyIdx === -1) break;
    const textStart = textKeyIdx + 8;
    let probe = textStart;
    let header = true;
    let textEnd = -1;
    let nextSearch = -1;
    while (true) {
      const idx = rawBuf.indexOf('","header":', probe);
      if (idx === -1) break;
      let bs = 0;
      let k = idx - 1;
      while (k >= textStart && rawBuf[k] === 0x5c) {
        bs += 1;
        k -= 1;
      }
      if ((bs & 1) === 0) {
        if (
          idx + 17 <= len &&
          rawBuf[idx + 11] === 0x74 &&
          rawBuf[idx + 12] === 0x72 &&
          rawBuf[idx + 13] === 0x75 &&
          rawBuf[idx + 14] === 0x65 &&
          rawBuf[idx + 15] === 0x7d &&
          rawBuf[idx + 16] === 0x7d
        ) {
          header = true;
          textEnd = idx;
          nextSearch = idx + 17;
          break;
        }
        if (
          idx + 18 <= len &&
          rawBuf[idx + 11] === 0x66 &&
          rawBuf[idx + 12] === 0x61 &&
          rawBuf[idx + 13] === 0x6c &&
          rawBuf[idx + 14] === 0x73 &&
          rawBuf[idx + 15] === 0x65 &&
          rawBuf[idx + 16] === 0x7d &&
          rawBuf[idx + 17] === 0x7d
        ) {
          header = false;
          textEnd = idx;
          nextSearch = idx + 18;
          break;
        }
      }
      probe = idx + 11;
    }
    if (textEnd === -1) return null;
    spans.push({ textStart, textEnd, header });
    searchPos = nextSearch;
  }

  if (spans.length === 0) {
    return rawBuf.toString('utf8').trim() === '[]' ? spans : null;
  }
  let tail = searchPos;
  while (tail < len && (rawBuf[tail] === 0x20 || rawBuf[tail] === 0x0a || rawBuf[tail] === 0x0d || rawBuf[tail] === 0x09)) {
    tail += 1;
  }
  if (tail !== len - 1 || rawBuf[tail] !== 0x5d) return null;
  return spans;
}

function fallbackRun(rawBuf, outPath) {
  const cases = JSON.parse(rawBuf.toString('utf8'));
  const fd = openSync(outPath, 'w');
  writeSync(fd, '[');
  for (let i = 0; i < cases.length; i += 1) {
    const inp = cases[i].input;
    cases[i] = undefined;
    if (i > 0) writeSync(fd, ',');
    writeSync(fd, JSON.stringify(run(inp)));
  }
  writeSync(fd, ']');
  closeSync(fd);
}

/**
 * Transcodes /input/cases.json directly to /output/answers.json via WASM SIMD.
 */
export function transcodeCasesFile(inPath, outPath) {
  const inFd = openSync(inPath, 'r');
  const inSize = fstatSync(inFd).size;
  const inBase = 4096;
  const inEnd = inBase + inSize;
  const fsBase = (inEnd + 64 + 15) & ~15;
  const errBase = fsBase + 65536;
  const errLimit = errBase + 4 * 1024 * 1024;
  const outBase = errLimit;
  const outCap = Math.max(inSize * 2 + 1048576, 4 * 1024 * 1024);
  const totalPages = Math.ceil((outBase + outCap) / 65536);

  const mod = getWasmModule();
  const inst = new WebAssembly.Instance(mod);
  const { memory, init_layout, process_case } = inst.exports;
  if (totalPages > 1) memory.grow(totalPages - 1);

  let memU8 = new Uint8Array(memory.buffer);
  let off = 0;
  while (off < inSize) {
    const n = readSync(inFd, memU8, inBase + off, inSize - off, off);
    if (n <= 0) break;
    off += n;
  }
  closeSync(inFd);

  const rawBuf = Buffer.from(memory.buffer, inBase, inSize);
  const spans = extractCaseSpans(rawBuf);
  if (!spans) {
    fallbackRun(rawBuf, outPath);
    return;
  }
  if (spans.length === 0) {
    writeFileSync(outPath, '[]');
    return;
  }

  init_layout(fsBase, errBase, errLimit);
  let op = outBase;
  for (let i = 0; i < spans.length; i += 1) {
    if (memU8.buffer !== memory.buffer) memU8 = new Uint8Array(memory.buffer);
    memU8[op++] = i === 0 ? 0x5b : 0x2c;
    const sp = spans[i];
    op = process_case(inBase + sp.textStart, inBase + sp.textEnd, sp.header ? 1 : 0, op);
    if (op < 0) {
      if (memU8.buffer !== memory.buffer) memU8 = new Uint8Array(memory.buffer);
      fallbackRun(Buffer.from(memory.buffer, inBase, inSize), outPath);
      return;
    }
  }

  if (memU8.buffer !== memory.buffer) memU8 = new Uint8Array(memory.buffer);
  memU8[op++] = 0x5d;
  const outFd = openSync(outPath, 'w');
  let woff = 0;
  const wtotal = op - outBase;
  while (woff < wtotal) {
    woff += writeSync(outFd, memU8, outBase + woff, wtotal - woff);
  }
  closeSync(outFd);
}
