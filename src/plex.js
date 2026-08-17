const PLEX_TV = "https://plex.tv/api/v2";
const PRODUCT = "Plex-Rater";
const VERSION = "1.0.0";

function headers(clientId) {
  return {
    Accept: "application/json",
    "X-Plex-Client-Identifier": clientId,
    "X-Plex-Product": PRODUCT,
    "X-Plex-Version": VERSION,
    "X-Plex-Platform": "Web",
  };
}

async function plexFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Plex API ${res.status}: ${body}`);
  }
  return res;
}

async function createPin(clientId) {
  const res = await plexFetch(`${PLEX_TV}/pins.json?strong=true`, {
    method: "POST",
    headers: headers(clientId),
  });
  return res.json();
}

function authUrl(clientId, code) {
  return `https://app.plex.tv/auth#!?clientID=${encodeURIComponent(clientId)}&code=${encodeURIComponent(code)}`;
}

async function getAuthToken(clientId, pinId) {
  const res = await plexFetch(`${PLEX_TV}/pins/${pinId}.json`, {
    headers: headers(clientId),
  });
  const data = await res.json();
  return data.authToken || null;
}

async function getResources(authToken, clientId) {
  const res = await plexFetch(`${PLEX_TV}/resources`, {
    headers: { ...headers(clientId), "X-Plex-Token": authToken },
  });
  const data = await res.json();
  const items = Array.isArray(data) ? data : (data.MediaContainer?.Metadata || []);
  return items.filter((m) => {
    if (m.provides && m.provides.includes("server")) return true;
    if (m.product && m.product.toLowerCase().includes("plex media server")) return true;
    return false;
  });
}

async function findWorkingConnection(connections, authToken) {
  const sorted = [...connections].sort((a, b) => {
    if (!a.local && b.local) return -1;
    if (a.local && !b.local) return 1;
    if (a.relay && !b.relay) return 1;
    if (!a.relay && b.relay) return -1;
    return 0;
  });
  for (const conn of sorted) {
    try {
      const url = `${conn.uri}/library/sections?X-Plex-Token=${authToken}`;
      const res = await plexFetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      const sections = data.MediaContainer?.Directory || data.MediaContainer?.Metadata;
      if (sections) return conn.uri;
    } catch {}
  }
  throw new Error("No working connection found");
}

async function getMovieSections(serverUri, authToken) {
  const res = await plexFetch(`${serverUri}/library/sections`, {
    headers: { "X-Plex-Token": authToken, Accept: "application/json" },
  });
  const data = await res.json();
  return (data.MediaContainer?.Directory || data.MediaContainer?.Metadata || []).filter((s) => s.type === "movie");
}

async function getUnratedMovies(serverUri, authToken, sections) {
  const seen = new Set();
  const movies = [];
  for (const section of sections) {
    let start = 0;
    const size = 500;
    while (true) {
      const res = await plexFetch(
        `${serverUri}/library/sections/${section.key}/all?type=1&unwatched=0&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${size}`,
        { headers: { "X-Plex-Token": authToken, Accept: "application/json" } }
      );
      const data = await res.json();
      const items = data.MediaContainer?.Metadata || [];
      for (const item of items) {
        if (item.lastViewedAt && !item.userRating && !seen.has(item.ratingKey)) {
          seen.add(item.ratingKey);
          movies.push({
            ratingKey: item.ratingKey,
            title: item.title,
            year: item.year || null,
            summary: item.summary || "",
            lastViewedAt: item.lastViewedAt,
            thumb: item.thumb || null,
          });
        }
      }
      if (items.length < size) break;
      start += size;
    }
  }
  for (let i = movies.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [movies[i], movies[j]] = [movies[j], movies[i]];
  }
  return movies;
}

async function rateMovie(serverUri, authToken, ratingKey, rating) {
  const url = `${serverUri}/:/rate?key=${encodeURIComponent(ratingKey)}&rating=${rating}&identifier=com.plexapp.plugins.library`;
  const res = await plexFetch(url, {
    headers: { "X-Plex-Token": authToken, Accept: "application/json" },
  });
  return res.ok;
}

async function getThumbStream(serverUri, authToken, thumbPath) {
  const sep = thumbPath.includes("?") ? "&" : "?";
  return plexFetch(`${serverUri}${thumbPath}${sep}X-Plex-Token=${authToken}`, {
    redirect: "follow",
    signal: AbortSignal.timeout(10000),
  });
}

module.exports = {
  createPin,
  authUrl,
  getAuthToken,
  getResources,
  findWorkingConnection,
  getMovieSections,
  getUnratedMovies,
  rateMovie,
  getThumbStream,
  PRODUCT,
};
