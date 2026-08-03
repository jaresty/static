import {
  coordinates,
  createWorkshop,
  exportWorkshop,
  moveItem,
  placeAt,
  undo as undoWorkshop,
} from './core.mjs';

const clamp = (value) => Math.max(0, Math.min(1, Number(value.toFixed(2))));

const facilitatorApp = {
  storageKey: 'quadrant:workshop:v1',
  session: null,
  selectedId: null,
  draftPosition: { x: 0.5, y: 0.5 },
  elements: {},

  init() {
    const ids = [
      'setup-view', 'placement-view', 'review-view', 'setup-form', 'prompt', 'x-label', 'x-low', 'x-high',
      'y-label', 'y-low', 'y-high', 'items', 'item-count', 'setup-error', 'example-button', 'resume-banner',
      'resume-summary', 'resume-button', 'discard-button', 'placement-round', 'placement-progress', 'placement-board',
      'placement-x-low', 'placement-x-high', 'placement-y-low', 'placement-y-high', 'candidate-card',
      'placement-coordinates', 'place-option', 'placement-undo', 'placement-reset', 'review-round', 'review-prompt',
      'new-workshop', 'board', 'board-x-low', 'board-x-high', 'board-y-low', 'board-y-high',
      'setup-preview-prompt', 'setup-x-edit', 'setup-y-edit', 'setup-x-low', 'setup-x-high', 'setup-y-low', 'setup-y-high', 'setup-options',
      'review-undo',
      'export-format', 'export-output', 'copy-button', 'download-button', 'copy-status', 'live-region',
    ];
    this.elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

    this.elements['setup-form'].addEventListener('submit', (event) => this.start(event));
    for (const id of ['prompt', 'x-label', 'x-low', 'x-high', 'y-label', 'y-low', 'y-high', 'items']) {
      this.elements[id].addEventListener('input', () => {
        this.updateCount();
        this.updatePreview();
      });
    }
    for (const id of ['x-label', 'x-low', 'x-high', 'y-label', 'y-low', 'y-high']) {
      this.elements[id].addEventListener('click', (event) => event.currentTarget.select());
    }
    this.elements['setup-x-edit'].addEventListener('click', () => {
      this.elements['x-label'].focus();
      this.elements['x-label'].select();
    });
    this.elements['setup-y-edit'].addEventListener('click', () => {
      this.elements['y-label'].focus();
      this.elements['y-label'].select();
    });
    this.elements['example-button'].addEventListener('click', () => this.useExample());
    this.elements['resume-button'].addEventListener('click', () => this.render());
    this.elements['discard-button'].addEventListener('click', () => this.reset());
    this.elements['place-option'].addEventListener('click', () => this.commitPlacement());
    this.elements['placement-undo'].addEventListener('click', () => this.undo());
    this.elements['placement-reset'].addEventListener('click', () => this.reset());
    this.elements['new-workshop'].addEventListener('click', () => this.reset());
    this.elements['review-undo'].addEventListener('click', () => this.undo());
    this.elements['export-format'].addEventListener('change', () => this.renderExport());
    this.elements['copy-button'].addEventListener('click', () => this.copy());
    this.elements['download-button'].addEventListener('click', () => this.download());
    document.addEventListener('keydown', (event) => this.handleKey(event));

    this.load();
    this.updateCount();
    this.updatePreview();
  },

  show(name) {
    const scrollY = window.scrollY;
    for (const view of ['setup', 'placement', 'review']) this.elements[`${view}-view`].hidden = view !== name;
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' }));
  },

  start(event) {
    event.preventDefault();
    this.elements['setup-error'].textContent = '';
    try {
      this.session = createWorkshop({
        prompt: this.elements.prompt.value,
        xLabel: this.elements['x-label'].value,
        xLow: this.elements['x-low'].value,
        xHigh: this.elements['x-high'].value,
        yLabel: this.elements['y-label'].value,
        yLow: this.elements['y-low'].value,
        yHigh: this.elements['y-high'].value,
        items: this.elements.items.value,
      });
      this.selectedId = null;
      this.draftPosition = { x: 0.5, y: 0.5 };
      this.save();
      this.render();
    } catch (error) {
      this.elements['setup-error'].textContent = error.message;
    }
  },

  useExample() {
    this.elements.prompt.value = 'Which ideas should we explore next?';
    this.elements['x-label'].value = 'Expected value';
    this.elements['x-low'].value = 'Lower value';
    this.elements['x-high'].value = 'Higher value';
    this.elements['y-label'].value = 'Confidence';
    this.elements['y-low'].value = 'Lower confidence';
    this.elements['y-high'].value = 'Higher confidence';
    this.elements.items.value = ['Improve search', 'Add keyboard shortcuts', 'Clarify onboarding', 'Simplify navigation', 'Reduce page load time'].join('\n');
    this.updateCount();
    this.updatePreview();
    this.elements.prompt.focus();
  },

  updateCount() {
    const count = this.elements.items.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
    this.elements['item-count'].textContent = `${count} ${count === 1 ? 'option' : 'options'}`;
  },

  updatePreview() {
    this.elements['setup-preview-prompt'].textContent = this.elements.prompt.value.trim()
      || 'Frame the decision, then place every option on both axes.';
    this.elements['setup-x-edit'].textContent = `${this.elements['x-label'].value.trim() || 'X axis'} · edit`;
    this.elements['setup-y-edit'].textContent = `${this.elements['y-label'].value.trim() || 'Y axis'} · edit`;
    this.elements['setup-x-low'].textContent = this.elements['x-low'].value.trim() || 'Lower X';
    this.elements['setup-x-high'].textContent = this.elements['x-high'].value.trim() || 'Higher X';
    this.elements['setup-y-low'].textContent = this.elements['y-low'].value.trim() || 'Lower Y';
    this.elements['setup-y-high'].textContent = this.elements['y-high'].value.trim() || 'Higher Y';
    const options = this.elements.items.value.split(/\r?\n/).map((text) => text.trim()).filter(Boolean);
    this.elements['setup-options'].replaceChildren(...options.slice(0, 8).map((text) => {
      const option = document.createElement('span');
      option.className = 'setup-option';
      option.textContent = text;
      return option;
    }));
  },

  item(id) {
    return this.session.items.find((item) => item.id === id);
  },

  render() {
    if (!this.session) return this.show('setup');
    this.elements['resume-banner'].hidden = true;
    if (this.session.phase === 'placement') this.renderPlacement();
    else this.renderReview();
  },

  setAxisLabels(prefix) {
    this.elements[`${prefix}-x-low`].textContent = this.session.xLow;
    this.elements[`${prefix}-x-high`].textContent = this.session.xHigh;
    this.elements[`${prefix}-y-low`].textContent = this.session.yLow;
    this.elements[`${prefix}-y-high`].textContent = this.session.yHigh;
  },

  positionElement(element, position) {
    element.style.left = `${8 + position.x * 84}%`;
    element.style.bottom = `${8 + position.y * 84}%`;
  },

  pointFromEvent(event, board) {
    const bounds = board.getBoundingClientRect();
    const rawX = (event.clientX - bounds.left) / bounds.width;
    const rawY = 1 - ((event.clientY - bounds.top) / bounds.height);
    return {
      x: clamp((rawX - 0.08) / 0.84),
      y: clamp((rawY - 0.08) / 0.84),
    };
  },

  describePosition(position) {
    return `${Math.round(position.x * 100)}% ${this.session.xLabel} · ${Math.round(position.y * 100)}% ${this.session.yLabel}`;
  },

  makeBoardItem(point, board, { candidate = false } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `board-item${candidate ? ' candidate-preview' : ''}${point.focused ? ' focused' : ''}${point.id === this.selectedId ? ' selected' : ''}`;
    button.textContent = point.text;
    this.positionElement(button, point);
    button.setAttribute('aria-label', `${point.text}; ${this.describePosition(point)}${candidate ? '; drag to place' : ''}`);
    button.addEventListener('click', () => {
      if (candidate) return;
      this.selectedId = point.id;
      if (this.session.phase === 'review') this.renderReview();
    });
    this.bindDrag(button, board, point.id, candidate);
    board.append(button);
    return button;
  },

  bindDrag(element, board, itemId, candidate) {
    element.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      element.setPointerCapture(event.pointerId);
      element.classList.add('dragging');
      const original = structuredClone(this.session);
      let latest = candidate ? { ...this.draftPosition } : { ...this.session.positions[itemId] };

      const move = (moveEvent) => {
        latest = this.pointFromEvent(moveEvent, board);
        this.positionElement(element, latest);
        if (candidate) {
          this.draftPosition = latest;
          this.elements['placement-coordinates'].textContent = this.describePosition(latest);
        }
      };
      const finish = (upEvent) => {
        element.releasePointerCapture(upEvent.pointerId);
        element.classList.remove('dragging');
        element.removeEventListener('pointermove', move);
        element.removeEventListener('pointerup', finish);
        element.removeEventListener('pointercancel', finish);
        if (candidate) {
          this.draftPosition = latest;
          this.commitPlacement();
        } else if (latest.x !== original.positions[itemId].x || latest.y !== original.positions[itemId].y) {
          const next = structuredClone(this.session);
          next.history.push(original);
          next.positions[itemId] = latest;
          this.session = next;
          this.selectedId = itemId;
          this.save();
          this.announce(`${this.item(itemId).text} repositioned.`);
          this.render();
        }
      };
      element.addEventListener('pointermove', move);
      element.addEventListener('pointerup', finish);
      element.addEventListener('pointercancel', finish);
    });
  },

  renderPlacedItems(board) {
    board.querySelectorAll('.board-item').forEach((element) => element.remove());
    for (const point of coordinates(this.session)) this.makeBoardItem(point, board);
  },

  renderPlacement() {
    const candidate = this.item(this.session.candidateId);
    const placedCount = Object.keys(this.session.positions).length;
    this.elements['placement-round'].textContent = `Round ${this.session.round} · place on the grid`;
    this.elements['placement-progress'].textContent = `${placedCount} of ${this.session.items.length} placed`;
    this.setAxisLabels('placement');
    this.renderPlacedItems(this.elements['placement-board']);
    this.makeBoardItem({ ...candidate, ...this.draftPosition, focused: false }, this.elements['placement-board'], { candidate: true });
    this.elements['candidate-card'].textContent = candidate.text;
    this.elements['placement-coordinates'].textContent = this.describePosition(this.draftPosition);
    this.elements['placement-undo'].disabled = this.session.history.length === 0;
    this.bindDrag(this.elements['candidate-card'], this.elements['placement-board'], candidate.id, true);
    this.show('placement');
    this.elements['candidate-card'].focus();
  },

  commitPlacement() {
    const candidate = this.item(this.session.candidateId).text;
    this.session = placeAt(this.session, this.draftPosition);
    this.draftPosition = { x: 0.5, y: 0.5 };
    this.save();
    this.announce(`${candidate} placed on the grid.`);
    this.render();
  },

  renderReview() {
    this.elements['review-round'].textContent = `Round ${this.session.round} · review together`;
    this.elements['review-prompt'].textContent = this.session.prompt;
    this.setAxisLabels('board');
    this.renderPlacedItems(this.elements.board);
    this.elements['review-undo'].disabled = this.session.history.length === 0;
    this.renderExport();
    this.show('review');
  },

  adjust(axis, delta) {
    if (!this.selectedId) return;
    const before = this.session;
    this.session = moveItem(this.session, this.selectedId, axis, delta);
    if (this.session === before) return;
    this.save();
    this.announce(`${this.item(this.selectedId).text} moved.`);
    this.renderReview();
  },

  adjustDraft(axis, delta) {
    this.draftPosition = { ...this.draftPosition, [axis]: clamp(this.draftPosition[axis] + delta * 0.05) };
    this.renderPlacement();
  },

  undo() {
    if (!this.session?.history?.length) return;
    this.session = undoWorkshop(this.session);
    if (this.selectedId && !this.item(this.selectedId)) this.selectedId = null;
    this.save();
    this.announce('Last change undone.');
    this.render();
  },

  renderExport() {
    this.elements['export-output'].value = exportWorkshop(this.session, this.elements['export-format'].value);
    this.elements['copy-status'].textContent = '';
  },

  async copy() {
    const output = this.elements['export-output'];
    try {
      await navigator.clipboard.writeText(output.value);
      this.elements['copy-status'].textContent = 'Copied.';
      this.announce('Workshop result copied.');
    } catch {
      output.focus();
      output.select();
      this.elements['copy-status'].textContent = 'Press Command+C or Control+C to copy.';
    }
  },

  download() {
    const format = this.elements['export-format'].value;
    const mime = format === 'svg' ? 'image/svg+xml' : format === 'json' ? 'application/json' : 'text/markdown';
    const extension = format === 'markdown' ? 'md' : format;
    const blob = new Blob([this.elements['export-output'].value], { type: `${mime};charset=utf-8` });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `quadrant-round-${this.session.round}.${extension}`;
    link.click();
    URL.revokeObjectURL(link.href);
  },

  handleKey(event) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    const actions = { ArrowLeft: ['x', -1], ArrowRight: ['x', 1], ArrowDown: ['y', -1], ArrowUp: ['y', 1] };
    if (!this.elements['placement-view'].hidden && actions[event.key]) {
      event.preventDefault();
      this.adjustDraft(...actions[event.key]);
    } else if (!this.elements['placement-view'].hidden && event.key === 'Enter') {
      event.preventDefault();
      this.commitPlacement();
    } else if (!this.elements['review-view'].hidden && this.selectedId && actions[event.key]) {
      event.preventDefault();
      this.adjust(...actions[event.key]);
    }
  },

  save() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.session));
  },

  migrate(saved) {
    if (saved.positions) return saved;
    if (!saved.xOrder || !saved.yOrder) return saved;
    const denominator = Math.max(1, saved.items.length - 1);
    saved.positions = Object.fromEntries(saved.items
      .filter(({ id }) => saved.xOrder.includes(id) && saved.yOrder.includes(id))
      .map(({ id }) => [id, { x: saved.xOrder.indexOf(id) / denominator, y: saved.yOrder.indexOf(id) / denominator }]));
    delete saved.xOrder;
    delete saved.yOrder;
    return saved;
  },

  load() {
    try {
      const saved = this.migrate(JSON.parse(localStorage.getItem(this.storageKey)));
      if (!saved?.prompt || !saved?.items?.length) return;
      this.session = saved;
      this.elements['resume-banner'].hidden = false;
      this.elements['resume-summary'].textContent = `${saved.items.length} options · round ${saved.round}`;
    } catch {
      localStorage.removeItem(this.storageKey);
    }
  },

  reset() {
    localStorage.removeItem(this.storageKey);
    this.session = null;
    this.selectedId = null;
    this.draftPosition = { x: 0.5, y: 0.5 };
    this.elements['resume-banner'].hidden = true;
    this.elements['setup-error'].textContent = '';
    this.show('setup');
    this.elements.prompt.focus();
  },

  announce(message) {
    this.elements['live-region'].textContent = '';
    requestAnimationFrame(() => { this.elements['live-region'].textContent = message; });
  },
};

facilitatorApp.init();
