// Minimal JSON-file backed store for timeline entries.
// No native dependencies (keeps the Docker image simple) — fine for the
// scale of a trip timeline. Writes are serialized through a queue so
// concurrent uploads can't corrupt the file.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'entries.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, '[]', 'utf8');
  }
}

function readAll() {
  ensureStore();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  let entries;
  try {
    entries = JSON.parse(raw);
  } catch {
    entries = [];
  }
  // Normalize older records that predate comments, and predate multi-photo
  // entries (which used a single `imagePath` instead of an `images` array).
  return entries.map((entry) => ({
    ...entry,
    comments: Array.isArray(entry.comments) ? entry.comments : [],
    images: Array.isArray(entry.images) ? entry.images : entry.imagePath ? [entry.imagePath] : [],
  }));
}

function writeAll(entries) {
  fs.writeFileSync(DB_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

// A queue that always keeps moving even if one task fails — each caller's
// own promise still reflects that task's real outcome (success or error),
// but a failure never wedges the chain for tasks queued after it.
let queue = Promise.resolve();

function enqueue(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}

function appendEntry(entry) {
  return enqueue(() => {
    const entries = readAll();
    entries.push(entry);
    writeAll(entries);
    return entry;
  });
}

function addComment(entryId, comment) {
  return enqueue(() => {
    const entries = readAll();
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) {
      const err = new Error('Entry not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    entry.comments.push(comment);
    writeAll(entries);
    return comment;
  });
}

function updateCaption(entryId, caption) {
  return enqueue(() => {
    const entries = readAll();
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) {
      const err = new Error('Entry not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
    entry.caption = caption;
    writeAll(entries);
    return entry;
  });
}

module.exports = { readAll, appendEntry, addComment, updateCaption };
