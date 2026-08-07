import { driver } from '../vendor/driver.js.mjs';
import { rankingApp as app } from './app.js';
import { applyChoice, createSession } from './ranking.mjs';
import { addResponse, createCollection, decodeShareUrl, encodeResponseUrl } from './collaboration.mjs';

const seenKey = 'stack-rank:tour-seen:v2';
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

function completeSession(session, outcome) {
  let next = session;
  while (next.phase === 'comparing') next = applyChoice(next, outcome);
  return next;
}

function responseUrl(session, contributor) {
  return encodeResponseUrl(session, { contributor, baseUrl: new URL(location.pathname, location.origin).toString() });
}

function prepareSetup() {
  app.enterFacilitatorSetup();
  app.useExample();
  app.elements.criterion.value = 'Practice: expected impact';
  app.updateCount();
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
  app.session = completeSession(app.session, 'left');
  app.save();
  app.render();
}

function prepareCollection() {
  const firstSession = app.session;
  const setup = app.sharedArtifact.payload;
  const secondSession = completeSession(createSession(setup.criterion, setup.items.map(({ text }) => text).join('\n')), 'right');
  const firstUrl = responseUrl(firstSession, 'Practice participant A');
  const secondUrl = responseUrl(secondSession, 'Practice participant B');
  const first = decodeShareUrl(firstUrl);
  const second = decodeShareUrl(secondUrl);
  let collection = createCollection(first.setup);
  collection = addResponse(collection, first).collection;
  collection = addResponse(collection, second).collection;
  app.collection = collection;
  app.elements['response-links'].value = `${firstUrl}\n${secondUrl}`;
  app.enterCollection();
}

function startPractice() {
  offer.hidden = true;
  const banner = document.querySelector('[data-walkthrough-banner]') ?? makePracticeBanner();
  const phases = [
    { name: 'entry', element: '#mode-title', title: 'Start with the workflow', description: 'This practice run covers setup, participant ranking, collection, and disagreement.' },
    { name: 'setup', prepare: prepareSetup, element: '#setup-submit', title: 'Prepare the ranking setup', description: 'Define one criterion and the items participants will compare.' },
    { name: 'share', prepare: prepareShare, element: '#setup-share-panel', title: 'Share setup only', description: 'The setup link contains no comparisons, drafts, or progress.' },
    { name: 'invitation', prepare: prepareInvitation, element: '#start-response', title: 'Participant sees a read-only invitation', description: 'No local response exists until Start my response is chosen.' },
    { name: 'participantStart', prepare: prepareParticipantStart, element: '#left-button', title: 'Compare one pair at a time', description: 'Participants use the real choice controls and can record ties or uncertainty.' },
    { name: 'participantComplete', prepare: prepareParticipantComplete, element: '#copy-response-link', title: 'Return the completed ranking', description: 'Only the final grouped order enters the response link.' },
    { name: 'collection', prepare: prepareCollection, element: '#response-count', title: 'Collect completed rankings', description: 'Two immutable practice responses are now combined locally.' },
    { name: 'aggregate', element: '#consensus-list', title: 'Read the aggregate order', description: 'Average rank produces a summary order without replacing submitted rankings.' },
    { name: 'rankings', element: '#ranking-evidence', title: 'Keep every submitted ranking', description: 'Each participant order remains visible as evidence.' },
    { name: 'pairwise', element: '#disagreement-list', title: 'Inspect pairwise disagreement', description: 'Split bars show left-item votes, ties, and right-item votes.' },
    { name: 'finish', prepare: () => banner.scrollIntoView({ block: 'center' }), element: '[data-finish-walkthrough]', title: 'Ready for a real Stack Rank', description: 'Exit practice to return to your untouched original workspace.' },
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
  requestAnimationFrame(() => requestAnimationFrame(startPractice));
} else {
  replay.addEventListener('click', launchPractice);
  offer.querySelector('[data-start-tour]').addEventListener('click', launchPractice);
  offer.querySelector('[data-dismiss-tour]').addEventListener('click', () => {
    offer.hidden = true;
    localStorage.setItem(seenKey, '1');
  });
  offer.hidden = localStorage.getItem(seenKey) === '1';
}
