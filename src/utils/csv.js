// Tiny CSV parser — handles quoted fields with embedded commas, escaped
// double quotes (""), and either CRLF or LF line endings. Sufficient for
// hand-edited and Excel-exported invitation lists.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
      i++;
    } else if (ch === '\r') {
      i++;
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else {
      cell += ch;
      i++;
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // Trim a possible final empty row from a trailing newline.
  while (rows.length && rows[rows.length - 1].every((c) => !c.trim())) {
    rows.pop();
  }

  return rows;
}

// Build a header → column-index lookup that's case- and whitespace-tolerant.
export function buildHeaderIndex(headerRow) {
  const map = {};
  headerRow.forEach((h, i) => {
    const key = String(h || '').trim().toLowerCase();
    if (key) map[key] = i;
  });
  return {
    find: (...names) => {
      for (const n of names) {
        if (map[n.toLowerCase()] !== undefined) return map[n.toLowerCase()];
      }
      return -1;
    }
  };
}
