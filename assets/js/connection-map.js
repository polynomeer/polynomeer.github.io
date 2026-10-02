/*
 * Neighbourhood view for /connections/ (docs/features/connection-map-design.md).
 *
 * One post in the middle, drawn the way the post tail draws it: what the post
 * mentions or quotes on the left, posts that mention it on the right. Each
 * side is a column, so a hub with thirty mentions grows taller instead of
 * piling labels on one arc. A post linked both ways sits on the left with a
 * double line. Node size grows with how connected that post is, which hints
 * where to go next; clicking moves it to the centre. No library, and the
 * layout is deterministic. The same neighbours are listed as links under the
 * drawing, which is what a screen reader gets.
 */
(() => {
  const root = document.querySelector('[data-connection-map]');
  if (!root) return;

  const SVG = 'http://www.w3.org/2000/svg';
  const W = 760;
  const LEFT = 250;
  const RIGHT = W - LEFT;
  const ROW = 26;
  const PAD = 34;

  const text = JSON.parse(root.dataset.l10n || '{}');
  const base = root.dataset.base || '/';
  const canvas = root.querySelector('.cm-canvas');
  const lists = root.querySelector('.cm-lists');
  const input = root.querySelector('input[type="search"]');
  const titles = root.querySelector('datalist');

  let nodes = [];
  let incoming = [];
  let outgoing = [];
  const bySlug = new Map();
  const byTitle = new Map();
  let center = null;

  const href = (url) => base.replace(/\/$/, '') + url;
  const short = (title, n) => (title.length > n ? `${title.slice(0, n - 1)}…` : title);
  const degree = (i) => incoming[i].length + outgoing[i].length;
  const byDegree = (a, b) => degree(b) - degree(a);

  function el(name, attrs = {}, parent) {
    const node = document.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (parent) parent.append(node);
    return node;
  }

  function column(items, x, height) {
    const top = (height - (items.length - 1) * ROW) / 2;
    return items.map((j, k) => [j, { x, y: top + k * ROW }]);
  }

  function draw() {
    const c = center;
    const outs = outgoing[c].slice().sort(byDegree);
    const ins = incoming[c].filter((j) => !outs.includes(j)).sort(byDegree);
    const mutual = new Set(incoming[c].filter((j) => outs.includes(j)));
    const height = Math.max(200, Math.max(outs.length, ins.length, 1) * ROW + PAD * 2);
    const mid = { x: W / 2, y: height / 2 };

    const placed = new Map([[c, mid], ...column(outs, LEFT, height), ...column(ins, RIGHT, height)]);

    const svg = el('svg', {
      viewBox: `0 0 ${W} ${height}`, class: 'cm-svg', role: 'img', 'aria-label': nodes[c].t
    });
    const edgeLayer = el('g', { class: 'cm-edges' }, svg);
    const nodeLayer = el('g', { class: 'cm-nodes' }, svg);

    for (const [j, p] of placed) {
      if (j === c) continue;
      const kind = mutual.has(j) ? 'is-mutual' : p.x < mid.x ? 'is-out' : 'is-in';
      // A gentle curve keeps a tall column readable where straight lines fan into a wedge.
      const bend = (mid.x + p.x) / 2;
      el('path', {
        d: `M${p.x},${p.y} C${bend},${p.y} ${bend},${mid.y} ${mid.x},${mid.y}`,
        class: `cm-edge ${kind}`
      }, edgeLayer);
    }

    const most = Math.max(1, ...[...placed.keys()].map(degree));
    for (const [j, p] of placed) {
      const n = nodes[j];
      const isCenter = j === c;
      const g = el('g', {
        class: `cm-node${isCenter ? ' is-center' : ''}${n.k === 'source' ? ' is-source' : ''}`,
        transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`,
        tabindex: '0'
      }, nodeLayer);
      el('title', {}, g).textContent = n.t;

      const r = isCenter ? 11 : 4 + 6 * Math.sqrt(degree(j) / most);
      if (n.k === 'source') {
        el('rect', { x: -r, y: -r, width: r * 2, height: r * 2, rx: 2 }, g);
      } else {
        el('circle', { r: r.toFixed(1) }, g);
      }

      const left = p.x < mid.x;
      const label = el('text', {
        x: isCenter ? 0 : left ? -14 : 14,
        y: isCenter ? -22 : 4,
        'text-anchor': isCenter ? 'middle' : left ? 'end' : 'start'
      }, g);
      // The centre title has to fit between the two columns; the full title is listed below.
      label.textContent = short(n.t, 22);

      const go = () => (n.k === 'source' ? (location.href = href(n.u)) : focus(j, true));
      g.addEventListener('click', go);
      g.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          go();
        }
      });
    }

    canvas.replaceChildren(svg);
    renderLists(c, incoming[c], outgoing[c]);
  }

  function list(heading, items) {
    const box = document.createElement('div');
    const h = document.createElement('h3');
    h.className = 'post-tail-heading';
    h.textContent = `${heading} `;
    const count = document.createElement('span');
    count.className = 'connection-count';
    count.textContent = String(items.length);
    h.append(count);
    box.append(h);

    const ul = document.createElement('ul');
    ul.className = 'post-tail-list list-unstyled';
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'post-tail-item cm-empty';
      li.textContent = text.none;
      ul.append(li);
    }
    for (const j of items) {
      const n = nodes[j];
      const li = document.createElement('li');
      li.className = 'post-tail-item';
      const a = document.createElement('a');
      a.className = 'post-tail-link';
      a.href = n.k === 'source' ? href(n.u) : `#${n.id}`;
      a.textContent = n.t;
      if (n.k === 'source') {
        const chip = document.createElement('span');
        chip.className = 'connection-chip';
        chip.textContent = text.source;
        a.prepend(chip, ' ');
      } else {
        a.addEventListener('click', (event) => {
          event.preventDefault();
          focus(j, true);
        });
      }
      li.append(a);
      ul.append(li);
    }
    box.append(ul);
    return box;
  }

  function renderLists(c, ins, outs) {
    const head = document.createElement('p');
    head.className = 'cm-current';
    const open = document.createElement('a');
    open.href = href(nodes[c].u);
    open.textContent = `${nodes[c].t} · ${text.open}`;
    head.append(open);

    const cols = document.createElement('div');
    cols.className = 'cm-columns';
    cols.append(list(text.in, ins), list(text.out, outs));
    lists.replaceChildren(head, cols);
  }

  function focus(i, scroll) {
    center = i;
    input.value = '';
    if (location.hash.slice(1) !== nodes[i].id) history.replaceState(null, '', `#${nodes[i].id}`);
    draw();
    if (scroll) root.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function fromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    return bySlug.has(id) ? bySlug.get(id) : null;
  }

  fetch(root.dataset.src)
    .then((response) => response.json())
    .then((data) => {
      nodes = data.nodes;
      incoming = nodes.map(() => []);
      outgoing = nodes.map(() => []);
      for (const [from, to] of data.edges) {
        outgoing[from].push(to);
        incoming[to].push(from);
      }
      nodes.forEach((n, i) => {
        if (n.k === 'source') return;
        bySlug.set(n.id, i);
        byTitle.set(n.t, i);
        const option = document.createElement('option');
        option.value = n.t;
        titles.append(option);
      });

      input.addEventListener('change', () => {
        const i = byTitle.get(input.value);
        if (i === undefined) {
          input.setCustomValidity(text.not_found);
          input.reportValidity();
          return;
        }
        input.setCustomValidity('');
        focus(i, false);
      });
      window.addEventListener('hashchange', () => {
        const i = fromHash();
        if (i !== null && i !== center) focus(i, true);
      });
      document.querySelectorAll('[data-center]').forEach((link) => {
        link.addEventListener('click', (event) => {
          const i = bySlug.get(link.dataset.center);
          if (i === undefined) return;
          event.preventDefault();
          focus(i, true);
        });
      });

      const start = fromHash() ?? bySlug.get(root.dataset.default) ?? 0;
      focus(start, false);
    })
    .catch(() => {
      lists.textContent = text.not_found;
    });
})();
