import test from 'node:test';
import assert from 'node:assert/strict';

import { escapeHtml, findLiquid, renderMarkdown, safeUrl } from '../src/ui/markdown.js';

test('html in the source is shown, never executed', () => {
  const html = renderMarkdown('<script>alert(1)</script>');
  assert.ok(!html.includes('<script'), html);
  assert.ok(html.includes('&lt;script&gt;'));
});

test('an attribute-injection attempt stays text', () => {
  const html = renderMarkdown('<img src=x onerror="alert(1)">');
  // `onerror=` is still in the output, as the characters o-n-e-r-r-o-r-=
  // inside a paragraph. What matters is that no tag was built around them.
  assert.ok(!/<img[\s>]/i.test(html), html);
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('&quot;alert(1)&quot;'));
});

test('javascript: and data: links are defused', () => {
  for (const scheme of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>']) {
    assert.equal(safeUrl(scheme), '#', scheme);
  }
  const html = renderMarkdown('[click](javascript:alert(1))');
  assert.ok(!html.toLowerCase().includes('javascript:'), html);
});

test('ordinary links and relative paths survive', () => {
  assert.equal(safeUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(safeUrl('/posts/x/'), '/posts/x/');
  assert.equal(safeUrl('#section'), '#section');
  assert.equal(safeUrl('./other.md'), './other.md');

  const html = renderMarkdown('[x](/posts/x/)');
  assert.ok(html.includes('href="/posts/x/"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
});

test('an image tag is built from the escaped alt and a checked src', () => {
  const html = renderMarkdown('![a "quote"](/assets/img/posts/x.png)');
  assert.ok(html.includes('src="/assets/img/posts/x.png"'));
  assert.ok(!html.includes('alt="a "quote""'), 'the alt must not break out of its attribute');
});

test('headings, lists, quotes and code render', () => {
  assert.ok(renderMarkdown('## Title').includes('<h2>Title</h2>'));
  assert.ok(renderMarkdown('- one\n- two').includes('<ul>'));
  assert.ok(renderMarkdown('1. one').includes('<ol>'));
  assert.ok(renderMarkdown('> quoted').includes('<blockquote>'));
  assert.ok(renderMarkdown('**b** and *i*').includes('<strong>b</strong>'));
});

test('a fenced block keeps its contents as text', () => {
  const html = renderMarkdown('```\n<script>alert(1)</script>\n```');
  assert.ok(html.includes('<pre><code>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script'));
});

test('an unterminated fence does not leak out of the code block', () => {
  const html = renderMarkdown('```\n<b>still code</b>');
  assert.ok(html.includes('<pre><code>'));
  assert.ok(!html.includes('<b>'));
});

test('liquid is reported with line numbers rather than rendered', () => {
  const found = findLiquid('text\n{% include x.html %}\n{{ page.title }}');
  assert.equal(found.length, 2);
  assert.equal(found[0].line, 2);
  assert.equal(found[1].line, 3);
  assert.equal(findLiquid('no liquid here').length, 0);
});

test('escapeHtml covers the five characters that matter', () => {
  assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
});
