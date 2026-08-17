const express = require("express");
const crypto = require("crypto");
const path = require("path");
const plex = require("./src/plex");

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.PLEX_CLIENT_IDENTIFIER || "plex-rater-" + crypto.randomUUID();
const COOKIE_SECRET = process.env.COOKIE_SECRET || "plex-rater-" + crypto.randomUUID();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"), { maxAge: 0 }));

// Simple signed-cookie session using a single cookie
function getSession(req) {
  const raw = req.cookies?.pr_session;
  if (!raw) return {};
  try {
    const [payload, sig] = raw.split(".");
    const expected = crypto.createHmac("sha256", COOKIE_SECRET).update(payload).digest("base64url");
    if (sig !== expected) return {};
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch { return {}; }
}

function setSession(res, data) {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = crypto.createHmac("sha256", COOKIE_SECRET).update(payload).digest("base64url");
  res.cookie("pr_session", payload + "." + sig, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

// Parse cookies manually since we're not using cookie-parser
app.use((req, _res, next) => {
  req.cookies = {};
  const header = req.headers.cookie || "";
  for (const pair of header.split(";")) {
    const [k, ...v] = pair.trim().split("=");
    if (k) req.cookies[k] = v.join("=");
  }
  next();
});

function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session.authToken) return res.status(401).json({ error: "Not authenticated" });
  req.session = session;
  next();
}

// Step 1: Create PIN, return auth URL
app.get("/api/login", async (_req, res) => {
  try {
    const pin = await plex.createPin(CLIENT_ID);
    const url = plex.authUrl(CLIENT_ID, pin.code);
    setSession(res, { pinId: pin.id });
    res.json({ url });
  } catch (err) {
    console.error("Login create PIN error:", err.message);
    res.status(500).json({ error: "Failed to start login" });
  }
});

// Step 2: User comes back, clicks button → one atomic request does everything
app.get("/api/auth/complete", async (req, res) => {
  try {
    const session = getSession(req);
    if (!session.pinId) return res.json({ ok: false, error: "No pending login" });

    // Get auth token from Plex
    const authToken = await plex.getAuthToken(CLIENT_ID, session.pinId);
    if (!authToken) return res.json({ ok: false, error: "Not yet authenticated on Plex" });

    // Get servers
    const resources = await plex.getResources(authToken, CLIENT_ID);
    if (resources.length === 0) {
      return res.json({ ok: false, error: "No servers found" });
    }

    // Auto-select first server, find working connection
    const server = resources[0];
    let serverUri;
    try {
      serverUri = await plex.findWorkingConnection(server.connections || [], authToken);
    } catch {
      return res.json({ ok: false, error: "Could not connect to server" });
    }

    // Save everything to session
    setSession(res, {
      authToken,
      serverName: server.name,
      machineIdentifier: server.machineIdentifier,
      serverUri,
    });

    res.json({ ok: true, serverName: server.name });
  } catch (err) {
    console.error("Auth complete error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get unrated movies
app.get("/api/queue", requireAuth, async (req, res) => {
  try {
    const sections = await plex.getMovieSections(req.session.serverUri, req.session.authToken);
    const movies = await plex.getUnratedMovies(req.session.serverUri, req.session.authToken, sections);
    res.json({ movies, count: movies.length });
  } catch (err) {
    console.error("Queue error:", err.message);
    res.status(500).json({ error: "Failed to fetch movies" });
  }
});

// Rate a movie
app.post("/api/rate", requireAuth, async (req, res) => {
  try {
    const { ratingKey, rating } = req.body;
    if (!ratingKey || typeof rating !== "number") return res.status(400).json({ error: "Invalid params" });
    await plex.rateMovie(req.session.serverUri, req.session.authToken, ratingKey, rating);
    res.json({ ok: true });
  } catch (err) {
    console.error("Rate error:", err.message);
    res.status(500).json({ error: "Failed to save rating" });
  }
});

// Proxy poster images
app.get("/api/thumb", requireAuth, async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).end();
    const upstream = await plex.getThumbStream(req.session.serverUri, req.session.authToken, `/library/metadata/${key}/thumb`);
    res.set("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400");
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch { res.status(404).end(); }
});

// Status check
app.get("/api/status", (req, res) => {
  const session = getSession(req);
  if (session.authToken && session.serverUri) {
    res.json({ loggedIn: true, serverName: session.serverName });
  } else {
    res.json({ loggedIn: false });
  }
});

// Logout
app.post("/api/logout", (_req, res) => {
  setSession(res, {});
  res.json({ ok: true });
});

// Serve app
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Plex-Rater on port ${PORT} (client: ${CLIENT_ID})`);
});
