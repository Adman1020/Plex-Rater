# Plex-Rater

> **Vibe coded app.** This was built with AI assistance and hasn't been battle-tested. It works, but expect rough edges.

A dead-simple, mobile-first web app for rating your watched Plex movies. One film on screen at a time, swipe or tap to rate, and the rating is saved straight back to Plex. Run it, use it, close it.

## Features

- Plex PIN login (no passwords handled by the app)
- Card-stack UI with touch swipe + tap-to-rate
- 10-point star rating (half-star increments = Plex's 5-star scale)
- Poster art proxied through the backend (token never hits the browser)
- Deduplicates across multiple movie library sections

## Quick Start (Docker)

```sh
docker build -t plex-rater .
docker run -d -p 3000:3000 --name plex-rater plex-rater
```

Open `http://localhost:3000` on your phone or desktop.

### Docker Compose

```yaml
services:
  plex-rater:
    build: .
    ports:
      - "3000:3000"
    restart: unless-stopped
```

```sh
docker compose up -d
```

## Run Without Docker

```sh
npm install
npm start
```

## Environment Variables

All optional — everything works out of the box with sensible defaults.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |

## Development

```sh
git checkout development
npm install
npm start
```

## License

MIT
