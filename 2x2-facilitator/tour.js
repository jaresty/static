import { driver } from '../vendor/driver.js.mjs';
import { facilitatorApp as app } from './app.js';
import { createWorkshop, placeAt } from './core.mjs';
import { addResponse, createCollection, decodeShareUrl, encodeResponseUrl } from './collaboration.mjs';
import { adjustResolution, createResolution } from './resolution.mjs';

const seenKey = 'quadrant:tour-seen:v2';
const practice = new URLSearchParams(location.search).get('walkthrough') === '1';
const offer = document.querySelector('[data-tour-offer]');
const replay = document.querySelector('#take-tour');

function launchPractice() {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('walkthrough', '1');
  window.open(url.href, '_blank', 'noopener');
}

function finishPractice() {
  location.replace(new URL(location.pathname, location.origin));
}

function restartPractice() {
  sessionStorage.clear();
  location.reload();
}

function renderPracticeControls(popover) {
  if (popover.footerButtons.querySelector('[data-practice-control]')) return;
  const restart = document.createElement('button');
  restart.type = 'button';
  restart.className = 'practice-control';
  restart.dataset.practiceControl = 'restart';
  restart.textContent = 'Restart practice';
  restart.addEventListener('click', restartPractice);
  const exit = document.createElement('button');
  exit.type = 'button';
  exit.className = 'practice-control';
  exit.dataset.practiceControl = 'exit';
  exit.textContent = 'Exit practice';
  exit.addEventListener('click', finishPractice);
  popover.footerButtons.prepend(exit);
  popover.footerButtons.prepend(restart);
}

function makePracticeBanner() {
  const banner = document.createElement('aside');
  banner.className = 'tour-offer';
  banner.dataset.walkthroughBanner = '';
  banner.dataset.finishWalkthrough = '';
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = 'Practice walkthrough';
  const detail = document.createElement('p');
  detail.textContent = 'Disposable sample data · your real workspace remains in the original tab.';
  copy.append(title, detail);
  banner.append(copy);
  document.querySelector('.masthead').after(banner);
  return banner;
}

const waitFrame = (callback) => requestAnimationFrame(() => requestAnimationFrame(callback));
const pointPattern = [{ x: .2, y: .75 }, { x: .76, y: .32 }, { x: .58, y: .66 }, { x: .35, y: .42 }, { x: .82, y: .7 }];

function completeSession(session, points) {
  let next = session;
  let index = 0;
  while (next.phase === 'placement') {
    next = placeAt(next, points[index % points.length]);
    index += 1;
  }
  return next;
}

function responseUrl(session, contributor) {
  return encodeResponseUrl(session, { contributor, baseUrl: new URL(location.pathname, location.origin).toString() });
}

function prepareSetup() {
  app.enterFacilitatorSetup();
  app.useExample();
  app.elements.prompt.value = 'Practice: which ideas should we explore first?';
  app.updateCount();
  app.updatePreview();
}

function prepareShare() {
  app.start({ preventDefault() {} });
}

function prepareInvitation() {
  app.showInvitation(app.setupShareArtifact);
}

function prepareParticipantStart() {
  app.startResponse();
}

function prepareParticipantComplete() {
  app.session = completeSession(app.session, pointPattern);
  app.save();
  app.render();
}

function prepareCollection() {
  const firstSession = app.session;
  const setup = app.sharedArtifact.payload;
  let secondSession = createWorkshop({ ...setup, items: setup.items.map(({ text }) => text).join('\n') });
  secondSession = completeSession(secondSession, [...pointPattern].reverse().map(({ x, y }) => ({ x: 1 - x, y: 1 - y })));
  const firstUrl = responseUrl(firstSession, 'Practice participant A');
  const secondUrl = responseUrl(secondSession, 'Practice participant B');
  const first = decodeShareUrl(firstUrl);
  const second = decodeShareUrl(secondUrl);
  let collection = createCollection(first.setup);
  collection = addResponse(collection, first).collection;
  collection = addResponse(collection, second).collection;
  app.collection = collection;
  app.resolution = createResolution(collection);
  app.elements['response-links'].value = '';
  app.enterCollection();
}

function prepareDisagreement() {
  const item = [...app.navigatorItems((() => {
    const responseCount = app.collection.responses.length;
    const items = app.collection.setup.items.map(({ id, text }) => {
      const placements = app.collection.responses.map(({ payload, contributionId, contributor }) => ({ ...payload.positions[id], contributionId, contributor }));
      const disagreement = Math.max(...placements.flatMap((point, index) => placements.slice(index + 1).map((other) => Math.hypot(point.x - other.x, point.y - other.y))), 0);
      return { id, text, placements, disagreement };
    });
    return { responseCount, items };
  })())][0];
  app.focusResolution(item.id);
}

function prepareResolution() {
  const item = app.resolution.items.find(({ id }) => id === app.focusedResolutionId) ?? app.resolution.items[0];
  app.focusedResolutionId = item.id;
  app.commitResolution(adjustResolution(app.resolution, item.id, {
    x: Math.min(1, item.resolved.x + .12),
    y: Math.max(0, item.resolved.y - .08),
  }));
}

function prepareExport() {
  app.elements['include-resolution-adjustments'].checked = true;
  app.renderResolutionExport();
}

function startPractice() {
  offer.hidden = true;
  const banner = document.querySelector('[data-walkthrough-banner]') ?? makePracticeBanner();
  const phases = [
    { name: 'entry', element: '#mode-title', title: 'Start with the workflow', description: 'This practice run covers setup, a participant response, collection, resolution, and export.' },
    { name: 'setup', prepare: prepareSetup, element: '#setup-submit', title: 'Prepare the shared setup', description: 'Define the prompt, axes, and options. Shared setup contains no placements.' },
    { name: 'share', prepare: prepareShare, element: '#setup-share-panel', title: 'Share setup, not working state', description: 'This generated link is what a facilitator sends to participants.' },
    { name: 'invitation', prepare: prepareInvitation, element: '#start-response', title: 'Participant sees a read-only invitation', description: 'Nothing is created until Start my response is chosen.' },
    { name: 'participantStart', prepare: prepareParticipantStart, element: '#place-option', title: 'Place each option privately', description: 'Participants use the real placement controls; progress remains local.' },
    { name: 'participantComplete', prepare: prepareParticipantComplete, element: '#copy-response-link', title: 'Return a completed response', description: 'Only final placements enter the response link.' },
    { name: 'collection', prepare: prepareCollection, element: '#response-count', title: 'Collect completed responses', description: 'The practice facilitator now has two immutable participant responses.' },
    { name: 'disagreement', prepare: prepareDisagreement, element: '#resolution-inspector', title: 'Inspect disagreement', description: 'Focus reveals the raw placements for one item without collapsing them.' },
    { name: 'resolution', prepare: prepareResolution, element: '[data-resolution-card][data-adjusted="true"]', title: 'Adjust from the average', description: 'The number starts at the participant average and moves only when the facilitator adjusts it.' },
    { name: 'export', prepare: prepareExport, element: '#resolution-export-output', title: 'Prepare a readable outcome', description: 'Adjustment provenance appears only when explicitly included.' },
    { name: 'finish', prepare: () => banner.scrollIntoView({ block: 'center' }), element: '[data-finish-walkthrough]', title: 'Ready for a real Quadrant', description: 'Exit practice to return to your untouched original workspace.' },
  ];
  let tour;
  const activate = (index) => {
    phases[index].prepare?.();
    document.body.dataset.walkthroughPhase = phases[index].name;
    const target = document.querySelector(phases[index].element);
    if (target && !target.matches('button,input,textarea,select,a,[tabindex]')) target.tabIndex = -1;
  };
  activate(0);
  tour = driver({
    showProgress: true,
    allowClose: false,
    nextBtnText: 'Next',
    doneBtnText: 'Finish',
    showButtons: ['next'],
    onPopoverRender: renderPracticeControls,
    steps: phases.map(({ element, title, description }) => ({ element, popover: { title, description } })),
    onNextClick: () => {
      const next = tour.getActiveIndex() + 1;
      if (next >= phases.length) return finishPractice();
      activate(next);
      setTimeout(() => tour.moveNext(), 40);
    },
  });
  tour.drive();
}

if (practice) {
  offer.hidden = true;
  replay.hidden = true;
  waitFrame(startPractice);
} else {
  replay.addEventListener('click', launchPractice);
  offer.querySelector('[data-start-tour]').addEventListener('click', launchPractice);
  offer.querySelector('[data-dismiss-tour]').addEventListener('click', () => {
    offer.hidden = true;
    localStorage.setItem(seenKey, '1');
  });
  offer.hidden = localStorage.getItem(seenKey) === '1';
}
