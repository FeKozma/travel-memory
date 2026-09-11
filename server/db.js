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
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

let writeQueue = Promise.resolve();

function appendEntry(entry) {
  writeQueue = writeQueue.then(() => {
    const entries = readAll();
    entries.push(entry);
    fs.writeFileSync(DB_FILE, JSON.stringify(entries, null, 2), 'utf8');
    return entry;
  });
  return writeQueue;
}

module.exports = { readAll, appendEntry };
