// Small RFC 4180 CSV reader/writer (quoted fields, embedded commas/newlines, BOM, CRLF, ; or tab delimiters)

const detectDelimiter = (text) => {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && counts[ch] !== undefined) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
};

// Returns an array of rows, each an array of strings. Blank lines are skipped.
const parseCSV = (input, delimiterOverride) => {
  let text = String(input || '');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const delimiter = delimiterOverride || detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => {
    pushField();
    if (!(row.length === 1 && row[0].trim() === '')) rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === '') { inQuotes = true; i++; continue; }
    if (c === delimiter) { pushField(); i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { pushRow(); i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length > 0) pushRow();
  if (inQuotes) {
    const err = new Error('CSV has an unclosed quote');
    err.code = 'CSV_UNCLOSED_QUOTE';
    throw err;
  }
  return rows;
};

// Neutralises spreadsheet formulas (=, +, -, @) so opening an export in Excel cannot run them
const safeCell = (value) => {
  const s = value === null || value === undefined ? '' : String(value);
  return /^[=+\-@]/.test(s) && !/^[-+]?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
};

const toCSV = (rows) =>
  rows.map((r) => r.map((cell) => `"${safeCell(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');

module.exports = { parseCSV, toCSV, detectDelimiter };
