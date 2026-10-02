import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendSources, citationBlock, findCitations, parseSources, renderWithCitations,
  sourceBlock, suggestSourceId, unknownSources, withoutCitations, yamlScalar
} from '../src/ui/citations.js';
import { findLiquid } from '../src/ui/markdown.js';

const REGISTRY = `# Sources that posts quote
kleppmann-distributed-locking:
  type: article
  title: How to do distributed locking
  author: Martin Kleppmann
  published: 2016-02-08
  url: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html

optuna:
  type: paper
  title: 'Optuna: A Next-generation Framework'
  author: "Takuya Akiba et al."
`;

test('the registry is read in the shape the site writes it', () => {
  const sources = parseSources(REGISTRY);
  assert.deepEqual(Object.keys(sources), ['kleppmann-distributed-locking', 'optuna']);
  assert.equal(sources['kleppmann-distributed-locking'].published, '2016-02-08');
  assert.equal(sources.optuna.title, 'Optuna: A Next-generation Framework');
  assert.equal(sources.optuna.author, 'Takuya Akiba et al.');
});

test('scalars are quoted only when YAML would misread them', () => {
  assert.equal(yamlScalar('How to do distributed locking'), 'How to do distributed locking');
  assert.equal(yamlScalar('https://a.example/x?y=1'), 'https://a.example/x?y=1');
  assert.equal(yamlScalar('Optuna: A Framework'), '"Optuna: A Framework"');
  assert.equal(yamlScalar('C# in depth #2'), '"C# in depth #2"');
  assert.equal(yamlScalar('yes'), '"yes"');
  assert.equal(yamlScalar('"quoted"'), '"\\"quoted\\""');
  assert.equal(yamlScalar('- dash'), '"- dash"');
});

test('a new entry is appended after the existing ones and reads back', () => {
  const entry = { url: 'https://doi.org/10.1/x', type: 'paper', title: 'A: B', author: '' };
  const text = appendSources(REGISTRY, [{ id: 'a-b', entry }]);
  assert.ok(text.startsWith(REGISTRY.trimEnd()));
  assert.ok(text.endsWith('\n'));
  assert.equal(sourceBlock('a-b', entry), 'a-b:\n  type: paper\n  title: "A: B"\n  url: https://doi.org/10.1/x');
  assert.deepEqual(parseSources(text)['a-b'], { type: 'paper', title: 'A: B', url: 'https://doi.org/10.1/x' });
  assert.equal(appendSources('', [{ id: 'x', entry: { type: 'web', title: 'X' } }]), 'x:\n  type: web\n  title: X\n');
});

test('ids follow the add-source script and never collide', () => {
  const taken = parseSources(REGISTRY);
  assert.equal(suggestSourceId({ type: 'rfc', number: '9110' }, taken), 'rfc-9110');
  assert.equal(suggestSourceId({ type: 'code', repo: 'netty/netty', path: 'a/NioEventLoop.java' }), 'netty-nioeventloop');
  assert.equal(suggestSourceId({ type: 'paper', author: 'Takuya Akiba et al.', title: 'Optuna' }), 'akiba-optuna');
  assert.equal(suggestSourceId({ type: 'doc', publisher: 'PostgreSQL Documentation', title: '13.2. Transaction Isolation' }),
    'postgresql-transaction-isolation');
  assert.equal(suggestSourceId({ type: 'article', title: '한글 제목', url: 'https://blog.example/p/1' }), 'blog-example-p-1');
  assert.equal(suggestSourceId({ type: 'web', title: 'Optuna' }, { optuna: {} }), 'optuna-2');
});

test('the block is what citations.rb parses, and reads back the same', () => {
  const block = citationBlock({ id: 'optuna', at: 'p. "4"', quote: ' "quoted" ', note: 'my note' });
  assert.equal(block, '{% citation optuna at="p. \\"4\\"" %}\n"quoted"\n<!-- commentary -->\nmy note\n{% endcitation %}');
  const [found] = findCitations(`before\n${block}\nafter`);
  assert.equal(found.id, 'optuna');
  assert.equal(found.at, 'p. "4"');
  assert.equal(found.quote, '"quoted"');
  assert.equal(found.note, 'my note');
  assert.equal(citationBlock({ id: 'x', quote: 'q' }), '{% citation x %}\nq\n{% endcitation %}');
});

test('unknown sources are reported, post citations are not', () => {
  const body = '{% citation optuna %}a{% endcitation %}\n{% citation nope %}b{% endcitation %}\n' +
    '{% citation post:some-post %}c{% endcitation %}';
  assert.deepEqual(unknownSources(body, parseSources(REGISTRY)), ['nope']);
});

test('the preview draws cards and never runs or leaks what is inside', () => {
  const body = 'intro\n\n{% citation kleppmann-distributed-locking at="Conclusion" %}\n' +
    '<script>alert(1)</script> **bold**\n<!-- commentary -->\nnote\n{% endcitation %}\n\nafter';
  const html = renderWithCitations(body, parseSources(REGISTRY));
  assert.match(html, /<figure class="cite">/);
  assert.match(html, /Martin Kleppmann, <cite><a href="https:\/\/martin\.kleppmann\.com/);
  assert.match(html, /· Conclusion/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /cite-note/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<p>after<\/p>/);
  assert.match(renderWithCitations('{% citation zz %}q{% endcitation %}', {}), /등록되지 않은 출처: zz/);
});

test('citation blocks no longer count as Liquid the preview cannot run', () => {
  const body = 'a\n{% citation x %}\nq\n{% endcitation %}\n{% include other.html %}';
  const lines = findLiquid(withoutCitations(body)).map((entry) => entry.line);
  assert.deepEqual(lines, [5]);
});
