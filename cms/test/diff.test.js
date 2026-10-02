import test from 'node:test';
import assert from 'node:assert/strict';

import { collapse, diffLines, diffStat } from '../src/ui/diff.js';

const texts = (lines, type) => lines.filter((l) => l.type === type).map((l) => l.text);

test('an unchanged file has no additions or deletions', () => {
  const lines = diffLines('a\nb\nc', 'a\nb\nc');
  assert.deepEqual(diffStat(lines), { added: 0, removed: 0 });
  assert.equal(lines.length, 3);
});

test('a changed line reads as one removal and one addition', () => {
  const lines = diffLines('a\nb\nc', 'a\nB\nc');
  assert.deepEqual(diffStat(lines), { added: 1, removed: 1 });
  assert.deepEqual(texts(lines, 'del'), ['b']);
  assert.deepEqual(texts(lines, 'add'), ['B']);
});

test('insertions and deletions at the edges are found', () => {
  assert.deepEqual(diffStat(diffLines('b\nc', 'a\nb\nc')), { added: 1, removed: 0 });
  assert.deepEqual(diffStat(diffLines('a\nb\nc', 'a\nb')), { added: 0, removed: 1 });
});

test('every line of the original is accounted for, in order', () => {
  const before = '# 제목\n\n첫 문단\n\n둘째 문단\n';
  const after = '# 제목\n\n첫 문단을 고쳤다\n\n둘째 문단\n새 줄\n';
  const lines = diffLines(before, after);

  // What survives plus what was removed is exactly the original.
  const original = lines.filter((l) => l.type !== 'add').map((l) => l.text).join('\n');
  assert.equal(original, before);
  // What survives plus what was added is exactly the new version.
  const result = lines.filter((l) => l.type !== 'del').map((l) => l.text).join('\n');
  assert.equal(result, after);
});

test('a long post with one edited line stays a small diff', () => {
  const before = Array.from({ length: 4000 }, (_, i) => `line ${i}`).join('\n');
  const after = before.replace('line 2000', 'line 2000 edited');

  const lines = diffLines(before, after);
  assert.deepEqual(diffStat(lines), { added: 1, removed: 1 });
});

test('two files with nothing in common are a replacement, not a hang', () => {
  const before = Array.from({ length: 1500 }, (_, i) => `a${i}`).join('\n');
  const after = Array.from({ length: 1500 }, (_, i) => `b${i}`).join('\n');

  const lines = diffLines(before, after);
  assert.deepEqual(diffStat(lines), { added: 1500, removed: 1500 });
});

test('unchanged stretches collapse to a gap, with context kept around edits', () => {
  const before = Array.from({ length: 40 }, (_, i) => `l${i}`).join('\n');
  const after = before.replace('l20', 'l20!');

  const shown = collapse(diffLines(before, after), 2);
  assert.deepEqual(shown.filter((l) => l.type === 'gap').map((l) => l.count), [18, 17]);
  assert.deepEqual(texts(shown, 'same'), ['l18', 'l19', 'l21', 'l22']);
});

test('a diff with no changes collapses to a single gap', () => {
  const shown = collapse(diffLines('a\nb\nc', 'a\nb\nc'));
  assert.deepEqual(shown, [{ type: 'gap', count: 3 }]);
});
