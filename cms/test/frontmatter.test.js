import test from 'node:test';
import assert from 'node:assert/strict';

import {
  joinFrontMatter,
  postPath,
  readField,
  setField,
  slugify,
  splitFrontMatter,
  yamlList,
  yamlScalar
} from '../src/ui/frontmatter.js';

const SAMPLE = `---
# written by hand, keep the order
title: "A post: with a colon"
date: 2026-10-02 09:00:00 +0900
categories: [Notes, Spring]
tags: [Spring, Transaction]
status: draft
some_unknown_field: keep me
---
body line one

body line two
`;

test('split and join are lossless for an untouched document', () => {
  const { raw, body, hasFrontMatter } = splitFrontMatter(SAMPLE);
  assert.ok(hasFrontMatter);
  assert.equal(joinFrontMatter(raw, body), SAMPLE);
});

test('a file with no front matter is all body', () => {
  const { raw, body, hasFrontMatter } = splitFrontMatter('# Closure\n\ntext\n');
  assert.equal(hasFrontMatter, false);
  assert.equal(raw, '');
  assert.equal(body, '# Closure\n\ntext\n');
});

test('editing one field leaves comments, order and unknown fields alone', () => {
  const { raw, body } = splitFrontMatter(SAMPLE);
  const updated = setField(raw, 'status', 'published');

  assert.ok(updated.includes('# written by hand, keep the order'));
  assert.ok(updated.includes('some_unknown_field: keep me'));
  assert.ok(updated.includes('title: "A post: with a colon"'), 'the quoting style is untouched');
  assert.equal(readField(updated, 'status'), 'published');

  const keys = updated.split('\n').filter((l) => l.includes(':') && !l.startsWith('#'))
    .map((l) => l.split(':')[0]);
  assert.deepEqual(keys, ['title', 'date', 'categories', 'tags', 'status', 'some_unknown_field']);
  assert.equal(joinFrontMatter(updated, body).split('\n').length, SAMPLE.split('\n').length);
});

test('an absent field is appended, not inserted into the middle', () => {
  const { raw } = splitFrontMatter(SAMPLE);
  const updated = setField(raw, 'pin', 'true');
  assert.equal(updated.split('\n').at(-1), 'pin: true');
});

test('a null value removes the line', () => {
  const { raw } = splitFrontMatter(SAMPLE);
  const updated = setField(raw, 'status', null);
  assert.equal(readField(updated, 'status'), null);
  assert.ok(updated.includes('tags:'));
});

test('a nested key is not mistaken for the top-level one', () => {
  const raw = 'image:\n  path: /a.png\n  alt: text\ntitle: real';
  assert.equal(readField(raw, 'path'), null, 'path is nested under image');
  assert.equal(readField(raw, 'title'), 'real');

  const updated = setField(raw, 'title', 'changed');
  assert.ok(updated.includes('  path: /a.png'), 'the nested mapping is untouched');
});

test('a value is quoted only when yaml would read it as something else', () => {
  assert.equal(yamlScalar('Simple title'), 'Simple title');
  assert.equal(yamlScalar('한글 제목'), '한글 제목');
  assert.equal(yamlScalar('With: colon'), '"With: colon"');
  assert.equal(yamlScalar('true'), '"true"');
  assert.equal(yamlScalar('no'), '"no"');
  assert.equal(yamlScalar(''), '""');
  assert.equal(yamlScalar('say "hi"'), '"say \\"hi\\""');
});

test('lists use the flow style the repository already uses', () => {
  assert.equal(yamlList(['Notes', 'Spring']), '[Notes, Spring]');
  assert.equal(yamlList(['With: colon']), '["With: colon"]');
});

test('a new post lands at the path the contract expects', () => {
  assert.equal(postPath('notes', '2026-10-02', 'spring-transaction-event'),
    '_posts/notes/2026-10-02-spring-transaction-event.md');
});

test('slugify keeps hangul and drops punctuation', () => {
  assert.equal(slugify('Spring 트랜잭션 이벤트 정리'), 'spring-트랜잭션-이벤트-정리');
  assert.equal(slugify('A post: with a colon!'), 'a-post-with-a-colon');
  assert.equal(slugify('---trim---'), 'trim');
});
