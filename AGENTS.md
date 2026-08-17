# Plex-Rater

## Commands

- **Lint:** `npm run lint` (runs `node --check` on all JS files)
- **Start:** `npm start`
- **Install:** `npm ci`

## Notes

- Environment variable: `PORT` (default 3000)
- Environment variable: `COOKIE_SECRET` (defaults to a random secret per process start — set in production)
- Environment variable: `PLEX_CLIENT_IDENTIFIER` (optional — auto-generated per process if unset)
- Environment variable: `BASE_URL` (optional — auto-detected from Host header if unset; set this behind Cloudflare tunnel)
