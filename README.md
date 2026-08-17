# Plex-Rater

A dead-simple, mobile-first web app for rating your watched Plex movies. One film on screen at a time, swipe or tap to rate, and the rating is saved straight back to Plex.

## Features

- Plex PIN login (no passwords handled by the app)
- Multiple Plex server support
- Card-stack UI with touch swipe + tap-to-rate
- 10-point star rating (half-star increments = Plex's 5-star scale)
- Unrated movie count
- Poster art proxied through the backend (token never hits the browser)

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `COOKIE_SECRET` | random | Signed session cookie secret — set a stable value in production |
| `PLEX_CLIENT_IDENTIFIER` | random per start | Persistent client identifier sent to Plex API |
| `BASE_URL` | auto-detected | Public URL (set behind Cloudflare tunnel, e.g. `https://rater.example.com`) |

## Deploy with Coolify

1. Push this repo to a GitHub repo (private recommended).
2. In Coolify, add a new Application → Dockerfile, point at this repo.
3. Set `PORT=3000`, `COOKIE_SECRET`, and `BASE_URL` in the environment.
4. Expose port 3000.

## Cloudflare Tunnel

Place a Cloudflare Tunnel in front for zero-trust email OTP access. The app itself only uses Plex login — no Cloudflare auth tokens are needed.

## Development

```sh
git checkout development
npm install
npm start
```

Open `http://localhost:3000` on your phone or desktop.
