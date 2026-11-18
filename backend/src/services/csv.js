const { error } = require('./common');

function parseCsv(input) {
  if (typeof input !== 'string' || !input.trim()) error(400, 'Choose a non-empty CSV file.');
  const source = input.replace(/^\uFEFF/, '');
  const rows = [];
  let fields = [], field = '', quoted = false, closedQuote = false, line = 1, rowLine = 1;
  function finishRow() {
    fields.push(field);
    if (fields.some(value => value.trim())) rows.push({ line: rowLine, fields });
    fields = []; field = ''; closedQuote = false;
  }
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { field += '"'; index++; }
        else { quoted = false; closedQuote = true; }
      } else {
        field += char;
        if (char === '\n') line++;
      }
      continue;
    }
    if (char === ',') { fields.push(field); field = ''; closedQuote = false; continue; }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && source[index + 1] === '\n') index++;
      finishRow(); line++; rowLine = line; continue;
    }
    if (char === '"' && field === '' && !closedQuote) { quoted = true; continue; }
    if (closedQuote && (char === ' ' || char === '\t')) continue;
    if (closedQuote || char === '"') error(400, `Invalid CSV quoting near line ${line}.`);
    field += char;
  }
  if (quoted) error(400, `Unclosed CSV quote starting near line ${rowLine}.`);
  if (field !== '' || fields.length) finishRow();
  return rows;
}

module.exports = { parseCsv };
