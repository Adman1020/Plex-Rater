const PLEX_TV = "https://plex.tv/api/v2";
const PRODUCT = "Plex-Rater";
const VERSION = "1.0.0";

function headers(clientId, extra) {
  return {
    "X-Plex-Client-Identifier": clientId,
    "X-Plex-Product": PRODUCT,
    "X-Plex-Version": VERSION,
    "X-Plex-Platform": "Web",
    Accept: "application/json",
    ...extra,
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

async function createPin(clientId, forwardUrl) {
  const res = await plexFetch(`${PLEX_TV}/pins`, {
    method: "POST",
    headers: headers(clientId, { "X-Plex-ForwardUrl": forwardUrl }),
  });
  const data = await res.json();
  return { id: data.id, code: data.code };
}

async function checkPin(clientId, pinId) {
  const res = await plexFetch(`${PLEX_TV}/pins/${pinId}`, {
    headers: headers(clientId),
  });
  const data = await res.json();
  return data.authToken || null;
}

async function getResources(authToken, clientId) {
  const res = await plexFetch(`${PLEX_TV}/resources`, {
    headers: headers(clientId, { "X-Plex-Token": authToken }),
  });
  const data = await res.json();
  const items = data.MediaContainer?.Metadata || [];
  return items
    .filter((m) => m.provides && m.provides.includes("server"))
    .map((m) => ({
      name: m.name,
      machineIdentifier: m.machineIdentifier,
      owned: !!m.owned,
      connections: (m.connections || []).map((c) => ({
        uri: c.uri,
        local: !!c.local,
        relay: !!c.relay,
      })),
    }));
}

async function testConnection(uri, authToken) {
  try {
    const res = await plexFetch(`${uri}/library/sections`, {
      headers: { "X-Plex-Token": authToken, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return !!(data.MediaContainer && data.MediaContainer.Metadata);
  } catch {
    return false;
  }
}

async function findWorkingConnection(connections, authToken) {
  const sorted = [...connections].sort((a, b) => {
    if (a.local && !b.local) return -1;
    if (!a.local && b.local) return 1;
    if (a.relay && !b.relay) return 1;
    if (!a.relay && b.relay) return -1;
    return 0;
  });
  for (const conn of sorted) {
    if (await testConnection(conn.uri, authToken)) return conn.uri;
  }
  throw new Error("No working connection found for server");
}

async function getMovieSections(serverUri, authToken) {
  const res = await plexFetch(`${serverUri}/library/sections`, {
    headers: { "X-Plex-Token": authToken, Accept: "application/json" },
  });
  const data = await res.json();
  return (data.MediaContainer?.Metadata || []).filter(
    (s) => s.type === "movie"
  );
}

async function getUnratedMovies(serverUri, authToken, sections) {
  const movies = [];
  for (const section of sections) {
    let start = 0;
    const size = 500;
    while (true) {
      const res = await plexFetch(
        `${serverUri}/library/sections/${section.key}/all?type=1&unwatched=0&X-Plex-Container-Start=${start}&X-Plex-Container-Size=${size}`,
        {
          headers: { "X-Plex-Token": authToken, Accept: "application/json" },
        }
      );
      const data = await res.json();
      const items = data.MediaContainer?.Metadata || [];
      for (const item of items) {
        if (item.lastViewedAt && !item.userRating) {
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
  checkPin,
  getResources,
  findWorkingConnection,
  getMovieSections,
  getUnratedMovies,
  rateMovie,
  getThumbStream,
  PRODUCT,
  VERSION,
};
