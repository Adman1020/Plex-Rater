const express = require("express");
const cookieSession = require("cookie-session");
const path = require("path");
const plex = require("./src/plex");
const { getClientId, getBaseUrl, getSessionSecret } = require("./src/session");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieSession({
  name: "plex_rater_session",
  keys: [getSessionSecret()],
  maxAge: 30 * 24 * 60 * 60 * 1000,
  sameSite: "lax",
  httpOnly: true,
}));

app.use(express.static(path.join(__dirname, "public")));

function requireAuth(req, res, next) {
  if (!req.session || !req.session.authToken) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

app.get("/api/login", async (req, res) => {
  try {
    const clientId = getClientId();
    const baseUrl = getBaseUrl(req);
    const forwardUrl = `${baseUrl}/api/login/callback`;
    const pin = await plex.createPin(clientId, forwardUrl);
    req.session.pendingPin = { id: pin.id, clientId };
    const authUrl = `https://app.plex.tv/auth#?clientID=${encodeURIComponent(clientId)}&code=${encodeURIComponent(pin.code)}&context[product]=${encodeURIComponent(plex.PRODUCT)}`;
    res.json({ url: authUrl });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Failed to create Plex login request" });
  }
});

app.get("/api/login/callback", async (req, res) => {
  try {
    const { pendingPin } = req.session || {};
    if (!pendingPin) return res.redirect("/?error=no_pin");
    const token = await plex.checkPin(pendingPin.clientId, pendingPin.id);
    if (!token) return res.redirect("/?error=no_token");
    req.session.authToken = token;
    req.session.clientId = pendingPin.clientId;
    delete req.session.pendingPin;
    res.redirect("/");
  } catch (err) {
    console.error("Callback error:", err.message);
    res.redirect("/?error=auth_failed");
  }
});

app.get("/api/servers", requireAuth, async (req, res) => {
  try {
    const servers = await plex.getResources(req.session.authToken, req.session.clientId);
    res.json({ servers });
  } catch (err) {
    console.error("Servers error:", err.message);
    res.status(500).json({ error: "Failed to fetch servers" });
  }
});

app.post("/api/server", requireAuth, async (req, res) => {
  try {
    const { machineIdentifier } = req.body;
    if (!machineIdentifier) return res.status(400).json({ error: "Missing machineIdentifier" });
    const servers = await plex.getResources(req.session.authToken, req.session.clientId);
    const server = servers.find((s) => s.machineIdentifier === machineIdentifier);
    if (!server) return res.status(404).json({ error: "Server not found" });
    if (!server.connections.length) return res.status(404).json({ error: "No connections for server" });
    const serverUri = await plex.findWorkingConnection(server.connections, req.session.authToken);
    req.session.server = { name: server.name, machineIdentifier, serverUri };
    res.json({ ok: true, name: server.name });
  } catch (err) {
    console.error("Server select error:", err.message);
    res.status(500).json({ error: "Failed to connect to server" });
  }
});

app.get("/api/queue", requireAuth, async (req, res) => {
  try {
    const { server } = req.session;
    if (!server || !server.serverUri) return res.status(400).json({ error: "No server selected" });
    const sections = await plex.getMovieSections(server.serverUri, req.session.authToken);
    const movies = await plex.getUnratedMovies(server.serverUri, req.session.authToken, sections);
    res.json({ movies, count: movies.length });
  } catch (err) {
    console.error("Queue error:", err.message);
    res.status(500).json({ error: "Failed to fetch movies" });
  }
});

app.post("/api/rate", requireAuth, async (req, res) => {
  try {
    const { server } = req.session;
    if (!server || !server.serverUri) return res.status(400).json({ error: "No server selected" });
    const { ratingKey, rating } = req.body;
    if (!ratingKey || typeof rating !== "number") {
      return res.status(400).json({ error: "Missing ratingKey or rating" });
    }
    await plex.rateMovie(server.serverUri, req.session.authToken, ratingKey, rating);
    res.json({ ok: true });
  } catch (err) {
    console.error("Rate error:", err.message);
    res.status(500).json({ error: "Failed to save rating" });
  }
});

app.get("/api/thumb", requireAuth, async (req, res) => {
  try {
    const { server } = req.session;
    if (!server || !server.serverUri) return res.status(400).end();
    const { key } = req.query;
    if (!key) return res.status(400).end();
    const thumbPath = `/library/metadata/${key}/thumb`;
    const upstream = await plex.getThumbStream(server.serverUri, req.session.authToken, thumbPath);
    res.set("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400");
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error("Thumb error:", err.message);
    res.status(404).end();
  }
});

app.post("/api/logout", (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get("/api/status", (req, res) => {
  const loggedIn = !!(req.session && req.session.authToken);
  const server = req.session?.server || null;
  res.json({ loggedIn, server });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Plex-Rater running on port ${PORT}`);
});
