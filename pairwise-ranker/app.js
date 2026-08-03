import {
  applyChoice,
  createSession,
  exportRanking,
  parseItems,
  undoChoice,
} from './ranking.mjs';

const rankingApp = {
  storageKey: 'pairwise-ranker:session:v1',
  session: null,
  elements: {},

  init() {
    const ids = [
      'setup-view', 'compare-view', 'review-view', 'setup-form', 'criterion', 'items',
      'item-count', 'setup-error', 'example-button', 'resume-banner', 'resume-summary',
      'resume-button', 'discard-button', 'criterion-display', 'progress-label', 'progress-fill',
      'left-text', 'right-text', 'left-button', 'right-button', 'tie-button', 'unsure-button',
      'undo-button', 'restart-compare-button', 'rationale', 'review-criterion', 'ranked-list',
      'uncertainty-notice', 'back-to-compare-button', 'new-ranking-button', 'export-format',
      'export-output', 'copy-button', 'copy-status', 'live-region',
    ];
    this.elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

    this.elements['setup-form'].addEventListener('submit', (event) => this.start(event));
    this.elements.items.addEventListener('input', () => this.updateCount());
    this.elements.rationale.addEventListener('input', () => {
      if (!this.session) return;
      this.session.rationaleDraft = this.elements.rationale.value;
      this.save();
    });
    this.elements['example-button'].addEventListener('click', () => this.useExample());
    this.elements['resume-button'].addEventListener('click', () => this.resume());
    this.elements['discard-button'].addEventListener('click', () => this.reset());
    this.elements['left-button'].addEventListener('click', () => this.choose('left'));
    this.elements['right-button'].addEventListener('click', () => this.choose('right'));
    this.elements['tie-button'].addEventListener('click', () => this.choose('tie'));
    this.elements['unsure-button'].addEventListener('click', () => this.choose('unsure'));
    this.elements['undo-button'].addEventListener('click', () => this.undo());
    this.elements['back-to-compare-button'].addEventListener('click', () => this.undo());
    this.elements['restart-compare-button'].addEventListener('click', () => this.reset());
    this.elements['new-ranking-button'].addEventListener('click', () => this.reset());
    this.elements['export-format'].addEventListener('change', () => this.renderExport());
    this.elements['copy-button'].addEventListener('click', () => this.copy());
    document.addEventListener('keydown', (event) => this.handleKey(event));

    this.loadSavedSession();
    this.updateCount();
  },

  itemById(id) {
    return this.session.items.find((item) => item.id === id);
  },

  show(name) {
    for (const view of ['setup', 'compare', 'review']) {
      this.elements[`${view}-view`].hidden = view !== name;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  start(event) {
    event.preventDefault();
    this.elements['setup-error'].textContent = '';
    try {
      this.session = createSession(this.elements.criterion.value, this.elements.items.value);
      this.save();
      this.render();
    } catch (error) {
      this.elements['setup-error'].textContent = error.message;
    }
  },

  useExample() {
    this.elements.criterion.value = 'expected impact';
    this.elements.items.value = [
      'Improve the signup flow',
      'Reduce page load time',
      'Add keyboard shortcuts',
      'Simplify the pricing page',
      'Write a clearer onboarding guide',
    ].join('\n');
    this.updateCount();
    this.elements.criterion.focus();
  },

  updateCount() {
    const count = this.elements.items.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
    this.elements['item-count'].textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
  },

  render() {
    if (this.session.phase === 'review') {
      this.renderReview();
    } else {
      this.renderCompare();
    }
  },

  renderCompare() {
    const group = this.session.groups[this.session.mid];
    const left = this.itemById(this.session.candidateId);
    const right = this.itemById(group[0]);
    this.elements['criterion-display'].textContent = this.session.criterion;
    this.elements['left-text'].textContent = left.text;
    this.elements['right-text'].textContent = right.text;
    this.elements['left-button'].setAttribute('aria-label', `Choose ${left.text} as more important`);
    this.elements['right-button'].setAttribute('aria-label', `Choose ${right.text} as more important`);
    const comparisonNumber = this.session.comparisons.length + 1;
    const placed = this.session.items.length - this.session.pending.length - 1;
    const progress = Math.max(8, Math.min(92, (placed / this.session.items.length) * 100));
    this.elements['progress-label'].textContent = `Comparison ${comparisonNumber} · ${placed} of ${this.session.items.length} placed`;
    this.elements['progress-fill'].style.width = `${progress}%`;
    this.elements.rationale.value = this.session.rationaleDraft ?? '';
    document.querySelector('.rationale-wrap').open = Boolean(this.session.rationaleDraft);
    this.elements['undo-button'].disabled = this.session.history.length === 0;
    this.show('compare');
    this.elements['left-button'].focus();
  },

  choose(outcome) {
    const left = this.itemById(this.session.candidateId)?.text;
    const right = this.itemById(this.session.groups[this.session.mid][0])?.text;
    this.session = applyChoice(this.session, outcome, this.session.rationaleDraft ?? this.elements.rationale.value);
    this.save();
    const message = outcome === 'tie'
      ? `${left} and ${right} tied.`
      : outcome === 'unsure'
        ? `Uncertainty recorded between ${left} and ${right}.`
        : `${outcome === 'left' ? left : right} ranked higher.`;
    this.announce(message);
    this.render();
  },

  undo() {
    if (!this.session?.history?.length) return;
    this.session = undoChoice(this.session);
    this.save();
    this.announce('Last choice undone.');
    this.render();
  },

  renderReview() {
    this.elements['review-criterion'].textContent = this.session.criterion;
    this.elements['ranked-list'].replaceChildren();
    const uncertainIds = new Set(this.session.uncertainties.flatMap(({ leftId, rightId }) => [leftId, rightId]));

    this.session.groups.forEach((group) => {
      const item = document.createElement('li');
      item.className = 'ranked-item';
      const label = document.createElement('span');
      label.className = 'ranked-copy';
      label.textContent = group.map((id) => this.itemById(id).text).join(' = ');
      item.append(label);

      if (group.length > 1) {
        const tag = document.createElement('span');
        tag.className = 'tie-tag';
        tag.textContent = 'Tie';
        item.append(tag);
      } else if (group.some((id) => uncertainIds.has(id))) {
        const tag = document.createElement('span');
        tag.className = 'uncertain-tag';
        tag.textContent = 'Uncertain';
        item.append(tag);
      }
      this.elements['ranked-list'].append(item);
    });

    this.elements['uncertainty-notice'].hidden = this.session.uncertainties.length === 0;
    this.elements['back-to-compare-button'].disabled = this.session.history.length === 0;
    this.renderExport();
    this.show('review');
    this.elements['copy-button'].focus();
  },

  renderExport() {
    if (!this.session) return;
    this.elements['export-output'].value = exportRanking(
      this.session,
      this.elements['export-format'].value,
    );
    this.elements['copy-status'].textContent = '';
  },

  async copy() {
    const output = this.elements['export-output'];
    try {
      await navigator.clipboard.writeText(output.value);
      this.elements['copy-status'].textContent = 'Copied to clipboard.';
      this.announce('Ranking copied to clipboard.');
    } catch {
      output.focus();
      output.select();
      this.elements['copy-status'].textContent = 'Press Command+C or Control+C to copy.';
    }
  },

  handleKey(event) {
    if (this.elements['compare-view'].hidden || ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    switch (event.key.toLowerCase()) {
      case 'a':
      case 'arrowleft':
        event.preventDefault();
        this.choose('left');
        break;
      case 'b':
      case 'arrowright':
        event.preventDefault();
        this.choose('right');
        break;
      case 't':
        event.preventDefault();
        this.choose('tie');
        break;
      case 'u':
        event.preventDefault();
        this.choose('unsure');
        break;
      case 'z':
        event.preventDefault();
        this.undo();
        break;
    }
  },

  save() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.session));
  },

  loadSavedSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey));
      if (!saved?.criterion || !saved?.items?.length) return;
      this.session = saved;
      this.elements['resume-banner'].hidden = false;
      this.elements['resume-summary'].textContent = `${saved.items.length} items · ${saved.criterion}`;
    } catch {
      localStorage.removeItem(this.storageKey);
    }
  },

  resume() {
    if (this.session) this.render();
  },

  reset() {
    localStorage.removeItem(this.storageKey);
    this.session = null;
    this.elements['resume-banner'].hidden = true;
    this.elements['setup-error'].textContent = '';
    this.elements.criterion.value = '';
    this.elements.items.value = '';
    this.updateCount();
    this.show('setup');
    this.elements.criterion.focus();
  },

  announce(message) {
    this.elements['live-region'].textContent = '';
    requestAnimationFrame(() => { this.elements['live-region'].textContent = message; });
  },
};

rankingApp.init();
