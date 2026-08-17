const crypto = require("crypto");

function getClientId() {
  if (process.env.PLEX_CLIENT_IDENTIFIER) return process.env.PLEX_CLIENT_IDENTIFIER;
  if (!global._plexClientId) {
    global._plexClientId = "plex-rater-" + crypto.randomUUID();
  }
  return global._plexClientId;
}

function getBaseUrl(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/+$/, "");
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || `localhost:${process.env.PORT || 3000}`;
  return `${proto}://${host}`;
}

function getSessionSecret() {
  return process.env.COOKIE_SECRET || "plex-rater-dev-" + require("os").hostname();
}

module.exports = { getClientId, getBaseUrl, getSessionSecret };
