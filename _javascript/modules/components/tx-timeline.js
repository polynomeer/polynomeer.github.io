/**
 * Interleaved-transaction lab (`_includes/lab/tx-timeline.html`).
 *
 * The include renders every scenario, the full outcome grid and every note as
 * plain markup, so the widget is already readable as a table. This turns that
 * markup into something to operate:
 *
 * - the scenario buttons become tabs
 * - picking a cell in the grid selects an engine and isolation level, shows
 *   only that cell's note, and fills the values each SELECT returns under it
 * - a step control walks the timeline one statement at a time, which is the
 *   point of the widget: the interleaving is fixed and only the outcome moves
 *
 * Without JavaScript nothing here runs and the section still reads correctly.
 */

const ACTIVE = 'is-active';

function scenarios(root) {
  return Array.from(root.querySelectorAll('[data-tx-scenario]'));
}

function activeScenario(root) {
  return root.querySelector('[data-tx-scenario].is-active');
}

function showNote(scenario, key) {
  scenario.querySelectorAll('[data-tx-note]').forEach((note) => {
    note.hidden = note.dataset.txNote !== key;
  });
}

// each SELECT in the timeline reports what it returns under the chosen cell
function fillReads(scenario, cell) {
  const values = {
    first: cell ? cell.dataset.txFirst : '',
    later: cell ? cell.dataset.txLater : ''
  };

  scenario.querySelectorAll('[data-tx-output]').forEach((step) => {
    const output = step.querySelector('.txlab-read');
    const value = values[step.dataset.txOutput];
    output.textContent = value ? `-- ${value}` : '';
    output.hidden = !value;
  });
}

function selectCell(scenario, cell) {
  scenario.querySelectorAll('[data-tx-cell]').forEach((candidate) => {
    const isActive = candidate === cell;
    candidate.classList.toggle(ACTIVE, isActive);
    candidate.setAttribute('aria-pressed', String(isActive));
  });

  scenario.dataset.txVerdict = cell ? cell.dataset.txVerdict : '';
  showNote(scenario, cell ? cell.dataset.txCell : null);
  fillReads(scenario, cell);
}

// a verdict of `blocked` or `aborted` stops the timeline where it stops
function stoppedAt(scenario) {
  const verdict = scenario.dataset.txVerdict;
  const steps = scenario.querySelectorAll('[data-tx-step]');
  if (verdict !== 'blocked' && verdict !== 'aborted') return steps.length;

  return steps.length - 1;
}

function reveal(scenario, count) {
  const steps = Array.from(scenario.querySelectorAll('[data-tx-step]'));
  const limit = Math.min(count, stoppedAt(scenario));

  steps.forEach((step, index) => {
    step.classList.toggle('is-pending', index >= limit);
    step.classList.toggle('is-current', index === limit - 1);
  });

  scenario.dataset.txRevealed = String(limit);

  const play = scenario.querySelector('[data-tx-play]');
  if (play) play.disabled = limit >= stoppedAt(scenario);
}

// the first statement stays visible, so a scenario nobody has stepped
// through yet reads as a timeline rather than as disabled text
function resetScenario(scenario) {
  reveal(scenario, 1);
}

function initScenario(scenario) {
  const controls = scenario.querySelector('[data-tx-controls]');
  if (controls) controls.hidden = false;

  scenario.querySelectorAll('[data-tx-note]').forEach((note) => {
    note.hidden = true;
  });

  scenario.querySelectorAll('[data-tx-cell]').forEach((cell) => {
    cell.addEventListener('click', () => {
      const alreadyOn = cell.classList.contains(ACTIVE);
      selectCell(scenario, alreadyOn ? null : cell);
      resetScenario(scenario);
    });
  });

  const play = scenario.querySelector('[data-tx-play]');
  if (play) {
    play.addEventListener('click', () => {
      reveal(scenario, Number(scenario.dataset.txRevealed || 0) + 1);
    });
  }

  const reset = scenario.querySelector('[data-tx-reset]');
  if (reset) {
    reset.addEventListener('click', () => resetScenario(scenario));
  }

  fillReads(scenario, null);
  resetScenario(scenario);
}

function initLab(root) {
  scenarios(root).forEach(initScenario);

  root.querySelectorAll('[data-tx-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.txTab;

      root.querySelectorAll('[data-tx-tab]').forEach((candidate) => {
        const isActive = candidate === tab;
        candidate.classList.toggle(ACTIVE, isActive);
        candidate.setAttribute('aria-selected', String(isActive));
      });

      scenarios(root).forEach((scenario) => {
        scenario.classList.toggle(ACTIVE, scenario.dataset.txScenario === target);
      });

      const scenario = activeScenario(root);
      if (scenario) resetScenario(scenario);
    });
  });
}

export function initTxTimeline() {
  document.querySelectorAll('[data-tx-lab]').forEach(initLab);
}
