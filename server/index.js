const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const TRIP_TITLE = process.env.TRIP_TITLE || 'Travel Memory';
const UPLOAD_DIR = path.join(__dirname, '..', 'data', 'uploads');
const MAX_CAPTION_LENGTH = 500;
const MAX_NAME_LENGTH = 60;

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

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/api/config', (req, res) => {
  res.json({ title: TRIP_TITLE });
});

app.get('/api/entries', (req, res) => {
  const entries = db.readAll().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  res.json(entries);
});

app.post('/api/entries', submitLimiter, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      const message =
        err.message === 'UNSUPPORTED_FILE_TYPE'
          ? 'Only JPEG, PNG, GIF, or WEBP images are allowed.'
          : err.code === 'LIMIT_FILE_SIZE'
          ? 'Image is too large (max 8MB).'
          : 'Upload failed.';
      return res.status(400).json({ error: message });
    }

    const name = (req.body.name || '').trim().slice(0, MAX_NAME_LENGTH) || 'Anonymous';
    const caption = (req.body.caption || '').trim().slice(0, MAX_CAPTION_LENGTH);

    if (!caption && !req.file) {
      return res.status(400).json({ error: 'Add a photo, a caption, or both.' });
    }

    const entry = {
      id: crypto.randomUUID(),
      name,
      caption,
      imagePath: req.file ? `/uploads/${req.file.filename}` : null,
      createdAt: new Date().toISOString(),
    };

    try {
      await db.appendEntry(entry);
      res.status(201).json(entry);
    } catch {
      res.status(500).json({ error: 'Could not save entry.' });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Travel Memory ("${TRIP_TITLE}") listening on port ${PORT}`);
});
