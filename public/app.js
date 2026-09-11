const form = document.getElementById('entry-form');
const statusEl = document.getElementById('form-status');
const submitBtn = document.getElementById('submit-btn');
const timelineEl = document.getElementById('timeline');
const emptyStateEl = document.getElementById('empty-state');
const fileLabelText = document.getElementById('file-label-text');
const imageInput = document.getElementById('image');
const themeToggleBtn = document.getElementById('theme-toggle');
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
  themeToggleBtn.textContent = active === 'dark' ? '☀️' : '🌙';
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

// --- Comments: attached to their post, overlapping its corner ---
function closeAllCommentPanels() {
  document.querySelectorAll('.comment-panel.open').forEach((p) => p.classList.remove('open'));
}

document.addEventListener('click', (event) => {
  if (!event.target.closest('.comment-stack')) closeAllCommentPanels();
});

function buildCommentStack(entry) {
  if (!Array.isArray(entry.comments)) entry.comments = [];

  const wrap = document.createElement('div');
  wrap.className = 'comment-stack';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'comment-toggle';
  toggle.setAttribute('aria-label', 'View or add comments');
  wrap.appendChild(toggle);

  const panel = document.createElement('div');
  panel.className = 'comment-panel';

  const list = document.createElement('div');
  list.className = 'comment-list';
  panel.appendChild(list);

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
  panel.appendChild(form);

  wrap.appendChild(panel);

  function renderCount() {
    toggle.innerHTML = `💬 <span class="comment-count">${entry.comments.length}</span>`;
  }

  function renderComments() {
    list.innerHTML = '';
    if (!entry.comments.length) {
      const empty = document.createElement('p');
      empty.className = 'comment-empty';
      empty.textContent = 'No comments yet.';
      list.appendChild(empty);
      return;
    }
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

  toggle.addEventListener('click', () => {
    const wasOpen = panel.classList.contains('open');
    closeAllCommentPanels();
    if (!wasOpen) {
      renderComments();
      panel.classList.add('open');
      input.focus();
    }
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
      renderCount();
      renderComments();
    } catch {
      // Network error — leave the draft in place so they can retry.
    } finally {
      submit.disabled = false;
    }
  });

  renderCount();
  return wrap;
}

function buildDateHeading(entry, options) {
  const heading = document.createElement('h2');
  heading.className = 'date-heading';
  heading.textContent = formatDateHeading(entry.createdAt);
  if (options && options.pop) heading.classList.add('entry-added');
  return heading;
}

function buildEntryCard(entry, options) {
  const card = document.createElement('article');
  card.className = 'entry';
  card.dataset.id = entry.id;

  if (entry.imagePath) {
    const img = document.createElement('img');
    img.src = entry.imagePath;
    img.alt = entry.caption || 'Trip photo';
    img.loading = 'lazy';
    if (img.complete) {
      img.classList.add('loaded');
    } else {
      img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
    }
    card.appendChild(img);
  }

  if (entry.caption) {
    const caption = document.createElement('p');
    caption.className = 'entry-caption';
    caption.textContent = entry.caption;
    card.appendChild(caption);
  }

  const meta = document.createElement('p');
  meta.className = 'entry-meta';
  meta.textContent = `${entry.name} · ${formatTime(entry.createdAt)}`;
  card.appendChild(meta);

  card.appendChild(buildCommentStack(entry));

  if (options && options.pop && !prefersReducedMotion) {
    card.classList.add('entry-added');
  }

  return card;
}

function renderTimeline(entries) {
  timelineEl.innerHTML = '';
  lastRenderedDateKey = null;
  photoCount = entries.filter((entry) => entry.imagePath).length;
  updateDownloadButtonState();

  if (!entries.length) {
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.id = 'empty-state';
    p.textContent = "No memories yet — be the first to add one!";
    timelineEl.appendChild(p);
    return;
  }

  let staggerIndex = 0;

  for (const entry of entries) {
    const dateKey = new Date(entry.createdAt).toDateString();
    if (dateKey !== lastRenderedDateKey) {
      const heading = buildDateHeading(entry);
      observeReveal(heading, Math.min(staggerIndex * 60, 400));
      timelineEl.appendChild(heading);
      lastRenderedDateKey = dateKey;
      staggerIndex += 1;
    }

    const card = buildEntryCard(entry);
    observeReveal(card, Math.min(staggerIndex * 60, 400));
    timelineEl.appendChild(card);
    staggerIndex += 1;
  }
}

function appendNewEntry(entry) {
  // Incremental append (no full re-render) so existing cards aren't disturbed.
  const emptyState = document.getElementById('empty-state');
  if (emptyState) emptyState.remove();

  const dateKey = new Date(entry.createdAt).toDateString();
  let heading = null;
  if (dateKey !== lastRenderedDateKey) {
    heading = buildDateHeading(entry, { pop: true });
    timelineEl.appendChild(heading);
    lastRenderedDateKey = dateKey;
  }

  const card = buildEntryCard(entry, { pop: true });
  timelineEl.appendChild(card);

  if (entry.imagePath) {
    photoCount += 1;
    updateDownloadButtonState();
  }

  const scrollTarget = heading || card;
  scrollTarget.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });

  if (!prefersReducedMotion) {
    setTimeout(() => card.classList.add('entry-glow'), 450);
    setTimeout(() => {
      card.classList.remove('entry-added', 'entry-glow');
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

imageInput.addEventListener('change', () => {
  fileLabelText.textContent = imageInput.files[0]
    ? `📷 ${imageInput.files[0].name}`
    : '📷 Add a photo (optional)';
});

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
    fileLabelText.textContent = '📷 Add a photo (optional)';
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
