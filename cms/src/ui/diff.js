// A line diff for the revision view.
//
// Pure, and small enough to read: the editor needs to show what a past
// version changed, and pulling in a diff library to do it would be the only
// dependency in the project.
//
// Common prefix and suffix are trimmed before anything quadratic runs, which
// is what makes this usable on a long post - the usual edit touches one
// paragraph, so the table is built over a handful of lines and not the file.

const MAX_TABLE = 1200 * 1200;

function lcsTable(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Int32Array(rows * cols);

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] = a[i] === b[j]
        ? table[(i + 1) * cols + j + 1] + 1
        : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }
  return { table, cols };
}

function walk(a, b, out) {
  // Past this size the table costs more memory than the answer is worth, and
  // a whole-file replacement is still a true description of the change.
  if (a.length * b.length > MAX_TABLE) {
    a.forEach((text) => out.push({ type: 'del', text }));
    b.forEach((text) => out.push({ type: 'add', text }));
    return;
  }

  const { table, cols } = lcsTable(a, b);
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
      out.push({ type: 'del', text: a[i] });
      i += 1;
    } else {
      out.push({ type: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) out.push({ type: 'del', text: a[i++] });
  while (j < b.length) out.push({ type: 'add', text: b[j++] });
}

/** Lines of `before` and `after`, tagged same / del / add, in reading order. */
export function diffLines(before, after) {
  const a = String(before).split('\n');
  const b = String(after).split('\n');

  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;

  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) tail += 1;

  const out = a.slice(0, head).map((text) => ({ type: 'same', text }));
  walk(a.slice(head, a.length - tail), b.slice(head, b.length - tail), out);
  a.slice(a.length - tail).forEach((text) => out.push({ type: 'same', text }));

  return out;
}

export function diffStat(lines) {
  return {
    added: lines.filter((line) => line.type === 'add').length,
    removed: lines.filter((line) => line.type === 'del').length
  };
}

/**
 * Unchanged runs longer than `context` collapse to a marker, so a one-line
 * edit in a long post is one screen and not a scroll through the whole file.
 */
export function collapse(lines, context = 3) {
  const keep = new Array(lines.length).fill(false);

  lines.forEach((line, index) => {
    if (line.type === 'same') return;
    for (let i = Math.max(0, index - context); i <= Math.min(lines.length - 1, index + context); i += 1) {
      keep[i] = true;
    }
  });

  const out = [];
  let skipped = 0;

  lines.forEach((line, index) => {
    if (keep[index]) {
      if (skipped) {
        out.push({ type: 'gap', count: skipped });
        skipped = 0;
      }
      out.push(line);
    } else {
      skipped += 1;
    }
  });
  if (skipped) out.push({ type: 'gap', count: skipped });

  return out;
}
