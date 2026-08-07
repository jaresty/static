import {
  applyChoice,
  createSession,
  exportRanking,
  parseItems,
  undoChoice,
} from './ranking.mjs';
import {
  addResponse,
  buildSlackMessage,
  createCollection,
  decodeShareUrl,
  encodeResponseUrl,
  encodeSetupUrl,
  convergeResponses,
} from './collaboration.mjs';

const appStorage = new URLSearchParams(location.search).get('walkthrough') === '1' ? sessionStorage : localStorage;

const rankingApp = {
  storageKey: 'pairwise-ranker:session:v1',
  session: null,
  responseStorageKey: null,
  sharedArtifact: null,
  setupShareArtifact: null,
  collection: null,
  elements: {},

  init() {
    const ids = [
      'mode-view', 'solo-mode', 'setup-mode', 'combine-mode', 'back-to-choices', 'privacy-note', 'privacy-copy', 'invitation-view', 'invitation-summary', 'start-response',
      'collection-view', 'response-links', 'collect-responses', 'clear-responses', 'collection-status', 'response-count', 'response-list', 'consensus-list', 'ranking-evidence', 'disagreement-list', 'consensus-notice',
      'setup-view', 'workspace-mode-label', 'setup-submit', 'setup-share-panel', 'setup-share-output', 'copy-setup-slack', 'copy-setup-link', 'setup-share-status',
      'compare-view', 'review-view', 'setup-form', 'criterion', 'items',
      'item-count', 'setup-error', 'example-button', 'resume-banner', 'resume-summary',
      'resume-button', 'discard-button', 'criterion-display', 'progress-label', 'progress-fill',
      'left-text', 'right-text', 'left-button', 'right-button', 'tie-button', 'unsure-button',
      'undo-button', 'restart-compare-button', 'rationale', 'review-criterion', 'ranked-list',
      'uncertainty-notice', 'back-to-compare-button', 'new-ranking-button', 'export-format',
      'response-share-panel', 'contributor-name', 'include-response-preview', 'copy-response-slack', 'copy-response-link', 'response-share-status',
      'export-output', 'copy-button', 'copy-status', 'live-region',
    ];
    this.elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

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

    if (!this.loadShared()) this.loadSavedSession();
    this.updateCount();
  },

  itemById(id) {
    return this.session.items.find((item) => item.id === id);
  },

  enterEntry() {
    document.body.dataset.mode = 'entry';
    this.elements['back-to-choices'].hidden = true;
    this.elements['privacy-copy'].textContent = 'Everything stays in this browser';
    this.show('mode');
  },

  enterSolo() {
    document.body.dataset.mode = 'solo';
    this.elements['back-to-choices'].hidden = false;
    this.responseStorageKey = null;
    this.elements['workspace-mode-label'].textContent = 'SOLO WORKSPACE';
    this.elements['privacy-copy'].textContent = 'Everything stays in this browser';
    this.elements['setup-submit'].textContent = 'Start comparing →';
    this.elements['setup-share-panel'].hidden = true;
    this.show('setup');
  },

  enterFacilitatorSetup() {
    document.body.dataset.mode = 'facilitator-setup';
    this.elements['back-to-choices'].hidden = false;
    this.responseStorageKey = null;
    this.elements['workspace-mode-label'].textContent = 'FACILITATOR SETUP';
    this.elements['privacy-copy'].textContent = 'Shared links contain setup data';
    this.elements['setup-submit'].textContent = 'Create setup link';
    this.elements['setup-share-panel'].hidden = true;
    this.show('setup');
  },

  enterCollection() {
    document.body.dataset.mode = 'facilitator-view';
    this.elements['back-to-choices'].hidden = false;
    this.elements['privacy-copy'].textContent = 'Imported responses stay in this browser';
    this.renderCollection();
    this.show('collection');
  },

  showInvitation(artifact) {
    this.sharedArtifact = artifact;
    this.elements['back-to-choices'].hidden = true;
    document.body.dataset.mode = 'shared-setup';
    this.elements['privacy-copy'].textContent = 'Shared links contain setup data';
    const title = document.createElement('strong');
    title.textContent = artifact.payload.criterion;
    const detail = document.createElement('span');
    detail.textContent = `${artifact.payload.items.length} items to rank`;
    this.elements['invitation-summary'].replaceChildren(title, detail);
    this.show('invitation');
    return true;
  },

  loadShared() {
    if (!location.hash.startsWith('#stack-rank=')) return false;
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
    this.responseStorageKey = `pairwise-ranker:response:v1:${this.sharedArtifact.exerciseId}`;
    let saved = null;
    try {
      saved = JSON.parse(appStorage.getItem(this.responseStorageKey));
    } catch {
      appStorage.removeItem(this.responseStorageKey);
    }
    const sameSetup = saved?.criterion === setup.criterion
      && JSON.stringify(saved.items?.map(({ id, text }) => ({ id, text }))) === JSON.stringify(setup.items);
    this.session = sameSetup
      ? saved
      : createSession(setup.criterion, setup.items.map(({ text }) => text).join('\n'));
    document.body.dataset.mode = 'response';
    this.elements['privacy-copy'].textContent = 'Your response stays local until you copy it';
    document.body.dataset.setupId = this.sharedArtifact.exerciseId;
    if (!sameSetup) this.save();
    this.render();
  },

  show(name) {
    for (const view of ['mode', 'invitation', 'collection', 'setup', 'compare', 'review']) {
      this.elements[`${view}-view`].hidden = view !== name;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  },

  start(event) {
    event.preventDefault();
    this.elements['setup-error'].textContent = '';
    try {
      const nextSession = createSession(this.elements.criterion.value, this.elements.items.value);
      if (document.body.dataset.mode === 'facilitator-setup') {
        const url = encodeSetupUrl(nextSession, new URL(location.pathname, location.origin).toString());
        this.setupShareArtifact = decodeShareUrl(url);
        this.collection = createCollection(nextSession);
        this.elements['setup-share-output'].value = url;
        this.elements['setup-share-panel'].hidden = false;
        this.elements['setup-share-status'].textContent = 'Setup ready. No comparisons, drafts, or progress are included.';
        return;
      }
      this.session = nextSession;
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
    this.elements['new-ranking-button'].textContent = document.body.dataset.mode === 'response' ? 'Restart my response' : 'Start a new ranking';
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
    this.elements['response-share-panel'].hidden = document.body.dataset.mode !== 'response';
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
    this.renderCollection();
  },

  clearCollection() {
    this.collection = null;
    this.elements['response-links'].value = '';
    this.elements['collection-status'].textContent = 'Collected responses cleared.';
    this.renderCollection();
  },

  renderCollection() {
    const responses = this.collection?.responses ?? [];
    this.elements['response-count'].textContent = `${responses.length} ${responses.length === 1 ? 'response' : 'responses'}`;
    this.elements['response-list'].replaceChildren(...responses.map(({ contributor }) => {
      const item = document.createElement('li');
      item.textContent = contributor;
      return item;
    }));
    this.elements['consensus-list'].replaceChildren();
    this.elements['ranking-evidence'].replaceChildren();
    this.elements['disagreement-list'].replaceChildren();
    if (!responses.length) {
      this.elements['consensus-notice'].hidden = true;
      return;
    }
    const convergence = convergeResponses(this.collection);
    for (const ranked of convergence.order) {
      const item = document.createElement('li');
      item.className = 'ranked-item';
      item.dataset.aggregateItem = '';
      item.dataset.itemId = ranked.id;
      const label = document.createElement('span');
      label.className = 'ranked-copy';
      label.textContent = ranked.text;
      item.append(label);
      this.elements['consensus-list'].append(item);
    }
    const names = new Map(this.collection.setup.items.map(({ id, text }) => [id, text]));
    for (const ranking of convergence.rankings) {
      const card = document.createElement('section');
      card.className = 'ranking-card';
      card.dataset.ranking = ranking.contributionId;
      const heading = document.createElement('strong');
      heading.textContent = ranking.contributor;
      const list = document.createElement('ol');
      ranking.groups.forEach((group, rank) => group.forEach((id) => {
        const item = document.createElement('li');
        item.dataset.rankingItem = id;
        item.value = rank + 1;
        item.textContent = names.get(id);
        list.append(item);
      }));
      card.append(heading, list);
      this.elements['ranking-evidence'].append(card);
    }
    for (const pair of convergence.pairs) {
      const left = names.get(pair.leftId);
      const right = names.get(pair.rightId);
      const row = document.createElement('li');
      row.dataset.pairSplit = `${pair.leftId}:${pair.rightId}`;
      row.setAttribute('aria-label', `${left} versus ${right}: ${pair.leftWins} prefer ${left}, ${pair.ties} ties, ${pair.rightWins} prefer ${right}, across ${pair.responseCount} responses`);
      const label = document.createElement('div');
      label.className = 'pair-label';
      const title = document.createElement('span');
      title.textContent = `${left} / ${right}`;
      const totals = document.createElement('span');
      totals.textContent = `${pair.leftWins} · ${pair.ties} · ${pair.rightWins}`;
      label.append(title, totals);
      const bar = document.createElement('div');
      bar.className = 'vote-bar';
      bar.setAttribute('aria-hidden', 'true');
      [['vote-left', pair.leftWins], ['vote-tie', pair.ties], ['vote-right', pair.rightWins]].forEach(([className, votes]) => {
        const segment = document.createElement('span');
        segment.className = className;
        segment.dataset.voteSegment = className;
        segment.dataset.votes = String(votes);
        segment.style.width = `${pair.responseCount ? votes / pair.responseCount * 100 : 0}%`;
        bar.append(segment);
      });
      row.append(label, bar);
      this.elements['disagreement-list'].append(row);
    }
    const disputed = convergence.pairs.filter(({ disagreement }) => disagreement > 0).length;
    this.elements['consensus-notice'].hidden = false;
    this.elements['consensus-notice'].textContent = `${disputed} pairwise relationships differ. Every ranking is retained.`;
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

  activeStorageKey() {
    return this.responseStorageKey ?? this.storageKey;
  },

  save() {
    appStorage.setItem(this.activeStorageKey(), JSON.stringify(this.session));
  },

  loadSavedSession() {
    try {
      const saved = JSON.parse(appStorage.getItem(this.storageKey));
      if (!saved?.criterion || !saved?.items?.length) return;
      this.session = saved;
      this.elements['resume-banner'].hidden = false;
      this.elements['resume-summary'].textContent = `${saved.items.length} items · ${saved.criterion}`;
    } catch {
      appStorage.removeItem(this.storageKey);
    }
  },

  resume() {
    if (this.session) this.render();
  },

  reset() {
    appStorage.removeItem(this.activeStorageKey());
    this.elements['resume-banner'].hidden = true;
    this.elements['setup-error'].textContent = '';
    if (document.body.dataset.mode === 'response' && this.sharedArtifact) {
      const setup = this.sharedArtifact.payload;
      this.session = createSession(setup.criterion, setup.items.map(({ text }) => text).join('\n'));
      this.save();
      this.announce('Response restarted.');
      this.render();
      return;
    }
    this.session = null;
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

export { rankingApp };
