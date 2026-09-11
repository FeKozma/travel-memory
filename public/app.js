const form = document.getElementById('entry-form');
const statusEl = document.getElementById('form-status');
const submitBtn = document.getElementById('submit-btn');
const timelineEl = document.getElementById('timeline');
const emptyStateEl = document.getElementById('empty-state');
const fileLabelText = document.getElementById('file-label-text');
const imageInput = document.getElementById('image');

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

function renderTimeline(entries) {
  timelineEl.innerHTML = '';

  if (!entries.length) {
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = 'No memories yet — be the first to add one!';
    timelineEl.appendChild(p);
    return;
  }

  let lastDateKey = null;

  for (const entry of entries) {
    const dateKey = new Date(entry.createdAt).toDateString();
    if (dateKey !== lastDateKey) {
      const heading = document.createElement('h2');
      heading.className = 'date-heading';
      heading.textContent = formatDateHeading(entry.createdAt);
      timelineEl.appendChild(heading);
      lastDateKey = dateKey;
    }

    const card = document.createElement('article');
    card.className = 'entry';

    if (entry.imagePath) {
      const img = document.createElement('img');
      img.src = entry.imagePath;
      img.alt = entry.caption || 'Trip photo';
      img.loading = 'lazy';
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

    timelineEl.appendChild(card);
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

    form.reset();
    fileLabelText.textContent = '📷 Add a photo (optional)';
    setStatus('Added to the timeline!', 'success');
    await loadEntries();
  } catch {
    setStatus('Network error — please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add to timeline';
  }
});

loadConfig();
loadEntries();
