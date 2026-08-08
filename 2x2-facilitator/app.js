import {
  coordinates,
  createWorkshop,
  exportWorkshop,
  moveItem,
  placeAt,
  repositionItem,
  undo as undoWorkshop,
} from './core.mjs';
import {
  addResponse,
  buildSlackMessage,
  createCollection,
  decodeShareUrl,
  encodeResponseUrl,
  encodeSetupUrl,
  convergeResponses,
} from './collaboration.mjs';
import {
  adjustResolution,
  createResolution,
  formatResolutionExport,
  loadResolution,
  resetAllResolutions,
  resetResolutionItem,
  saveResolution,
  undoResolution,
} from './resolution.mjs';
import { decodeQuadrantDraftFragment, parseQuadrantDraft, quadrantAiPrompt } from './ai-draft.mjs';
import { compactQuadrantStorage, persistWithRecovery } from './storage-recovery.mjs';
import {
  createFacilitatorViewArtifact,
  createFacilitatorHandoffArtifact,
  decodeFacilitatorArtifact,
  encodeFacilitatorArtifactUrl,
  facilitatorArtifactJson,
  parseFacilitatorArtifactJson,
  restoreFacilitatorHandoff,
} from './facilitator-share.mjs';

const appStorage = new URLSearchParams(location.search).get('walkthrough') === '1' ? sessionStorage : localStorage;
const clamp = (value) => Math.max(0, Math.min(1, Number(value.toFixed(2))));

const facilitatorApp = {
  storageKey: 'quadrant:workshop:v1',
  resolutionLatestKey: 'quadrant:resolution:latest',
  session: null,
  selectedId: null,
  draftPosition: { x: 0.5, y: 0.5 },
  responseStorageKey: null,
  sharedArtifact: null,
  setupShareArtifact: null,
  collection: null,
  resolution: null,
  focusedResolutionId: null,
  draggedResolutionId: null,
  resolutionPointerStart: null,
  resolutionPointerMoved: false,
  resolutionPointerCanAdjust: false,
  showResponseNames: false,
  optionDescriptions: new Map(),
  aiOptionDescriptions: new Map(),
  facilitatorShareArtifact: null,
  facilitatorBackupArtifact: null,
  elements: {},

  init() {
    compactQuadrantStorage(appStorage);
    const ids = [
      'mode-view', 'solo-mode', 'setup-mode', 'combine-mode', 'facilitator-backup-input', 'facilitator-backup-status', 'back-to-choices', 'privacy-note', 'invitation-view', 'invitation-summary', 'start-response',
      'shared-facilitator-view', 'shared-facilitator-title', 'shared-facilitator-description', 'shared-facilitator-meta', 'shared-facilitator-x-summary', 'shared-facilitator-y-summary', 'shared-facilitator-board', 'shared-facilitator-results',
      'facilitator-handoff-view', 'facilitator-handoff-summary', 'import-facilitator-handoff', 'discard-facilitator-handoff',
      'collection-view', 'collection-grid', 'response-import-panel', 'response-links', 'collect-responses', 'clear-responses', 'collection-status', 'response-count', 'response-list', 'disagreement-list', 'previous-disagreement', 'next-disagreement', 'undo-resolution', 'reset-all-resolutions', 'show-response-names', 'convergence-board', 'resolution-inspector', 'convergence-summary', 'include-resolution-adjustments', 'export-resolution', 'copy-resolution-export', 'resolution-export-output', 'resolution-export-status',
      'include-handoff-names', 'copy-facilitator-view', 'copy-facilitator-handoff', 'download-facilitator-backup', 'facilitator-share-output', 'facilitator-share-status',
      'setup-view', 'workspace-mode-label', 'setup-submit', 'setup-share-panel', 'setup-share-output', 'copy-setup-slack', 'copy-setup-link', 'answer-own-invitation', 'setup-share-status',
      'placement-view', 'review-view', 'setup-form', 'prompt', 'activity-description', 'x-label', 'x-low', 'x-high',
      'y-label', 'y-low', 'y-high', 'items', 'option-details', 'item-count', 'setup-error', 'example-button', 'resume-banner',
      'resume-summary', 'resume-button', 'discard-button', 'placement-round', 'placement-progress', 'placement-prompt', 'placement-activity-description', 'placement-board',
      'placement-x-title', 'placement-y-title', 'placement-x-summary', 'placement-y-summary', 'placement-x-low', 'placement-x-high', 'placement-y-low', 'placement-y-high', 'candidate-card', 'candidate-description',
      'placement-coordinates', 'place-option', 'placement-undo', 'placement-reset', 'review-round', 'review-prompt', 'review-activity-description', 'item-description-inspector', 'item-description-title', 'item-description-text',
      'new-workshop', 'board', 'board-x-low', 'board-x-high', 'board-y-low', 'board-y-high',
      'setup-preview-prompt', 'setup-preview-description', 'setup-x-edit', 'setup-y-edit', 'setup-x-low', 'setup-x-high', 'setup-y-low', 'setup-y-high', 'setup-options',
      'review-undo', 'response-share-panel', 'contributor-name', 'include-response-preview', 'copy-response-slack', 'copy-response-link', 'response-share-status',
      'export-format', 'export-output', 'copy-button', 'download-button', 'copy-status', 'storage-status', 'live-region',
      'ai-draft-dialog', 'ai-import-clipboard', 'ai-manual-toggle', 'ai-manual-import', 'ai-draft-input', 'ai-review-json', 'ai-draft-status', 'ai-draft-review', 'ai-review-question', 'ai-review-activity-description', 'ai-review-x-label', 'ai-review-x-low', 'ai-review-x-high', 'ai-review-y-label', 'ai-review-y-low', 'ai-review-y-high', 'ai-review-options', 'ai-review-option-details', 'ai-use-solo', 'ai-use-invite', 'ai-discard-draft',
    ];
    this.elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
    this.initAiDraft();

    this.elements['solo-mode'].addEventListener('click', () => this.enterSolo());
    this.elements['setup-mode'].addEventListener('click', () => this.enterFacilitatorSetup());
    this.elements['combine-mode'].addEventListener('click', () => this.enterCollection());
    this.elements['back-to-choices'].addEventListener('click', () => this.enterEntry());
    this.elements['start-response'].addEventListener('click', () => this.startResponse());
    this.elements['collect-responses'].addEventListener('click', () => this.collectResponses());
    this.elements['clear-responses'].addEventListener('click', () => this.clearCollection());
    this.elements['copy-setup-slack'].addEventListener('click', () => this.copySetup(true));
    this.elements['copy-setup-link'].addEventListener('click', () => this.copySetup(false));
    this.elements['copy-response-slack'].addEventListener('click', () => this.copyResponse(true));
    this.elements['copy-response-link'].addEventListener('click', () => this.copyResponse(false));
    this.elements['previous-disagreement'].addEventListener('click', () => this.moveResolutionFocus(-1));
    this.elements['next-disagreement'].addEventListener('click', () => this.moveResolutionFocus(1));
    this.elements['undo-resolution'].addEventListener('click', () => this.commitResolution(undoResolution(this.resolution)));
    this.elements['reset-all-resolutions'].addEventListener('click', () => this.commitResolution(resetAllResolutions(this.resolution)));
    this.elements['show-response-names'].addEventListener('change', (event) => { this.showResponseNames = event.currentTarget.checked; this.renderCollection(); });
    this.elements['export-resolution'].addEventListener('click', () => this.renderResolutionExport());
    this.elements['copy-resolution-export'].addEventListener('click', () => this.copyResolutionExport());
    this.elements['copy-facilitator-view'].addEventListener('click', () => this.copyFacilitatorShare('view'));
    this.elements['copy-facilitator-handoff'].addEventListener('click', () => this.copyFacilitatorShare('handoff'));
    this.elements['download-facilitator-backup'].addEventListener('click', () => this.downloadFacilitatorBackup());
    this.elements['import-facilitator-handoff'].addEventListener('click', () => this.importFacilitatorHandoff());
    this.elements['discard-facilitator-handoff'].addEventListener('click', () => this.discardFacilitatorHandoff());
    this.elements['facilitator-backup-input'].addEventListener('change', (event) => this.reviewFacilitatorBackup(event));
    this.elements['convergence-board'].addEventListener('pointermove', (event) => this.previewResolutionDrag(event));
    this.elements['convergence-board'].addEventListener('pointerup', (event) => this.finishResolutionDrag(event));
    this.elements['convergence-board'].addEventListener('click', (event) => {
      if (event.target === event.currentTarget && this.focusedResolutionId) this.focusResolution(null);
    });
    this.elements['convergence-board'].addEventListener('pointercancel', () => {
      this.draggedResolutionId = null;
      this.resolutionPointerStart = null;
      this.resolutionPointerMoved = false;
      this.resolutionPointerCanAdjust = false;
    });
    this.elements['setup-form'].addEventListener('submit', (event) => this.start(event));
    for (const id of ['prompt', 'activity-description', 'x-label', 'x-low', 'x-high', 'y-label', 'y-low', 'y-high', 'items']) {
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

    if (!this.loadShared() && !this.loadSavedResolution()) this.load();
    this.updateCount();
    this.updatePreview();
    if (location.hash.startsWith('#draft=')) {
      try { this.reviewAiDraft(decodeQuadrantDraftFragment(location.hash)); }
      catch (error) { this.showAiError(error); }
    }
  },

  initAiDraft() {
    const dialog = this.elements['ai-draft-dialog'];
    document.querySelectorAll('[data-open-ai]').forEach((button) => button.addEventListener('click', () => dialog.showModal()));
    document.querySelectorAll('[data-close-ai]').forEach((button) => button.addEventListener('click', () => dialog.close()));
    document.querySelectorAll('[data-copy-ai-prompt]').forEach((button) => button.addEventListener('click', () => this.copyAiPrompt(button)));
    this.elements['ai-manual-toggle'].addEventListener('click', () => {
      this.elements['ai-manual-import'].hidden = false;
      this.elements['ai-draft-input'].focus();
    });
    this.elements['ai-review-json'].addEventListener('click', () => this.reviewAiDraft(this.elements['ai-draft-input'].value));
    this.elements['ai-import-clipboard'].addEventListener('click', async () => {
      try { this.reviewAiDraft(await navigator.clipboard.readText()); }
      catch (error) { this.showAiError(error); }
    });
    this.elements['ai-use-solo'].addEventListener('click', () => this.useAiDraft('solo'));
    this.elements['ai-use-invite'].addEventListener('click', () => this.useAiDraft('invite'));
    this.elements['ai-discard-draft'].addEventListener('click', () => this.discardAiDraft());
    this.elements['ai-review-options'].addEventListener('input', () => this.renderOptionEditors('ai'));
  },

  async copyAiPrompt(button) {
    try {
      await navigator.clipboard.writeText(quadrantAiPrompt(new URL(location.pathname, location.origin).href));
      this.elements['ai-draft-status'].textContent = 'AI prompt copied.';
      this.elements['live-region'].textContent = 'AI setup prompt copied.';
      button.textContent = 'Prompt copied';
      window.clearTimeout(button.copyFeedbackTimer);
      button.copyFeedbackTimer = window.setTimeout(() => { button.textContent = 'Copy AI prompt'; }, 2000);
    } catch {
      this.showAiError(new Error('Clipboard access was unavailable. Open Draft with AI to copy manually.'));
    }
  },

  showAiError(error) {
    const dialog = this.elements['ai-draft-dialog'];
    this.elements['ai-draft-status'].textContent = error.message;
    if (!dialog.open) dialog.showModal();
  },

  reviewAiDraft(raw) {
    const draft = parseQuadrantDraft(raw);
    this.elements['ai-review-question'].value = draft.question;
    this.elements['ai-review-activity-description'].value = draft.activityDescription;
    this.elements['ai-review-x-label'].value = draft.x.label;
    this.elements['ai-review-x-low'].value = draft.x.low;
    this.elements['ai-review-x-high'].value = draft.x.high;
    this.elements['ai-review-y-label'].value = draft.y.label;
    this.elements['ai-review-y-low'].value = draft.y.low;
    this.elements['ai-review-y-high'].value = draft.y.high;
    this.elements['ai-review-options'].value = draft.options.map(({ title }) => title).join('\n');
    this.aiOptionDescriptions = new Map(draft.options.map(({ title, description }) => [title, description]));
    this.renderOptionEditors('ai');
    this.elements['ai-draft-review'].hidden = false;
    this.elements['ai-draft-status'].textContent = 'Draft loaded. Review every field before choosing how to use it.';
    if (!this.elements['ai-draft-dialog'].open) this.elements['ai-draft-dialog'].showModal();
  },

  aiDraftFromReview() {
    return parseQuadrantDraft({
      version: 1,
      kind: 'quadrant-draft',
      question: this.elements['ai-review-question'].value,
      activityDescription: this.elements['ai-review-activity-description'].value,
      x: { label: this.elements['ai-review-x-label'].value, low: this.elements['ai-review-x-low'].value, high: this.elements['ai-review-x-high'].value },
      y: { label: this.elements['ai-review-y-label'].value, low: this.elements['ai-review-y-low'].value, high: this.elements['ai-review-y-high'].value },
      options: this.optionTitles('ai-review-options').map((title) => ({ title, description: this.aiOptionDescriptions.get(title) ?? '' })),
    });
  },

  useAiDraft(mode) {
    try {
      const draft = this.aiDraftFromReview();
      this.elements.prompt.value = draft.question;
      this.elements['activity-description'].value = draft.activityDescription;
      this.elements['x-label'].value = draft.x.label;
      this.elements['x-low'].value = draft.x.low;
      this.elements['x-high'].value = draft.x.high;
      this.elements['y-label'].value = draft.y.label;
      this.elements['y-low'].value = draft.y.low;
      this.elements['y-high'].value = draft.y.high;
      this.elements.items.value = draft.options.map(({ title }) => title).join('\n');
      this.optionDescriptions = new Map(draft.options.map(({ title, description }) => [title, description]));
      this.updateCount();
      this.updatePreview();
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      this.elements['ai-draft-dialog'].close();
      if (mode === 'solo') this.enterSolo(); else this.enterFacilitatorSetup();
      this.elements.prompt.focus();
    } catch (error) { this.showAiError(error); }
  },

  discardAiDraft() {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    this.elements['ai-draft-input'].value = '';
    this.elements['ai-draft-review'].hidden = true;
    this.elements['ai-manual-import'].hidden = true;
    this.elements['ai-draft-status'].textContent = '';
    this.elements['ai-draft-dialog'].close();
  },

  loadSavedResolution() {
    const exerciseId = appStorage.getItem(this.resolutionLatestKey);
    if (!exerciseId) return false;
    const resolution = loadResolution(appStorage, exerciseId);
    if (!resolution) return false;
    this.resolution = resolution;
    this.collection = structuredClone(resolution.collection);
    this.enterCollection();
    return true;
  },

  enterEntry() {
    document.body.dataset.mode = 'entry';
    this.elements['back-to-choices'].hidden = true;
    this.elements['privacy-note'].textContent = 'Everything stays in this browser';
    this.show('mode');
  },

  enterSolo() {
    document.body.dataset.mode = 'solo';
    this.elements['back-to-choices'].hidden = false;
    this.responseStorageKey = null;
    this.elements['workspace-mode-label'].textContent = 'SOLO WORKSPACE';
    this.elements['privacy-note'].textContent = 'Everything stays in this browser';
    this.elements['setup-submit'].textContent = 'Start placing';
    this.elements['setup-share-panel'].hidden = true;
    this.show('setup');
  },

  enterFacilitatorSetup() {
    document.body.dataset.mode = 'facilitator-setup';
    this.elements['back-to-choices'].hidden = false;
    this.responseStorageKey = null;
    this.elements['workspace-mode-label'].textContent = 'FACILITATOR SETUP';
    this.elements['privacy-note'].textContent = 'Shared links contain setup data';
    this.elements['setup-submit'].textContent = 'Create setup link';
    this.elements['setup-share-panel'].hidden = true;
    this.show('setup');
  },

  enterCollection() {
    document.body.dataset.mode = 'facilitator-view';
    this.elements['back-to-choices'].hidden = false;
    this.elements['privacy-note'].textContent = 'Imported responses stay in this browser';
    this.renderCollection();
    this.show('collection');
  },

  showInvitation(artifact) {
    this.sharedArtifact = artifact;
    this.elements['back-to-choices'].hidden = true;
    document.body.dataset.mode = 'shared-setup';
    this.elements['privacy-note'].textContent = 'Shared links contain setup data';
    const title = document.createElement('strong');
    title.textContent = artifact.payload.prompt;
    const detail = document.createElement('span');
    detail.textContent = `${artifact.payload.items.length} options · ${artifact.payload.xLabel} × ${artifact.payload.yLabel}`;
    const context = document.createElement('p');
    context.className = 'context-description';
    context.textContent = artifact.payload.activityDescription;
    context.hidden = !artifact.payload.activityDescription;
    const describedItems = artifact.payload.items.filter(({ description }) => description);
    const descriptions = document.createElement('ul');
    descriptions.className = 'invitation-option-details';
    for (const item of describedItems) {
      const row = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = item.text;
      row.append(name, document.createTextNode(` — ${item.description}`));
      descriptions.append(row);
    }
    descriptions.hidden = describedItems.length === 0;
    this.elements['invitation-summary'].replaceChildren(title, detail, context, descriptions);
    this.show('invitation');
    return true;
  },

  showFacilitatorShare(artifact) {
    this.facilitatorShareArtifact = artifact;
    this.elements['back-to-choices'].hidden = true;
    if (artifact.kind === 'facilitator-view') {
      document.body.dataset.mode = 'shared-facilitator';
      this.elements['privacy-note'].textContent = 'This link contains aggregate results only';
      const { setup, responseCount, items } = artifact.payload;
      this.elements['shared-facilitator-title'].textContent = setup.prompt;
      this.setOptionalText(this.elements['shared-facilitator-description'], setup.activityDescription);
      this.elements['shared-facilitator-meta'].textContent = `${responseCount} ${responseCount === 1 ? 'response' : 'responses'} · ${setup.xLabel} × ${setup.yLabel}`;
      this.elements['shared-facilitator-x-summary'].textContent = `${setup.xLabel}: ${setup.xLow} — ${setup.xHigh}`;
      this.elements['shared-facilitator-y-summary'].textContent = `${setup.yLabel}: ${setup.yLow} — ${setup.yHigh}`;
      const board = this.elements['shared-facilitator-board'];
      const svg = (name, attributes = {}) => {
        const node = document.createElementNS('http://www.w3.org/2000/svg', name);
        for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
        return node;
      };
      const nodes = [];
      items.forEach((item, index) => {
        const x = 8 + item.resolved.x * 84;
        const y = 72 - item.resolved.y * 64;
        const baselineX = 8 + item.baseline.x * 84;
        const baselineY = 72 - item.baseline.y * 64;
        if (Math.hypot(x - baselineX, y - baselineY) > .01) nodes.push(svg('line', { x1: baselineX, y1: baselineY, x2: x, y2: y, stroke: '#6f5ae8', 'stroke-width': '.7' }));
        nodes.push(svg('circle', { cx: x, cy: y, r: 4.5 + Math.min(5, item.disagreement * 5), fill: 'rgba(111,90,232,.12)', stroke: '#6f5ae8' }));
        nodes.push(svg('circle', { cx: x, cy: y, r: 3.2, fill: '#17201b' }));
        const number = svg('text', { x, y: y + 1.2, fill: '#c7f36b', 'font-size': '3.5', 'font-weight': '900', 'text-anchor': 'middle' });
        number.textContent = String(index + 1);
        nodes.push(number);
      });
      board.replaceChildren(...nodes);
      this.elements['shared-facilitator-results'].replaceChildren(...items.map((item, index) => {
        const row = document.createElement('li');
        const heading = document.createElement('strong');
        heading.textContent = `${index + 1}. ${item.text}`;
        const description = document.createElement('p');
        description.textContent = item.description;
        description.hidden = !item.description;
        const result = document.createElement('p');
        result.textContent = `Final position: ${Math.round(item.resolved.x * 100)}% ${setup.xLabel}, ${Math.round(item.resolved.y * 100)}% ${setup.yLabel} · ${Math.round(item.disagreement / Math.SQRT2 * 100)}% disagreement`;
        row.append(heading, description, result);
        return row;
      }));
      this.show('shared-facilitator');
      return true;
    }

    document.body.dataset.mode = 'facilitator-handoff';
    this.elements['privacy-note'].textContent = 'Nothing is imported until you confirm';
    const summary = this.elements['facilitator-handoff-summary'];
    const title = document.createElement('strong');
    title.textContent = artifact.payload.setup.prompt;
    const count = document.createElement('p');
    count.textContent = `${artifact.payload.responses.length} responses · ${artifact.payload.setup.items.length} options`;
    const disclosure = document.createElement('p');
    disclosure.textContent = `${artifact.payload.includesNames ? 'Names included' : 'Names excluded'} · Individual placements included for continued facilitation`;
    summary.replaceChildren(title, count, disclosure);
    this.show('facilitator-handoff');
    return true;
  },

  async reviewFacilitatorBackup(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const artifact = parseFacilitatorArtifactJson(await file.text());
      if (artifact.kind !== 'facilitator-handoff') throw new Error('Choose an editable facilitator handoff JSON file.');
      this.elements['facilitator-backup-status'].textContent = '';
      this.showFacilitatorShare(artifact);
    } catch (error) {
      this.elements['facilitator-backup-status'].textContent = error.message;
    } finally {
      event.currentTarget.value = '';
    }
  },

  importFacilitatorHandoff() {
    if (this.facilitatorShareArtifact?.kind !== 'facilitator-handoff') return;
    const restored = restoreFacilitatorHandoff(this.facilitatorShareArtifact);
    this.collection = restored.collection;
    this.resolution = restored.resolution;
    this.focusedResolutionId = null;
    appStorage.setItem(this.resolutionLatestKey, this.collection.exerciseId);
    saveResolution(appStorage, this.resolution);
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    this.facilitatorShareArtifact = null;
    this.enterCollection();
    this.announce('Facilitator handoff imported as an independent local copy.');
  },

  discardFacilitatorHandoff() {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    this.facilitatorShareArtifact = null;
    this.enterEntry();
  },

  loadShared() {
    if (location.hash.startsWith('#facilitator=')) {
      try { return this.showFacilitatorShare(decodeFacilitatorArtifact(location.href)); }
      catch (error) { this.elements['setup-error'].textContent = error.message; return false; }
    }
    if (!location.hash.startsWith('#quadrant=')) return false;
    try {
      const artifact = decodeShareUrl(location.href);
      if (artifact.kind !== 'setup') return false;
      return this.showInvitation(artifact);
    } catch (error) {
      this.elements['setup-error'].textContent = error.message;
      return false;
    }
  },

  startResponse() {
    const setup = this.sharedArtifact.payload;
    this.responseStorageKey = `quadrant:response:v1:${this.sharedArtifact.exerciseId}`;
    let saved = null;
    try {
      saved = JSON.parse(appStorage.getItem(this.responseStorageKey));
    } catch {
      appStorage.removeItem(this.responseStorageKey);
    }
    const itemProjection = (items) => items?.map(({ id, text, description = '' }) => ({ id, text, description }));
    const sameSetup = saved?.prompt === setup.prompt
      && (saved.activityDescription ?? '') === setup.activityDescription
      && JSON.stringify(itemProjection(saved.items)) === JSON.stringify(itemProjection(setup.items));
    this.session = sameSetup
      ? saved
      : createWorkshop({ ...setup, items: setup.items });
    document.body.dataset.mode = 'response';
    this.elements['privacy-note'].textContent = 'Your response stays local until you copy it';
    document.body.dataset.setupId = this.sharedArtifact.exerciseId;
    if (!sameSetup) this.save();
    this.render();
  },

  show(name) {
    const scrollY = ['placement', 'review'].includes(name) ? window.scrollY : 0;
    for (const view of ['mode', 'invitation', 'shared-facilitator', 'facilitator-handoff', 'collection', 'setup', 'placement', 'review']) this.elements[`${view}-view`].hidden = view !== name;
    requestAnimationFrame(() => window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' }));
  },

  start(event) {
    event.preventDefault();
    this.elements['setup-error'].textContent = '';
    try {
      const nextSession = createWorkshop({
        prompt: this.elements.prompt.value,
        activityDescription: this.elements['activity-description'].value,
        xLabel: this.elements['x-label'].value,
        xLow: this.elements['x-low'].value,
        xHigh: this.elements['x-high'].value,
        yLabel: this.elements['y-label'].value,
        yLow: this.elements['y-low'].value,
        yHigh: this.elements['y-high'].value,
        items: this.setupItems(),
      });
      if (document.body.dataset.mode === 'facilitator-setup') {
        const url = encodeSetupUrl(nextSession, new URL(location.pathname, location.origin).toString());
        this.setupShareArtifact = decodeShareUrl(url);
        this.collection = createCollection(nextSession);
        this.elements['setup-share-output'].value = url;
        this.elements['answer-own-invitation'].href = url;
        this.elements['setup-share-panel'].hidden = false;
        this.elements['setup-share-status'].textContent = 'Setup ready. No placements or working state are included.';
        return;
      }
      this.session = nextSession;
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
    this.elements['activity-description'].value = 'Compare each idea by expected value and how confident we are in that estimate.';
    this.elements['x-label'].value = 'Expected value';
    this.elements['x-low'].value = 'Lower value';
    this.elements['x-high'].value = 'Higher value';
    this.elements['y-label'].value = 'Confidence';
    this.elements['y-low'].value = 'Lower confidence';
    this.elements['y-high'].value = 'Higher confidence';
    this.elements.items.value = ['Improve search', 'Add keyboard shortcuts', 'Clarify onboarding', 'Simplify navigation', 'Reduce page load time'].join('\n');
    this.optionDescriptions = new Map([
      ['Improve search', 'Help people recover when their first query does not find the right result.'],
      ['Clarify onboarding', 'Make the first successful workflow easier to understand.'],
    ]);
    this.updateCount();
    this.updatePreview();
    this.elements.prompt.focus();
  },

  optionTitles(id = 'items') {
    return this.elements[id].value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  },

  renderOptionEditors(mode = 'setup') {
    const setup = mode === 'setup';
    const container = this.elements[setup ? 'option-details' : 'ai-review-option-details'];
    const titles = this.optionTitles(setup ? 'items' : 'ai-review-options');
    const descriptions = setup ? this.optionDescriptions : this.aiOptionDescriptions;
    const current = [...container.querySelectorAll('textarea[data-option-title]')];
    const byTitle = new Map(current.map((input) => [input.dataset.optionTitle, input.value]));
    const byIndex = current.map((input) => input.value);
    const next = new Map();
    const rows = titles.map((title, index) => {
      const row = document.createElement('details');
      row.className = 'option-detail';
      const summary = document.createElement('summary');
      summary.textContent = title;
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = 'Optional detail';
      summary.append(hint);
      const label = document.createElement('label');
      const input = document.createElement('textarea');
      const id = `${setup ? 'option' : 'ai-option'}-description-${index}`;
      label.htmlFor = id;
      label.className = 'sr-only';
      label.textContent = `Description for ${title}`;
      input.id = id;
      input.dataset.optionTitle = title;
      input.dataset[setup ? 'optionDescription' : 'aiOptionDescription'] = String(index);
      input.placeholder = `Add context for “${title}”`;
      input.value = byTitle.get(title) ?? byIndex[index] ?? descriptions.get(title) ?? '';
      row.open = Boolean(input.value);
      next.set(title, input.value);
      input.addEventListener('input', () => (setup ? this.optionDescriptions : this.aiOptionDescriptions).set(title, input.value));
      row.append(summary, label, input);
      return row;
    });
    if (setup) this.optionDescriptions = next; else this.aiOptionDescriptions = next;
    container.replaceChildren(...rows);
  },

  setupItems() {
    return this.optionTitles().map((text, index) => ({
      text,
      description: this.elements['option-details'].querySelector(`[data-option-description="${index}"]`)?.value ?? this.optionDescriptions.get(text) ?? '',
    }));
  },

  setOptionalText(element, value) {
    element.textContent = value ?? '';
    element.hidden = !value;
  },

  updateCount() {
    const count = this.optionTitles().length;
    this.elements['item-count'].textContent = `${count} ${count === 1 ? 'option' : 'options'}`;
  },

  updatePreview() {
    this.elements['setup-preview-prompt'].textContent = this.elements.prompt.value.trim()
      || 'Frame the decision, then place every option on both axes.';
    this.setOptionalText(this.elements['setup-preview-description'], this.elements['activity-description'].value.trim());
    this.elements['setup-x-edit'].textContent = `${this.elements['x-label'].value.trim() || 'X axis'} · edit`;
    this.elements['setup-y-edit'].textContent = `${this.elements['y-label'].value.trim() || 'Y axis'} · edit`;
    this.elements['setup-x-low'].textContent = this.elements['x-low'].value.trim() || 'Lower X';
    this.elements['setup-x-high'].textContent = this.elements['x-high'].value.trim() || 'Higher X';
    this.elements['setup-y-low'].textContent = this.elements['y-low'].value.trim() || 'Lower Y';
    this.elements['setup-y-high'].textContent = this.elements['y-high'].value.trim() || 'Higher Y';
    const options = this.optionTitles();
    this.renderOptionEditors('setup');
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
    button.setAttribute('aria-label', `${point.text}${point.description ? '; details available' : ''}; ${this.describePosition(point)}${candidate ? '; drag to place' : ''}`);
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
        if (!candidate && this.session.phase === 'placement') {
          const activeItem = this.item(itemId);
          this.elements['candidate-card'].textContent = activeItem.text;
          this.setOptionalText(this.elements['candidate-description'], activeItem.description);
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
          this.session = repositionItem(this.session, itemId, latest);
          this.selectedId = itemId;
          this.save();
          this.announce(`${this.item(itemId).text} repositioned.`);
          this.render();
        } else if (this.session.phase === 'placement') {
          const candidateItem = this.item(this.session.candidateId);
          this.elements['candidate-card'].textContent = candidateItem.text;
          this.setOptionalText(this.elements['candidate-description'], candidateItem.description);
          this.elements['placement-coordinates'].textContent = this.describePosition(this.draftPosition);
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
    if (document.body.dataset.mode === 'response') this.elements['placement-round'].textContent = 'YOUR RESPONSE';
    const placedCount = Object.keys(this.session.positions).length;
    if (document.body.dataset.mode !== 'response') this.elements['placement-round'].textContent = `Round ${this.session.round} · place on the grid`;
    this.elements['placement-progress'].textContent = `${placedCount} of ${this.session.items.length} placed`;
    this.elements['placement-prompt'].textContent = this.session.prompt;
    this.setOptionalText(this.elements['placement-activity-description'], this.session.activityDescription);
    this.elements['placement-x-title'].textContent = this.session.xLabel;
    this.elements['placement-y-title'].textContent = this.session.yLabel;
    this.elements['placement-x-summary'].textContent = `${this.session.xLabel}: ${this.session.xLow} — ${this.session.xHigh}`;
    this.elements['placement-y-summary'].textContent = `${this.session.yLabel}: ${this.session.yLow} — ${this.session.yHigh}`;
    this.setAxisLabels('placement');
    this.renderPlacedItems(this.elements['placement-board']);
    const candidateButton = this.makeBoardItem({ ...candidate, ...this.draftPosition, focused: false }, this.elements['placement-board'], { candidate: true });
    this.elements['candidate-card'].textContent = candidate.text;
    this.setOptionalText(this.elements['candidate-description'], candidate.description);
    this.elements['placement-coordinates'].textContent = this.describePosition(this.draftPosition);
    this.elements['placement-undo'].disabled = this.session.history.length === 0;
    this.show('placement');
    candidateButton.focus();
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
    this.elements['review-round'].textContent = document.body.dataset.mode === 'response' ? 'YOUR RESPONSE' : `Round ${this.session.round} · review together`;
    this.elements['new-workshop'].textContent = document.body.dataset.mode === 'response' ? 'Restart my response' : 'Start a new workshop';
    this.elements['review-prompt'].textContent = this.session.prompt;
    this.setOptionalText(this.elements['review-activity-description'], this.session.activityDescription);
    this.setAxisLabels('board');
    this.renderPlacedItems(this.elements.board);
    this.elements['review-undo'].disabled = this.session.history.length === 0;
    const selected = this.selectedId ? this.item(this.selectedId) : null;
    this.elements['item-description-inspector'].hidden = !selected;
    if (selected) {
      this.elements['item-description-title'].textContent = selected.text;
      this.elements['item-description-text'].textContent = selected.description || 'No additional detail was provided.';
    }
    this.renderExport();
    this.elements['response-share-panel'].hidden = document.body.dataset.mode !== 'response';
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

  async copyText(text, output, status) {
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = 'Copied.';
    } catch {
      output.value = text;
      output.focus();
      output.select();
      status.textContent = 'Press Command+C or Control+C to copy.';
    }
  },

  async copySetup(forSlack) {
    const url = this.elements['setup-share-output'].value;
    const text = forSlack ? buildSlackMessage(this.setupShareArtifact, url) : url;
    await this.copyText(text, this.elements['setup-share-output'], this.elements['setup-share-status']);
  },

  async copyResponse(forSlack) {
    const url = encodeResponseUrl(this.session, {
      contributor: this.elements['contributor-name'].value,
      baseUrl: new URL(location.pathname, location.origin).toString(),
    });
    const artifact = decodeShareUrl(url);
    const text = forSlack ? buildSlackMessage(artifact, url, { preview: this.elements['include-response-preview'].checked }) : url;
    await this.copyText(text, this.elements['export-output'], this.elements['response-share-status']);
  },

  collectResponses() {
    const urls = this.elements['response-links'].value.match(/https?:\/\/\S+/gu) ?? [];
    let added = 0;
    let duplicates = 0;
    let mismatches = 0;
    for (const raw of urls) {
      try {
        const response = decodeShareUrl(raw.replace(/[)>.,]+$/u, ''));
        if (response.kind !== 'response') continue;
        if (!this.collection) this.collection = createCollection(response.setup);
        const result = addResponse(this.collection, response);
        this.collection = result.collection;
        if (result.status === 'added') added += 1;
        if (result.status === 'duplicate') duplicates += 1;
        if (result.status === 'mismatch') mismatches += 1;
      } catch {
        mismatches += 1;
      }
    }
    this.elements['collection-status'].textContent = `${added} added · ${duplicates} duplicate · ${mismatches} mismatch`;
    if (added > 0) this.resolution = createResolution(this.collection);
    this.renderCollection();
  },

  clearCollection() {
    this.collection = null;
    this.resolution = null;
    this.focusedResolutionId = null;
    appStorage.removeItem(this.resolutionLatestKey);
    this.elements['response-links'].value = '';
    this.elements['collection-status'].textContent = 'Collected responses cleared.';
    this.renderCollection();
  },

  renderConvergenceBoard(convergence) {
    const namespace = 'http://www.w3.org/2000/svg';
    const board = this.elements['convergence-board'];
    board.setAttribute('aria-label', `${convergence.responseCount} Quadrant responses with every submitted placement`);
    board.replaceChildren();
    const palette = ['#6f5ae8', '#f18b6d', '#4e9b55', '#bc7a16', '#247f91', '#a64f79'];
    convergence.items.forEach((item, itemIndex) => {
      const color = palette[itemIndex % palette.length];
      item.placements.forEach((placement) => {
        const mark = document.createElementNS(namespace, 'circle');
        mark.classList.add('placement-mark');
        if (this.focusedResolutionId === item.id) mark.classList.add('evidence-visible');
        mark.setAttribute('cx', String(8 + placement.x * 84));
        mark.setAttribute('cy', String(72 - placement.y * 64));
        mark.setAttribute('r', '3');
        mark.setAttribute('fill', color);
        mark.dataset.placementMark = '';
        mark.dataset.contributionId = placement.contributionId;
        mark.dataset.itemId = item.id;
        mark.dataset.x = String(placement.x);
        mark.dataset.y = String(placement.y);
        board.append(mark);
      });
    });
    this.resolution.items.forEach((item, itemIndex) => {
      const color = palette[itemIndex % palette.length];
      const convergenceItem = convergence.items.find(({ id }) => id === item.id);
      const display = item.resolved;
      const halo = document.createElementNS(namespace, 'circle');
      halo.classList.add('resolution-halo');
      if (this.focusedResolutionId === item.id) halo.classList.add('focused');
      halo.dataset.disagreementHalo = item.id;
      halo.setAttribute('cx', String(8 + item.resolved.x * 84));
      halo.setAttribute('cy', String(72 - item.resolved.y * 64));
      halo.setAttribute('r', String(4 + Math.min(9, convergenceItem.disagreement * 10)));
      halo.setAttribute('fill', color);
      halo.setAttribute('stroke', color);
      board.append(halo);

      const adjusted = item.resolved.x !== item.baseline.x || item.resolved.y !== item.baseline.y;
      if (adjusted) {
        const adjustmentLine = document.createElementNS(namespace, 'line');
        adjustmentLine.classList.add('adjustment-line');
        if (this.focusedResolutionId === item.id) adjustmentLine.classList.add('focused');
        adjustmentLine.dataset.adjustmentLine = item.id;
        adjustmentLine.setAttribute('x1', String(8 + item.baseline.x * 84));
        adjustmentLine.setAttribute('y1', String(72 - item.baseline.y * 64));
        adjustmentLine.setAttribute('x2', String(8 + item.resolved.x * 84));
        adjustmentLine.setAttribute('y2', String(72 - item.resolved.y * 64));
        const averageMarker = document.createElementNS(namespace, 'circle');
        averageMarker.classList.add('average-marker');
        if (this.focusedResolutionId === item.id) averageMarker.classList.add('focused');
        averageMarker.dataset.averageMarker = item.id;
        averageMarker.dataset.itemId = item.id;
        averageMarker.setAttribute('cx', adjustmentLine.getAttribute('x1'));
        averageMarker.setAttribute('cy', adjustmentLine.getAttribute('y1'));
        averageMarker.setAttribute('r', '1.6');
        board.append(adjustmentLine, averageMarker);
      }

      const card = document.createElementNS(namespace, 'g');
      card.classList.add('resolution-card');
      if (this.focusedResolutionId === item.id) card.classList.add('focused');
      card.dataset.resolutionCard = item.id;
      card.dataset.itemId = item.id;
      card.dataset.resolvedX = String(item.resolved.x);
      card.dataset.resolvedY = String(item.resolved.y);
      card.dataset.adjusted = String(adjusted);
      card.dataset.averageX = String(item.baseline.x);
      card.dataset.averageY = String(item.baseline.y);
      card.dataset.displayX = String(display.x);
      card.dataset.displayY = String(display.y);
      card.setAttribute('transform', `translate(${8 + display.x * 84} ${72 - display.y * 64})`);
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `${item.text}; current group result at ${Math.round(item.resolved.x * 100)} percent ${this.collection.setup.xLabel}, ${Math.round(item.resolved.y * 100)} percent ${this.collection.setup.yLabel}`);
      card.addEventListener('click', (event) => { if (event.detail === 0) this.toggleResolutionFocus(item.id); });
      card.addEventListener('keydown', (event) => this.moveResolutionByKeyboard(event, item.id));
      card.addEventListener('pointerdown', (event) => this.startResolutionDrag(event, item.id));
      const hitTarget = document.createElementNS(namespace, 'circle');
      hitTarget.classList.add('resolution-hit-target');
      hitTarget.setAttribute('r', '6.5');
      const circle = document.createElementNS(namespace, 'circle');
      circle.setAttribute('r', '4.6');
      const label = document.createElementNS(namespace, 'text');
      label.textContent = String(itemIndex + 1);
      card.append(hitTarget, circle, label);
      board.append(card);
    });
    const addAxisLabel = (text, x, y, { anchor = 'start', transform = '', title: isTitle = false } = {}) => {
      const label = document.createElementNS(namespace, 'text');
      label.classList.add('convergence-axis-label');
      if (isTitle) label.classList.add('convergence-axis-title');
      label.dataset.convergenceAxisLabel = '';
      label.textContent = text;
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(y));
      label.setAttribute('text-anchor', anchor);
      if (transform) label.setAttribute('transform', transform);
      board.append(label);
    };
    const { xLabel, xLow, xHigh, yLabel, yLow, yHigh } = this.collection.setup;
    addAxisLabel(xLow, 8, 78);
    addAxisLabel(xLabel, 50, 78, { anchor: 'middle', title: true });
    addAxisLabel(xHigh, 92, 78, { anchor: 'end' });
    addAxisLabel(yLow, 10, 70);
    addAxisLabel(yLabel, 3, 40, { anchor: 'middle', transform: 'rotate(-90 3 40)', title: true });
    addAxisLabel(yHigh, 10, 11);
    const focusedEvidence = board.querySelectorAll(`[data-placement-mark][data-item-id="${this.focusedResolutionId}"], [data-adjustment-line="${this.focusedResolutionId}"], [data-average-marker="${this.focusedResolutionId}"]`);
    focusedEvidence.forEach((node) => board.append(node));
    const focusedCard = board.querySelector(`[data-resolution-card][data-item-id="${this.focusedResolutionId}"]`);
    if (focusedCard) board.append(focusedCard);
    board.classList.toggle('has-focus', Boolean(this.focusedResolutionId));
    this.renderResolutionInspector(convergence);
  },

  focusResolution(itemId) {
    this.focusedResolutionId = itemId;
    this.renderCollection();
  },

  toggleResolutionFocus(itemId) {
    this.focusResolution(this.focusedResolutionId === itemId ? null : itemId);
  },

  restoreResolutionCardFocus(itemId) {
    this.elements['convergence-board'].querySelector(`[data-resolution-card][data-item-id="${itemId}"]`)?.focus();
  },

  commitResolution(next) {
    if (!next) return;
    this.resolution = next;
    saveResolution(appStorage, next);
    appStorage.setItem(this.resolutionLatestKey, next.collection.exerciseId);
    this.renderCollection();
  },

  moveResolutionByKeyboard(event, itemId) {
    if (['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      this.toggleResolutionFocus(itemId);
      this.restoreResolutionCardFocus(itemId);
      return;
    }
    const delta = event.shiftKey ? 0.05 : 0.02;
    const movement = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, delta], ArrowDown: [0, -delta] }[event.key];
    if (!movement) return;
    event.preventDefault();
    if (this.focusedResolutionId !== itemId) {
      this.focusResolution(itemId);
      this.restoreResolutionCardFocus(itemId);
      return;
    }
    const item = this.resolution.items.find(({ id }) => id === itemId);
    this.commitResolution(adjustResolution(this.resolution, itemId, {
      x: clamp(item.resolved.x + movement[0], 0, 1),
      y: clamp(item.resolved.y + movement[1], 0, 1),
    }));
    this.restoreResolutionCardFocus(itemId);
  },

  resolutionPoint(event) {
    const bounds = this.elements['convergence-board'].getBoundingClientRect();
    return {
      x: clamp(((event.clientX - bounds.left) / bounds.width * 100 - 8) / 84, 0, 1),
      y: clamp((72 - (event.clientY - bounds.top) / bounds.height * 80) / 64, 0, 1),
    };
  },

  startResolutionDrag(event, itemId) {
    event.preventDefault();
    this.draggedResolutionId = itemId;
    this.resolutionPointerStart = { x: event.clientX, y: event.clientY };
    this.resolutionPointerMoved = false;
    this.resolutionPointerCanAdjust = this.focusedResolutionId === itemId;
  },

  previewResolutionDrag(event) {
    if (!this.draggedResolutionId || !this.resolutionPointerStart) return;
    const distance = Math.hypot(
      event.clientX - this.resolutionPointerStart.x,
      event.clientY - this.resolutionPointerStart.y,
    );
    if (distance < 5) return;
    this.resolutionPointerMoved = true;
    if (!this.resolutionPointerCanAdjust) return;
    const point = this.resolutionPoint(event);
    const card = this.elements['convergence-board'].querySelector(`[data-item-id="${this.draggedResolutionId}"].resolution-card`);
    card?.setAttribute('transform', `translate(${8 + point.x * 84} ${72 - point.y * 64})`);
  },

  finishResolutionDrag(event) {
    if (!this.draggedResolutionId) return;
    const itemId = this.draggedResolutionId;
    const moved = this.resolutionPointerMoved;
    const canAdjust = this.resolutionPointerCanAdjust;
    this.draggedResolutionId = null;
    this.resolutionPointerStart = null;
    this.resolutionPointerMoved = false;
    this.resolutionPointerCanAdjust = false;
    if (!moved) {
      this.toggleResolutionFocus(itemId);
      return;
    }
    if (!canAdjust) {
      this.focusResolution(itemId);
      return;
    }
    this.commitResolution(adjustResolution(this.resolution, itemId, this.resolutionPoint(event)));
  },

  navigatorItems(convergence) {
    return convergence.items.map((item, inputIndex) => ({ ...item, inputIndex }))
      .sort((first, second) => second.disagreement - first.disagreement || first.inputIndex - second.inputIndex);
  },

  moveResolutionFocus(delta) {
    if (!this.collection) return;
    const convergence = convergeResponses(this.collection);
    const items = this.navigatorItems(convergence);
    const current = Math.max(0, items.findIndex(({ id }) => id === this.focusedResolutionId));
    const next = (current + delta + items.length) % items.length;
    this.focusResolution(items[next].id);
  },

  renderResolutionNavigator(convergence) {
    const items = this.navigatorItems(convergence);
    this.elements['disagreement-list'].replaceChildren(...items.map((item) => {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'navigator-item';
      button.dataset.navigatorItem = '';
      button.dataset.itemId = item.id;
      button.setAttribute('aria-current', String(item.id === this.focusedResolutionId));
      const itemNumber = String(item.inputIndex + 1);
      button.setAttribute('aria-label', `Item ${itemNumber}, ${item.text}: ${item.placements.length} placements, ${Math.round(item.disagreement / Math.SQRT2 * 100)} percent spread`);
      const identity = document.createElement('span');
      identity.className = 'navigator-identity';
      const number = document.createElement('span');
      number.className = 'item-number';
      number.dataset.itemNumber = '';
      number.textContent = itemNumber;
      const label = document.createElement('strong');
      label.textContent = item.text;
      identity.append(number, label);
      const spread = document.createElement('span');
      spread.className = 'navigator-spread';
      spread.textContent = `${Math.round(item.disagreement / Math.SQRT2 * 100)}% spread`;
      button.append(identity, spread);
      button.addEventListener('click', () => this.toggleResolutionFocus(item.id));
      row.append(button);
      return row;
    }));
  },

  renderResolutionExport() {
    if (!this.resolution) return;
    this.elements['resolution-export-output'].value = formatResolutionExport(this.resolution, {
      includeAdjustments: this.elements['include-resolution-adjustments'].checked,
    });
    this.elements['resolution-export-status'].textContent = 'Plain-text export prepared locally.';
  },

  async copyResolutionExport() {
    if (!this.elements['resolution-export-output'].value) this.renderResolutionExport();
    try {
      await navigator.clipboard.writeText(this.elements['resolution-export-output'].value);
      this.elements['resolution-export-status'].textContent = 'Resolution text copied.';
    } catch {
      this.elements['resolution-export-output'].select();
      this.elements['resolution-export-status'].textContent = 'Select and copy the prepared text.';
    }
  },

  async copyFacilitatorShare(kind) {
    if (!this.resolution) return;
    const includeNames = this.elements['include-handoff-names'].checked;
    const artifact = kind === 'view'
      ? createFacilitatorViewArtifact(this.resolution)
      : createFacilitatorHandoffArtifact(this.resolution, { includeNames });
    this.facilitatorBackupArtifact = kind === 'handoff'
      ? artifact
      : createFacilitatorHandoffArtifact(this.resolution, { includeNames });
    const output = this.elements['facilitator-share-output'];
    const status = this.elements['facilitator-share-status'];
    try {
      const url = encodeFacilitatorArtifactUrl(artifact, new URL(location.pathname, location.origin).toString());
      output.value = url;
      status.textContent = kind === 'view'
        ? 'View-only link ready. It excludes participant names and individual placements.'
        : `Editable handoff ready. Individual placements included; participant names ${includeNames ? 'included' : 'excluded'}.`;
      try { await navigator.clipboard.writeText(url); status.textContent += ' Link copied.'; }
      catch { output.select(); status.textContent += ' Select and copy the link.'; }
    } catch (error) {
      output.value = facilitatorArtifactJson(this.facilitatorBackupArtifact);
      status.textContent = `${error.message} Editable JSON is ready below or as a download.`;
    }
  },

  downloadFacilitatorBackup() {
    if (!this.resolution) return;
    const artifact = this.facilitatorBackupArtifact ?? createFacilitatorHandoffArtifact(this.resolution, { includeNames: this.elements['include-handoff-names'].checked });
    const blob = new Blob([facilitatorArtifactJson(artifact)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `quadrant-facilitator-${artifact.exerciseId}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    this.elements['facilitator-share-status'].textContent = 'Editable facilitator JSON downloaded.';
  },

  renderResolutionInspector(convergence) {
    const inspector = this.elements['resolution-inspector'];
    const item = convergence.items.find(({ id }) => id === this.focusedResolutionId);
    if (!item) {
      inspector.hidden = true;
      delete inspector.dataset.itemId;
      return;
    }
    inspector.hidden = false;
    inspector.dataset.itemId = item.id;
    const heading = document.createElement('h3');
    heading.className = 'resolution-heading';
    const number = document.createElement('span');
    number.className = 'item-number';
    number.dataset.itemNumber = '';
    number.textContent = String(this.resolution.items.findIndex(({ id }) => id === item.id) + 1);
    const label = document.createElement('span');
    label.textContent = item.text;
    heading.append(number, label);
    const description = document.createElement('p');
    description.className = 'context-description';
    description.textContent = item.description;
    description.hidden = !item.description;
    const detail = document.createElement('p');
    detail.className = 'hint';
    detail.textContent = `${item.placements.length} placements · ${Math.round(item.disagreement / Math.SQRT2 * 100)}% spread`;
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.id = 'reset-resolution-item';
    reset.className = 'button button-quiet';
    reset.textContent = 'Reset item to average';
    reset.addEventListener('click', () => this.commitResolution(resetResolutionItem(this.resolution, item.id)));
    inspector.replaceChildren(heading, description, detail, reset);
  },

  renderCollection() {
    const responses = this.collection?.responses ?? [];
    const grid = this.elements['collection-grid'];
    const importPanel = this.elements['response-import-panel'];
    const hadResponses = grid.classList.contains('has-responses');
    const hasResponses = responses.length > 0;
    grid.classList.toggle('has-responses', hasResponses);
    if (!hasResponses) importPanel.open = true;
    else if (!hadResponses) importPanel.open = false;
    this.elements['response-count'].textContent = `${responses.length} ${responses.length === 1 ? 'response' : 'responses'}`;
    this.elements['response-list'].replaceChildren(...responses.map(({ contributor }) => {
      const item = document.createElement('li');
      item.textContent = contributor;
      return item;
    }));
    this.elements['response-list'].hidden = !this.showResponseNames;
    if (!responses.length) {
      this.elements['convergence-board'].replaceChildren();
      this.elements['convergence-summary'].textContent = 'Add response links to reveal placement spread.';
      return;
    }
    const convergence = convergeResponses(this.collection);
    if (!this.resolution) this.resolution = createResolution(this.collection);
    this.elements['undo-resolution'].disabled = !this.resolution.history.length;
    this.renderResolutionNavigator(convergence);
    this.renderConvergenceBoard(convergence);
    const disputed = convergence.items.filter(({ disagreement }) => disagreement > 0).length;
    this.elements['convergence-summary'].textContent = `${disputed} of ${convergence.items.length} options have differing responses. Each number shows the current group result.`;
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

  activeStorageKey() {
    return this.responseStorageKey ?? this.storageKey;
  },

  save() {
    const status = this.elements['storage-status'];
    const result = persistWithRecovery(appStorage, this.activeStorageKey(), this.session);
    if (result.status === 'saved') {
      status.hidden = true;
      status.textContent = '';
      return true;
    }
    if (result.status === 'recovered') {
      status.textContent = 'Cleaned up old saved work and saved your current work.';
      status.hidden = false;
      this.announce(status.textContent);
      return true;
    }
    status.textContent = 'Browser storage is full. Your current work remains available in this tab, but it may not survive a reload.';
    status.hidden = false;
    this.announce(status.textContent);
    return false;
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
      const saved = this.migrate(JSON.parse(appStorage.getItem(this.storageKey)));
      if (!saved?.prompt || !saved?.items?.length) return;
      this.session = saved;
      this.elements['resume-banner'].hidden = false;
      this.elements['resume-summary'].textContent = `${saved.items.length} options · round ${saved.round}`;
    } catch {
      appStorage.removeItem(this.storageKey);
    }
  },

  reset() {
    appStorage.removeItem(this.activeStorageKey());
    this.selectedId = null;
    this.draftPosition = { x: 0.5, y: 0.5 };
    this.elements['resume-banner'].hidden = true;
    this.elements['setup-error'].textContent = '';
    if (document.body.dataset.mode === 'response' && this.sharedArtifact) {
      const setup = this.sharedArtifact.payload;
      this.session = createWorkshop({ ...setup, items: setup.items.map(({ text }) => text).join('\n') });
      this.save();
      this.announce('Response restarted.');
      this.render();
      return;
    }
    this.session = null;
    this.show('setup');
    this.elements.prompt.focus();
  },

  announce(message) {
    this.elements['live-region'].textContent = '';
    requestAnimationFrame(() => { this.elements['live-region'].textContent = message; });
  },
};

facilitatorApp.init();

export { facilitatorApp };
