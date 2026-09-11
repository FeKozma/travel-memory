# Travel Memory

A tiny, self-hostable page for capturing a trip together: anyone with the link
can add a photo, a short caption, or both — and it builds into a shared
timeline, grouped by day.

Built for our Budapest trip, but the title is configurable so you can reuse
it for any trip.

## How it works

- Fully open — no login, no passcode. Anyone who has the link can post.
- Each submission is a name (optional), a short caption (optional), and an
  image (optional) — at least one of caption/image is required.
- Entries are stored as JSON on disk (`data/entries.json`); images are saved
  under `data/uploads/`. No external database needed.
- Basic hygiene, not a gate: uploads are limited to common image types, 8MB
  max per image, and requests are rate-limited per IP to blunt casual bots.

## Run locally

```bash
npm install
npm start
```

Visit http://localhost:3000

Set `TRIP_TITLE` and `PORT` via environment variables if you like:

```bash
PORT=4000 TRIP_TITLE="Our Budapest Trip" npm start
```

## Run with Docker

```bash
cp .env.example .env   # edit PORT / TRIP_TITLE as you like
docker compose up --build
```

The app listens on `PORT` (default 3000) both inside the container and on
the host, and data persists in `./data` on the host across restarts.

## API

- `GET /api/config` — `{ title }`
- `GET /api/entries` — all entries, oldest first
- `POST /api/entries` — multipart form: `name`, `caption`, `image`

## Notes

Since this is fully public with no moderation queue, anyone with the link can
post anything. Reasonable for sharing with a trusted group; if you expect the
link to circulate more widely, consider adding a shared passcode or an
approval step before entries go live.
