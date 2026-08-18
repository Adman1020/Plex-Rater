# Plex-Rater

## Commands

- **Lint:** `npm run lint` (runs `node --check` on all JS files)
- **Start:** `npm start`
- **Install:** `npm ci`
- **Docker:** `docker build -t plex-rater . && docker run -d -p 3000:3000 plex-rater`

## Notes

- Environment variable: `PORT` (default 3000)
- Client ID and cookie secret are auto-generated per process — no config needed
