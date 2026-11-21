/**
 * High-speed drop-in replacement for csv-reader 1.0.0.
 * Fast path handles quote-free, stray-CR-free lines via SIMD indexOf + C++ split(',').
 * Slow path handles quoted fields, escaped quotes, lone CRs, quote_junk, and unterminated quotes.
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

  function readUnquoted(initialValue, recordLine, recordRow) {
    let value = initialValue;
    let added = 0;
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        return { value, ended: 0, added }; // 0 = COMMA
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        return { value, ended: 1, added }; // 1 = LINE_BREAK
      }
      if (c === 13) {
        if (pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
          pos += 2;
          line += 1;
          return { value, ended: 1, added };
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        pos += 1;
        continue;
      }
      // Scan contiguous safe run up to ',', '\n', or '\r'
      const runStart = pos;
      pos += 1;
      while (pos < len) {
        const ch = text.charCodeAt(pos);
        if (ch === 44 || ch === 10 || ch === 13) break;
        pos += 1;
      }
      value += text.slice(runStart, pos);
      added += pos - runStart;
    }
    return { value, ended: 2, added }; // 2 = END
  }

  function readQuoted(recordLine, recordRow) {
    const open = pos;
    const openLine = line;
    pos += 1;
    let value = '';
    let segStart = pos;
    let closed = false;

    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 34) {
        if (pos + 1 < len && text.charCodeAt(pos + 1) === 34) {
          if (pos > segStart) value += text.slice(segStart, pos);
          value += '"';
          pos += 2;
          segStart = pos;
          continue;
        }
        if (pos > segStart) value += text.slice(segStart, pos);
        pos += 1;
        closed = true;
        break;
      }
      if (c === 13) {
        if (pos > segStart) value += text.slice(segStart, pos);
        value += '\n';
        line += 1;
        pos += pos + 1 < len && text.charCodeAt(pos + 1) === 10 ? 2 : 1;
        segStart = pos;
        continue;
      }
      if (c === 10) {
        line += 1;
      }
      pos += 1;
    }

    if (!closed) {
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted('"', recordLine, recordRow);
    }

    if (pos >= len) return { value, ended: 2, added: 0 };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: 0, added: 0 };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: 1, added: 0 };
    }
    if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: 1, added: 0 };
    }

    const junk = readUnquoted(value, recordLine, recordRow);
    if (junk.added > 0) {
      errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    }
    return junk;
  }

  while (pos < len) {
    // Advance cached indices past current pos
    if (nextNl !== -1 && nextNl < pos) nextNl = text.indexOf('\n', pos);
    if (nextCr !== -1 && nextCr < pos) nextCr = text.indexOf('\r', pos);
    if (nextQuote !== -1 && nextQuote < pos) nextQuote = text.indexOf('"', pos);

    // Check if we can skip leading empty LF/CRLF lines quickly
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

    const lineEnd = nextNl === -1 ? len : (nextCr === nextNl - 1 ? nextNl - 1 : nextNl);
    const hasQuoteInLine = nextQuote !== -1 && nextQuote < lineEnd;
    const hasStrayCrInLine = nextCr !== -1 && nextCr < lineEnd;

    if (!hasQuoteInLine && !hasStrayCrInLine) {
      const recordLine = line;
      const recordRow = header && columns === null ? null : rows.length;
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
      if (flen < width) {
        errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: flen });
        for (let i = flen; i < width; i += 1) fields.push('');
      } else if (flen > width) {
        errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
      }
      rows.push(fields);
      continue;
    }

    // Slow path for lines with quotes or stray CRs
    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let firstQuoted = false;
    let field;
    do {
      const q = pos < len && text.charCodeAt(pos) === 34;
      if (fields.length === 0) firstQuoted = q;
      field = q ? readQuoted(recordLine, recordRow) : readUnquoted('', recordLine, recordRow);
      fields.push(field.value);
    } while (field.ended === 0);

    if (fields.length === 1 && fields[0] === '' && !firstQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    const flen = fields.length;
    if (flen < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: flen });
      for (let i = flen; i < width; i += 1) fields.push('');
    } else if (flen > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
