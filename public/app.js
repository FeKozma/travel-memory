const form = document.getElementById('entry-form');
const statusEl = document.getElementById('form-status');
const submitBtn = document.getElementById('submit-btn');
const timelineEl = document.getElementById('timeline');
const emptyStateEl = document.getElementById('empty-state');
const fileLabelText = document.getElementById('file-label-text');
const imageInput = document.getElementById('image');
const themeToggleBtn = document.getElementById('theme-toggle');
const themeToggleIcon = themeToggleBtn.querySelector('.icon-btn-icon');
const themeToggleLabel = themeToggleBtn.querySelector('.icon-btn-label');
const nameInput = document.getElementById('name');
const downloadAllBtn = document.getElementById('download-all');

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- Remember the visitor's name on this device, so they only type it once. ---
const NAME_STORAGE_KEY = 'travelMemoryName';

function getStoredName() {
  try {
    return localStorage.getItem(NAME_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function storeName(name) {
  try {
    if (name) localStorage.setItem(NAME_STORAGE_KEY, name);
  } catch {
    // Ignore storage errors (private browsing, etc.) — just won't be remembered.
  }
}

function prefillName() {
  const stored = getStoredName();
  if (stored) nameInput.value = stored;
}

// --- Theme: defaults to the system preference; the toggle sets an explicit
// override (persisted) that wins regardless of what the system does. ---
function getStoredTheme() {
  try {
    return localStorage.getItem('theme');
  } catch {
    return null;
  }
}

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getActiveTheme() {
  return document.documentElement.getAttribute('data-theme') || getSystemTheme();
}

function updateThemeToggleIcon() {
  const active = getActiveTheme();
  themeToggleIcon.textContent = active === 'dark' ? '☀️' : '🌙';
  themeToggleLabel.textContent = active === 'dark' ? 'Light mode' : 'Dark mode';
  themeToggleBtn.setAttribute(
    'aria-label',
    active === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  );
}

function applyTheme(theme) {
  if (theme) {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  try {
    if (theme) {
      localStorage.setItem('theme', theme);
    } else {
      localStorage.removeItem('theme');
    }
  } catch {
    // Ignore storage errors (private browsing, etc.) — theme just won't persist.
  }
  updateThemeToggleIcon();
}

themeToggleBtn.addEventListener('click', () => {
  applyTheme(getActiveTheme() === 'dark' ? 'light' : 'dark');
});

// If the visitor hasn't explicitly overridden, keep following the system live.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!getStoredTheme()) updateThemeToggleIcon();
});

updateThemeToggleIcon();

let lastRenderedDateKey = null;
let photoCount = 0;

// Photo-bearing entries posted within this many minutes of each other clump
// into one shared carousel. `activeCluster` tracks the trailing cluster so a
// freshly-submitted entry can extend it instead of starting a new card.
const CLUSTER_GAP_MS = 15 * 60 * 1000;
let activeCluster = null; // { entries, cardEl, trailingCommentEl } | null

function withinClusterGap(aIso, bIso) {
  return Math.abs(new Date(bIso) - new Date(aIso)) <= CLUSTER_GAP_MS;
}

function updateDownloadButtonState() {
  const enabled = photoCount > 0;
  downloadAllBtn.classList.toggle('disabled', !enabled);
  downloadAllBtn.setAttribute('aria-disabled', String(!enabled));
}

downloadAllBtn.addEventListener('click', (event) => {
  if (downloadAllBtn.classList.contains('disabled')) event.preventDefault();
});

const revealObserver = new IntersectionObserver(
  (observedEntries) => {
    for (const observed of observedEntries) {
      if (observed.isIntersecting) {
        observed.target.classList.add('in-view');
        revealObserver.unobserve(observed.target);
      }
    }
  },
  { threshold: 0.15 }
);

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = `status ${kind || ''}`.trim();
}

function formatDateHeading(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function observeReveal(el, delayMs) {
  if (prefersReducedMotion) return;
  el.classList.add('reveal');
  el.style.transitionDelay = `${delayMs}ms`;
  revealObserver.observe(el);
}

// --- Comments: always visible, anchored where the old toggle bubble sat.
// A sibling of the entry (not nested inside it) so its own height pushes
// whatever comes next further down the timeline.
function buildCommentBlock(entry) {
  if (!Array.isArray(entry.comments)) entry.comments = [];

  const block = document.createElement('div');
  block.className = 'comment-block';

  const emptyBubble = document.createElement('div');
  emptyBubble.className = 'comment-empty-bubble';
  emptyBubble.title = 'Add the first comment';
  block.appendChild(emptyBubble);

  const list = document.createElement('div');
  list.className = 'comment-list';
  block.appendChild(list);

  const form = document.createElement('form');
  form.className = 'comment-form';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Add a comment…';
  input.maxLength = 300;
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = '➤';
  submit.setAttribute('aria-label', 'Post comment');
  form.appendChild(input);
  form.appendChild(submit);
  block.appendChild(form);

  function render() {
    const hasComments = entry.comments.length > 0;

    emptyBubble.hidden = hasComments;
    emptyBubble.innerHTML = '💬';

    list.hidden = !hasComments;
    list.innerHTML = '';
    if (hasComments) {
      for (const comment of entry.comments) {
        const p = document.createElement('p');
        p.className = 'comment-item';
        const author = document.createElement('span');
        author.className = 'comment-author';
        author.textContent = `${comment.name}: `;
        p.appendChild(author);
        p.appendChild(document.createTextNode(comment.text));
        list.appendChild(p);
      }
      list.scrollTop = list.scrollHeight;
    }

    // With no comments yet, only the bubble shows; the form stays hidden
    // until it's clicked. Once there's at least one comment, the form
    // (and the thread) stays visible from then on.
    form.hidden = !hasComments;
  }

  emptyBubble.addEventListener('click', () => {
    emptyBubble.hidden = true;
    form.hidden = false;
    input.focus();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    submit.disabled = true;
    try {
      const res = await fetch(`/api/entries/${entry.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: getStoredName(), text }),
      });
      const data = await res.json();
      if (!res.ok) return;

      entry.comments.push(data);
      input.value = '';
      render();
    } catch {
      // Network error — leave the draft in place so they can retry.
    } finally {
      submit.disabled = false;
    }
  });

  render();
  return block;
}

function buildDateHeading(entry, options) {
  const heading = document.createElement('h2');
  heading.className = 'date-heading';
  heading.textContent = formatDateHeading(entry.createdAt);
  if (options && options.pop) heading.classList.add('entry-added');
  return heading;
}

function attachLoadFade(img) {
  if (img.complete) {
    img.classList.add('loaded');
  } else {
    img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
  }
}

// A single plain image, or — for 2+ photos — a swipeable carousel. Uses
// native horizontal scroll-snap so touch swipe (mobile) and the arrow
// buttons (any pointer) both just work, no drag-gesture code needed.
function buildImageArea(images) {
  if (!images.length) return null;

  if (images.length === 1) {
    const img = document.createElement('img');
    img.src = images[0].path;
    img.alt = images[0].alt;
    img.loading = 'lazy';
    attachLoadFade(img);
    return img;
  }

  const carousel = document.createElement('div');
  carousel.className = 'carousel';

  // The viewport wraps just the track + nav arrows, so the arrows center
  // on the image area itself rather than on the carousel+dots as a whole.
  const viewport = document.createElement('div');
  viewport.className = 'carousel-viewport';
  carousel.appendChild(viewport);

  const track = document.createElement('div');
  track.className = 'carousel-track';
  viewport.appendChild(track);

  for (const image of images) {
    const slide = document.createElement('div');
    slide.className = 'carousel-slide';
    const img = document.createElement('img');
    img.src = image.path;
    img.alt = image.alt;
    img.loading = 'lazy';
    attachLoadFade(img);
    slide.appendChild(img);
    track.appendChild(slide);
  }

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'carousel-nav carousel-prev';
  prevBtn.textContent = '‹';
  prevBtn.setAttribute('aria-label', 'Previous photo');

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'carousel-nav carousel-next';
  nextBtn.textContent = '›';
  nextBtn.setAttribute('aria-label', 'Next photo');

  viewport.appendChild(prevBtn);
  viewport.appendChild(nextBtn);

  const dotsWrap = document.createElement('div');
  dotsWrap.className = 'carousel-dots';
  const dots = images.map((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'carousel-dot';
    dot.setAttribute('aria-label', `Go to photo ${i + 1}`);
    dot.addEventListener('click', () => scrollToIndex(i));
    dotsWrap.appendChild(dot);
    return dot;
  });
  carousel.appendChild(dotsWrap);

  function currentIndex() {
    const slideWidth = track.clientWidth || 1;
    return Math.max(0, Math.min(images.length - 1, Math.round(track.scrollLeft / slideWidth)));
  }

  function updateDots() {
    const idx = currentIndex();
    dots.forEach((dot, i) => dot.classList.toggle('active', i === idx));
  }

  function scrollToIndex(i) {
    track.scrollTo({
      left: i * track.clientWidth,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }

  prevBtn.addEventListener('click', () => scrollToIndex(Math.max(0, currentIndex() - 1)));
  nextBtn.addEventListener('click', () => scrollToIndex(Math.min(images.length - 1, currentIndex() + 1)));
  track.addEventListener('scroll', () => window.requestAnimationFrame(updateDots));

  updateDots();
  return carousel;
}

// A "cluster" is 1+ entries rendered as one card: all their photos share a
// single image area up top, and each entry keeps its own caption/name/time
// beneath it. Every entry but the last also gets its own comment thread
// nested inline; the last entry's comment block is returned separately so
// the caller can attach it as the usual overlapping sibling after the card.
function buildClusterCard(clusterEntries, options) {
  const card = document.createElement('article');
  card.className = 'entry';
  card.dataset.ids = clusterEntries.map((entry) => entry.id).join(',');

  const images = [];
  for (const entry of clusterEntries) {
    for (const path of entry.images || []) {
      images.push({ path, alt: entry.caption || `${entry.name}'s photo` });
    }
  }
  const imageArea = buildImageArea(images);
  if (imageArea) card.appendChild(imageArea);

  clusterEntries.forEach((entry, index) => {
    const isLast = index === clusterEntries.length - 1;

    const textBlock = document.createElement('div');
    if (index > 0) textBlock.className = 'entry-text-block--divider';

    if (entry.caption) {
      const caption = document.createElement('p');
      caption.className = 'entry-caption';
      caption.textContent = entry.caption;
      textBlock.appendChild(caption);
    }

    const meta = document.createElement('p');
    meta.className = 'entry-meta';
    meta.textContent = `${entry.name} · ${formatTime(entry.createdAt)}`;
    textBlock.appendChild(meta);

    card.appendChild(textBlock);

    if (!isLast) {
      const inlineComments = buildCommentBlock(entry);
      inlineComments.classList.add('comment-block--inline');
      card.appendChild(inlineComments);
    }
  });

  if (options && options.pop && !prefersReducedMotion) {
    card.classList.add('entry-added');
  }

  return { card, lastEntry: clusterEntries[clusterEntries.length - 1] };
}

function hasImages(entry) {
  return Boolean(entry.images && entry.images.length);
}

// Renders one cluster (1+ entries): the shared card plus the trailing
// entry's comment block, appended to the timeline. Returns both elements
// so the caller can track/animate/scroll to them.
function flushCluster(clusterEntries, staggerIndexRef, options) {
  const { card, lastEntry } = buildClusterCard(clusterEntries, options);
  observeReveal(card, Math.min(staggerIndexRef.value * 60, 400));
  timelineEl.appendChild(card);
  staggerIndexRef.value += 1;

  const trailingCommentEl = buildCommentBlock(lastEntry);
  if (options && options.pop && !prefersReducedMotion) trailingCommentEl.classList.add('entry-added');
  observeReveal(trailingCommentEl, Math.min(staggerIndexRef.value * 60, 400));
  timelineEl.appendChild(trailingCommentEl);
  staggerIndexRef.value += 1;

  return { card, trailingCommentEl };
}

function renderTimeline(entries) {
  timelineEl.innerHTML = '';
  lastRenderedDateKey = null;
  activeCluster = null;
  photoCount = entries.reduce((sum, entry) => sum + (entry.images ? entry.images.length : 0), 0);
  updateDownloadButtonState();

  if (!entries.length) {
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.id = 'empty-state';
    p.textContent = "No memories yet — be the first to add one!";
    timelineEl.appendChild(p);
    return;
  }

  const staggerIndexRef = { value: 0 };
  let pendingCluster = [];

  function flushPending() {
    if (!pendingCluster.length) return;
    const { card, trailingCommentEl } = flushCluster(pendingCluster, staggerIndexRef);
    activeCluster = { entries: pendingCluster, cardEl: card, trailingCommentEl };
    pendingCluster = [];
  }

  for (const entry of entries) {
    const dateKey = new Date(entry.createdAt).toDateString();
    if (dateKey !== lastRenderedDateKey) {
      flushPending();
      activeCluster = null;
      const heading = buildDateHeading(entry);
      observeReveal(heading, Math.min(staggerIndexRef.value * 60, 400));
      timelineEl.appendChild(heading);
      staggerIndexRef.value += 1;
      lastRenderedDateKey = dateKey;
    }

    if (!hasImages(entry)) {
      flushPending();
      flushCluster([entry], staggerIndexRef);
      activeCluster = null; // a text-only post can't be extended into a cluster
      continue;
    }

    if (pendingCluster.length && withinClusterGap(pendingCluster[pendingCluster.length - 1].createdAt, entry.createdAt)) {
      pendingCluster.push(entry);
    } else {
      flushPending();
      pendingCluster = [entry];
    }
  }
  flushPending();
}

function appendNewEntry(entry) {
  // Incremental append (no full re-render) so existing cards aren't disturbed
  // — except when extending the trailing cluster, which needs its card
  // rebuilt to fold the new entry's photos/caption in.
  const emptyState = document.getElementById('empty-state');
  if (emptyState) emptyState.remove();

  const dateKey = new Date(entry.createdAt).toDateString();
  const dateChanged = dateKey !== lastRenderedDateKey;
  let heading = null;
  if (dateChanged) {
    heading = buildDateHeading(entry, { pop: true });
    timelineEl.appendChild(heading);
    lastRenderedDateKey = dateKey;
    activeCluster = null;
  }

  const canExtend =
    !dateChanged &&
    hasImages(entry) &&
    activeCluster &&
    withinClusterGap(activeCluster.entries[activeCluster.entries.length - 1].createdAt, entry.createdAt);

  let cardEl;
  let trailingCommentEl;

  if (canExtend) {
    activeCluster.cardEl.remove();
    activeCluster.trailingCommentEl.remove();
    const newEntries = [...activeCluster.entries, entry];
    const { card, lastEntry } = buildClusterCard(newEntries, { pop: true });
    timelineEl.appendChild(card);
    trailingCommentEl = buildCommentBlock(lastEntry);
    if (!prefersReducedMotion) trailingCommentEl.classList.add('entry-added');
    timelineEl.appendChild(trailingCommentEl);
    cardEl = card;
    activeCluster = { entries: newEntries, cardEl, trailingCommentEl };
  } else {
    const { card, lastEntry } = buildClusterCard([entry], { pop: true });
    timelineEl.appendChild(card);
    trailingCommentEl = buildCommentBlock(lastEntry);
    if (!prefersReducedMotion) trailingCommentEl.classList.add('entry-added');
    timelineEl.appendChild(trailingCommentEl);
    cardEl = card;
    activeCluster = hasImages(entry) ? { entries: [entry], cardEl, trailingCommentEl } : null;
  }

  if (entry.images && entry.images.length) {
    photoCount += entry.images.length;
    updateDownloadButtonState();
  }

  const scrollTarget = heading || cardEl;
  scrollTarget.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });

  if (!prefersReducedMotion) {
    setTimeout(() => cardEl.classList.add('entry-glow'), 450);
    setTimeout(() => {
      cardEl.classList.remove('entry-added', 'entry-glow');
      trailingCommentEl.classList.remove('entry-added');
      if (heading) heading.classList.remove('entry-added');
    }, 3300);
  }
}

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    document.title = config.title;
    document.getElementById('trip-title').textContent = config.title;
  } catch {
    // Keep defaults if config can't be loaded.
  }
}

async function loadEntries() {
  try {
    const res = await fetch('/api/entries');
    const entries = await res.json();
    renderTimeline(entries);
  } catch {
    emptyStateEl.textContent = 'Could not load the timeline. Try refreshing.';
  }
}

function updateFileLabel() {
  const count = imageInput.files.length;
  fileLabelText.textContent =
    count === 0
      ? '📷 Add photos (optional)'
      : count === 1
      ? `📷 ${imageInput.files[0].name}`
      : `📷 ${count} photos selected`;
}

imageInput.addEventListener('change', updateFileLabel);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('', '');

  const formData = new FormData(form);
  submitBtn.disabled = true;
  submitBtn.textContent = 'Adding…';

  try {
    const res = await fetch('/api/entries', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      setStatus(data.error || 'Something went wrong.', 'error');
      return;
    }

    storeName((formData.get('name') || '').trim());
    form.reset();
    prefillName();
    updateFileLabel();
    setStatus('Added to the timeline!', 'success');
    appendNewEntry(data);
  } catch {
    setStatus('Network error — please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add to timeline';
  }
});

prefillName();
loadConfig();
loadEntries();
