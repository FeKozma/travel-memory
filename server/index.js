const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const archiver = require('archiver');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const TRIP_TITLE = process.env.TRIP_TITLE || 'Travel Memory';
const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');
const MAX_CAPTION_LENGTH = 500;
const MAX_NAME_LENGTH = 60;
const MAX_COMMENT_LENGTH = 300;
const MAX_IMAGES_PER_ENTRY = 10;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();

// --- Uploads (images optional per entry) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('UNSUPPORTED_FILE_TYPE'));
    }
    cb(null, true);
  },
});

// Light rate limiting on submissions — this stays fully public/open,
// this just keeps a bot from hammering the disk with junk.
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads from this connection. Try again later.' },
});

// Zipping every photo is more expensive than a normal request, so this gets
// its own (stricter) limiter.
const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many download requests. Try again later.' },
});

// Comments are cheap (text-only), so this stays looser than uploads.
const commentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many comments from this connection. Try again later.' },
});

function slugify(text) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'travel-memory'
  );
}

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.json({ limit: '10kb' }));

app.get('/api/config', (req, res) => {
  res.json({ title: TRIP_TITLE });
});

app.get('/api/entries', (req, res) => {
  const entries = db.readAll().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  res.json(entries);
});

app.post('/api/entries', submitLimiter, (req, res) => {
  upload.array('images', MAX_IMAGES_PER_ENTRY)(req, res, async (err) => {
    if (err) {
      const message =
        err.message === 'UNSUPPORTED_FILE_TYPE'
          ? 'Only JPEG, PNG, GIF, or WEBP images are allowed.'
          : err.code === 'LIMIT_FILE_SIZE'
          ? 'Image is too large (max 8MB each).'
          : err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT'
          ? `Too many photos (max ${MAX_IMAGES_PER_ENTRY}).`
          : 'Upload failed.';
      return res.status(400).json({ error: message });
    }

    const name = (req.body.name || '').trim().slice(0, MAX_NAME_LENGTH) || 'Anonymous';
    const caption = (req.body.caption || '').trim().slice(0, MAX_CAPTION_LENGTH);
    const images = (req.files || []).map((file) => `/uploads/${file.filename}`);

    if (!caption && !images.length) {
      return res.status(400).json({ error: 'Add a photo, a caption, or both.' });
    }

    const entry = {
      id: crypto.randomUUID(),
      name,
      caption,
      images,
      createdAt: new Date().toISOString(),
      comments: [],
    };

    try {
      await db.appendEntry(entry);
      res.status(201).json(entry);
    } catch {
      res.status(500).json({ error: 'Could not save entry.' });
    }
  });
});

app.post('/api/entries/:id/comments', commentLimiter, async (req, res) => {
  const name = (req.body?.name || '').trim().slice(0, MAX_NAME_LENGTH) || 'Anonymous';
  const text = (req.body?.text || '').trim().slice(0, MAX_COMMENT_LENGTH);

  if (!text) {
    return res.status(400).json({ error: 'Comment text is required.' });
  }

  const comment = {
    id: crypto.randomUUID(),
    name,
    text,
    createdAt: new Date().toISOString(),
  };

  try {
    await db.addComment(req.params.id, comment);
    res.status(201).json(comment);
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'That post no longer exists.' });
    }
    res.status(500).json({ error: 'Could not save comment.' });
  }
});

app.get('/api/download-all', downloadLimiter, (req, res) => {
  let files;
  try {
    files = fs.readdirSync(UPLOAD_DIR).filter((f) => fs.statSync(path.join(UPLOAD_DIR, f)).isFile());
  } catch {
    files = [];
  }

  if (!files.length) {
    return res.status(404).json({ error: 'No photos to download yet.' });
  }

  res.attachment(`${slugify(TRIP_TITLE)}-photos.zip`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error('Zip error:', err);
    res.status(500).end();
  });

  archive.pipe(res);
  for (const file of files) {
    archive.file(path.join(UPLOAD_DIR, file), { name: file });
  }
  archive.finalize();
});

app.listen(PORT, () => {
  console.log(`Travel Memory ("${TRIP_TITLE}") listening on port ${PORT}`);
});
