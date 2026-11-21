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

const CODE_STRAY_CR = Buffer.from('{"code":"stray_cr","line":');
const CODE_QUOTE_JUNK = Buffer.from('{"code":"quote_junk","line":');
const CODE_UNTERM = Buffer.from('{"code":"unterminated_quote","line":');
const CODE_SHORT = Buffer.from('{"code":"short_row","line":');
const CODE_LONG = Buffer.from('{"code":"long_row","line":');
const ROW_NULL = Buffer.from(',"row":null}');
const ROW_PRE = Buffer.from(',"row":');
const FIELDS_PRE = Buffer.from(',"fields":');
const EXTRA_PRE = Buffer.from(',"extra":[');
const COL_NULL_ROWS = Buffer.from('{"columns":null,"rows":[');
const COL_PRE = Buffer.from('{"columns":');
const ROWS_OPEN = Buffer.from(',"rows":[');
const ERRORS_PRE = Buffer.from(',"errors":[');

function writeUint(dst, pos, v) {
  if (v === 0) {
    dst[pos] = 0x30;
    return pos + 1;
  }
  const d0 = pos;
  let x = v | 0;
  while (x > 0) {
    const q = (x / 10) | 0;
    dst[pos++] = 0x30 + (x - q * 10);
    x = q;
  }
  let l = d0;
  let r = pos - 1;
  while (l < r) {
    const t = dst[l];
    dst[l] = dst[r];
    dst[r] = t;
    l += 1;
    r -= 1;
  }
  return pos;
}

class ByteWriterState {
  constructor(outCap) {
    this.outBuf = Buffer.allocUnsafe(outCap);
    this.out = new Uint8Array(this.outBuf.buffer, this.outBuf.byteOffset, this.outBuf.byteLength);
    this.op = 0;
    this.errBuf = Buffer.allocUnsafe(256 * 1024);
    this.err = new Uint8Array(this.errBuf.buffer, this.errBuf.byteOffset, this.errBuf.byteLength);
    this.eop = 0;
    this.fieldStarts = new Int32Array(256);
  }

  growOut(need) {
    const nb = Buffer.allocUnsafe(Math.max(this.out.length * 2, need + 1048576));
    nb.set(this.out.subarray(0, this.op), 0);
    this.outBuf = nb;
    this.out = new Uint8Array(nb.buffer, nb.byteOffset, nb.byteLength);
  }

  growErr(need) {
    const nb = Buffer.allocUnsafe(Math.max(this.err.length * 2, need + 65536));
    nb.set(this.err.subarray(0, this.eop), 0);
    this.errBuf = nb;
    this.err = new Uint8Array(nb.buffer, nb.byteOffset, nb.byteLength);
  }

  emitSimple(codeBuf, line, row) {
    if (this.eop + 80 > this.err.length) this.growErr(this.eop + 80);
    const err = this.err;
    let eop = this.eop;
    if (eop > 0) err[eop++] = 0x2c;
    err.set(codeBuf, eop);
    eop += codeBuf.length;
    eop = writeUint(err, eop, line);
    if (row < 0) {
      err.set(ROW_NULL, eop);
      eop += ROW_NULL.length;
    } else {
      err.set(ROW_PRE, eop);
      eop += ROW_PRE.length;
      eop = writeUint(err, eop, row);
      err[eop++] = 0x7d;
    }
    this.eop = eop;
  }

  emitShort(line, row, flen) {
    if (this.eop + 96 > this.err.length) this.growErr(this.eop + 96);
    const err = this.err;
    let eop = this.eop;
    if (eop > 0) err[eop++] = 0x2c;
    err.set(CODE_SHORT, eop);
    eop += CODE_SHORT.length;
    eop = writeUint(err, eop, line);
    err.set(ROW_PRE, eop);
    eop += ROW_PRE.length;
    eop = writeUint(err, eop, row);
    err.set(FIELDS_PRE, eop);
    eop += FIELDS_PRE.length;
    eop = writeUint(err, eop, flen);
    err[eop++] = 0x7d;
    this.eop = eop;
  }

  emitLong(line, row, startOff, endOff) {
    const sliceLen = endOff - startOff;
    if (this.eop + sliceLen + 96 > this.err.length) this.growErr(this.eop + sliceLen + 96);
    const err = this.err;
    let eop = this.eop;
    if (eop > 0) err[eop++] = 0x2c;
    err.set(CODE_LONG, eop);
    eop += CODE_LONG.length;
    eop = writeUint(err, eop, line);
    err.set(ROW_PRE, eop);
    eop += ROW_PRE.length;
    eop = writeUint(err, eop, row);
    err.set(EXTRA_PRE, eop);
    eop += EXTRA_PRE.length;
    err.set(this.out.subarray(startOff, endOff), eop);
    eop += sliceLen;
    err[eop++] = 0x5d;
    err[eop++] = 0x7d;
    this.eop = eop;
  }
}

function readQuotedAndTail(st, src, textEnd, p, line, recordLine, recordRow, fieldDataStart) {
  let out = st.out;
  let op = st.op;
  const open = p;
  const openLine = line;
  p += 2;
  let closed = false;
  while (p < textEnd) {
    const b = src[p];
    if (b !== 0x5c) {
      out[op++] = b;
      p += 1;
      continue;
    }
    const b2 = src[p + 1];
    if (b2 === 0x22) {
      if (p + 3 < textEnd && src[p + 2] === 0x5c && src[p + 3] === 0x22) {
        out[op++] = 0x5c;
        out[op++] = 0x22;
        p += 4;
        continue;
      }
      p += 2;
      closed = true;
      break;
    }
    if (b2 === 0x72) {
      out[op++] = 0x5c;
      out[op++] = 0x6e;
      line += 1;
      p += p + 3 < textEnd && src[p + 2] === 0x5c && src[p + 3] === 0x6e ? 4 : 2;
      continue;
    }
    if (b2 === 0x6e) {
      out[op++] = 0x5c;
      out[op++] = 0x6e;
      line += 1;
      p += 2;
      continue;
    }
    out[op++] = 0x5c;
    out[op++] = b2;
    p += 2;
  }

  if (!closed) {
    st.emitSimple(CODE_UNTERM, recordLine, recordRow);
    op = fieldDataStart;
    out[op++] = 0x5c;
    out[op++] = 0x22;
    st.op = op;
    st.p = open + 2;
    st.line = openLine;
    return 0; // continue unquoted
  }

  if (p >= textEnd) {
    out[op++] = 0x22;
    st.op = op;
    st.p = p;
    st.line = line;
    return 2; // end of record
  }
  const nb = src[p];
  if (nb === 0x2c) {
    out[op++] = 0x22;
    st.op = op;
    st.p = p + 1;
    st.line = line;
    return 1; // next field
  }
  if (nb === 0x5c) {
    const nb2 = src[p + 1];
    if (nb2 === 0x6e) {
      out[op++] = 0x22;
      st.op = op;
      st.p = p + 2;
      st.line = line + 1;
      return 2;
    }
    if (nb2 === 0x72 && p + 3 < textEnd && src[p + 2] === 0x5c && src[p + 3] === 0x6e) {
      out[op++] = 0x22;
      st.op = op;
      st.p = p + 4;
      st.line = line + 1;
      return 2;
    }
  }

  let junkAdded = 0;
  while (p < textEnd) {
    const jb = src[p];
    if (jb === 0x2c) {
      if (junkAdded > 0) st.emitSimple(CODE_QUOTE_JUNK, recordLine, recordRow);
      out[op++] = 0x22;
      st.op = op;
      st.p = p + 1;
      st.line = line;
      return 1;
    }
    if (jb === 0x5c) {
      const jb2 = src[p + 1];
      if (jb2 === 0x6e) {
        if (junkAdded > 0) st.emitSimple(CODE_QUOTE_JUNK, recordLine, recordRow);
        out[op++] = 0x22;
        st.op = op;
        st.p = p + 2;
        st.line = line + 1;
        return 2;
      }
      if (jb2 === 0x72) {
        if (p + 3 < textEnd && src[p + 2] === 0x5c && src[p + 3] === 0x6e) {
          if (junkAdded > 0) st.emitSimple(CODE_QUOTE_JUNK, recordLine, recordRow);
          out[op++] = 0x22;
          st.op = op;
          st.p = p + 4;
          st.line = line + 1;
          return 2;
        }
        st.emitSimple(CODE_STRAY_CR, recordLine, recordRow);
        p += 2;
        continue;
      }
      out[op++] = 0x5c;
      out[op++] = jb2;
      p += 2;
      junkAdded = 1;
      continue;
    }
    out[op++] = jb;
    p += 1;
    junkAdded = 1;
  }
  if (junkAdded > 0) st.emitSimple(CODE_QUOTE_JUNK, recordLine, recordRow);
  out[op++] = 0x22;
  st.op = op;
  st.p = p;
  st.line = line;
  return 2;
}

function processCaseBytes(st, src, textStart, textEnd, header) {
  let out = st.out;
  let op = st.op;
  let fieldStarts = st.fieldStarts;
  st.eop = 0;

  let p = textStart;
  if (p + 3 <= textEnd && src[p] === 0xef && src[p + 1] === 0xbb && src[p + 2] === 0xbf) {
    p += 3;
  } else if (
    p + 6 <= textEnd &&
    src[p] === 0x5c &&
    src[p + 1] === 0x75 &&
    (src[p + 2] === 0x66 || src[p + 2] === 0x46) &&
    (src[p + 3] === 0x65 || src[p + 3] === 0x45) &&
    (src[p + 4] === 0x66 || src[p + 4] === 0x46) &&
    (src[p + 5] === 0x66 || src[p + 5] === 0x46)
  ) {
    p += 6;
  }

  let line = 1;
  let width = -1;
  let columnsDone = !header;
  let rowCount = 0;

  if (op + (textEnd - p) * 3 + 4096 > out.length) {
    st.op = op;
    st.growOut(op + (textEnd - p) * 3 + 4096);
    out = st.out;
  }

  if (header) {
    out.set(COL_PRE, op);
    op += COL_PRE.length;
  } else {
    out.set(COL_NULL_ROWS, op);
    op += COL_NULL_ROWS.length;
  }

  while (p < textEnd) {
    while (p < textEnd) {
      if (src[p] === 0x5c) {
        const b2 = src[p + 1];
        if (b2 === 0x6e) {
          p += 2;
          line += 1;
          continue;
        }
        if (b2 === 0x72 && p + 3 < textEnd && src[p + 2] === 0x5c && src[p + 3] === 0x6e) {
          p += 4;
          line += 1;
          continue;
        }
      }
      break;
    }
    if (p >= textEnd) break;

    const recordLine = line;
    const recordRow = columnsDone ? rowCount : -1;
    const rowStartOp = op;

    if (columnsDone && rowCount > 0) out[op++] = 0x2c;
    out[op++] = 0x5b;

    let flen = 0;
    let firstQuoted = false;

    fieldLoop: while (true) {
      if (flen >= fieldStarts.length) {
        const nf = new Int32Array(fieldStarts.length * 2);
        nf.set(fieldStarts);
        fieldStarts = nf;
        st.fieldStarts = nf;
      }
      if (flen > 0) out[op++] = 0x2c;
      const isQuoted = p + 1 < textEnd && src[p] === 0x5c && src[p + 1] === 0x22;
      if (flen === 0) firstQuoted = isQuoted;

      fieldStarts[flen++] = op;
      out[op++] = 0x22;

      if (isQuoted) {
        st.op = op;
        const rc = readQuotedAndTail(st, src, textEnd, p, line, recordLine, recordRow, op);
        op = st.op;
        p = st.p;
        line = st.line;
        if (rc === 1) continue fieldLoop;
        if (rc === 2) break fieldLoop;
      }

      while (p < textEnd) {
        const b = src[p];
        if (b === 0x2c) {
          p += 1;
          if (p + 1 < textEnd && src[p] === 0x5c && src[p + 1] === 0x22) {
            out[op++] = 0x22;
            continue fieldLoop;
          }
          if (flen >= fieldStarts.length) {
            const nf = new Int32Array(fieldStarts.length * 2);
            nf.set(fieldStarts);
            fieldStarts = nf;
            st.fieldStarts = nf;
          }
          out[op++] = 0x22;
          out[op++] = 0x2c;
          fieldStarts[flen++] = op;
          out[op++] = 0x22;
          continue;
        }
        if (b === 0x5c) {
          const b2 = src[p + 1];
          if (b2 === 0x6e) {
            out[op++] = 0x22;
            p += 2;
            line += 1;
            break fieldLoop;
          }
          if (b2 === 0x72) {
            if (p + 3 < textEnd && src[p + 2] === 0x5c && src[p + 3] === 0x6e) {
              out[op++] = 0x22;
              p += 4;
              line += 1;
              break fieldLoop;
            }
            st.emitSimple(CODE_STRAY_CR, recordLine, recordRow);
            p += 2;
            continue;
          }
          out[op++] = 0x5c;
          out[op++] = b2;
          p += 2;
          continue;
        }
        out[op++] = b;
        p += 1;
      }
      out[op++] = 0x22;
      break fieldLoop;
    }

    if (flen === 1 && !firstQuoted && op === rowStartOp + (columnsDone && rowCount > 0 ? 4 : 3)) {
      op = rowStartOp;
      continue;
    }

    if (width < 0) width = flen;

    if (!columnsDone) {
      out[op++] = 0x5d;
      out.set(ROWS_OPEN, op);
      op += ROWS_OPEN.length;
      columnsDone = true;
      continue;
    }

    if (flen < width) {
      st.emitShort(recordLine, recordRow, flen);
      if (op + (width - flen) * 3 + 16 > out.length) {
        st.op = op;
        st.growOut(op + (width - flen) * 3 + 16);
        out = st.out;
      }
      for (let k = flen; k < width; k++) {
        out[op++] = 0x2c;
        out[op++] = 0x22;
        out[op++] = 0x22;
      }
      out[op++] = 0x5d;
    } else if (flen > width) {
      const cutStart = fieldStarts[width];
      st.emitLong(recordLine, recordRow, cutStart, op);
      op = cutStart - 1;
      out[op++] = 0x5d;
    } else {
      out[op++] = 0x5d;
    }
    rowCount += 1;
  }

  if (!columnsDone) {
    out[op++] = 0x5b;
    out[op++] = 0x5d;
    out.set(ROWS_OPEN, op);
    op += ROWS_OPEN.length;
  }
  out[op++] = 0x5d;
  out.set(ERRORS_PRE, op);
  op += ERRORS_PRE.length;
  if (st.eop > 0) {
    if (op + st.eop + 16 > out.length) {
      st.op = op;
      st.growOut(op + st.eop + 16);
      out = st.out;
    }
    out.set(st.err.subarray(0, st.eop), op);
    op += st.eop;
  }
  out[op++] = 0x5d;
  out[op++] = 0x7d;
  st.op = op;
}

const WARM_SAMPLE = Buffer.from(
  'a,b,c\\r\\n\\"d\\"\\"e\\",f,g\\n\\"h\\"junk,i,j\\nk\\rl,m,n,o\\np\\n'.repeat(8) + '\\"unterm',
);
const WARM_U8 = new Uint8Array(WARM_SAMPLE.buffer, WARM_SAMPLE.byteOffset, WARM_SAMPLE.byteLength);

export function primeTranscoder(st) {
  for (let w = 0; w < 600; w++) {
    st.op = 0;
    processCaseBytes(st, WARM_U8, 0, WARM_U8.length, (w & 1) === 0);
  }
  st.op = 0;
}

function extractCaseSpans(rawBuf, src) {
  const spans = [];
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
      while (k >= textStart && src[k] === 0x5c) {
        bs += 1;
        k -= 1;
      }
      if ((bs & 1) === 0) {
        if (
          idx + 17 <= src.length &&
          src[idx + 11] === 0x74 &&
          src[idx + 12] === 0x72 &&
          src[idx + 13] === 0x75 &&
          src[idx + 14] === 0x65 &&
          src[idx + 15] === 0x7d &&
          src[idx + 16] === 0x7d
        ) {
          header = true;
          textEnd = idx;
          nextSearch = idx + 17;
          break;
        }
        if (
          idx + 18 <= src.length &&
          src[idx + 11] === 0x66 &&
          src[idx + 12] === 0x61 &&
          src[idx + 13] === 0x6c &&
          src[idx + 14] === 0x73 &&
          src[idx + 15] === 0x65 &&
          src[idx + 16] === 0x7d &&
          src[idx + 17] === 0x7d
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
  while (tail < src.length && (src[tail] === 0x20 || src[tail] === 0x0a || src[tail] === 0x0d || src[tail] === 0x09)) {
    tail += 1;
  }
  if (tail !== src.length - 1 || src[tail] !== 0x5d) return null;
  return spans;
}

/**
 * Transcodes raw /input/cases.json UTF-8 bytes directly to /output/answers.json bytes.
 * Returns null if the JSON framing deviates from the standard cases.json layout.
 */
export function transcodeCasesBuffer(rawBuf) {
  const src = new Uint8Array(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength);
  const spans = extractCaseSpans(rawBuf, src);
  if (!spans) return null;
  if (spans.length === 0) return Buffer.from('[]');

  const st = new ByteWriterState(8 * 1024 * 1024);
  primeTranscoder(st);

  const chunks = [];
  for (let i = 0; i < spans.length; i++) {
    const sp = spans[i];
    st.op = 0;
    st.out[st.op++] = i === 0 ? 0x5b : 0x2c;
    processCaseBytes(st, src, sp.textStart, sp.textEnd, sp.header);
    chunks.push(Buffer.from(st.out.subarray(0, st.op)));
  }
  chunks.push(Buffer.from(']'));
  return Buffer.concat(chunks);
}

/**
 * Streams transcoded /input/cases.json UTF-8 bytes via writeChunk, reusing one output buffer.
 * Returns false if the JSON framing deviates from the standard cases.json layout.
 */
export function transcodeCasesToWriter(rawBuf, writeChunk) {
  const src = new Uint8Array(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength);
  const spans = extractCaseSpans(rawBuf, src);
  if (!spans) return false;
  if (spans.length === 0) {
    writeChunk(Buffer.from('[]'));
    return true;
  }

  const st = new ByteWriterState(8 * 1024 * 1024);
  primeTranscoder(st);

  for (let i = 0; i < spans.length; i++) {
    const sp = spans[i];
    st.op = 0;
    st.out[st.op++] = i === 0 ? 0x5b : 0x2c;
    processCaseBytes(st, src, sp.textStart, sp.textEnd, sp.header);
    writeChunk(st.outBuf.subarray(0, st.op));
  }
  writeChunk(Buffer.from(']'));
  return true;
}
