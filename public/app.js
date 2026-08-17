(function () {
  "use strict";

  let queue = [];
  let currentRating = 0;
  let dragging = false;
  let startX = 0;
  let dragX = 0;

  const $ = (s) => document.querySelector(s);

  function show(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(id).classList.add("active");
  }

  async function api(path, opts) {
    const res = await fetch(path, { credentials: "same-origin", ...opts });
    return res.json();
  }

  function showError(msg) {
    const el = $("#login-error");
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  // ── Login ──

  async function doConnect() {
    $("#login-step1").classList.add("hidden");
    $("#login-step2").classList.remove("hidden");
    try {
      const data = await api("/api/login");
      if (!data.url) throw new Error("No auth URL");
      $("#plex-link").href = data.url;
    } catch (e) {
      showError("Could not connect to Plex. " + e.message);
      $("#login-step1").classList.remove("hidden");
      $("#login-step2").classList.add("hidden");
    }
  }

  async function doComplete() {
    $("#login-step2").classList.add("hidden");
    $("#login-step3").classList.remove("hidden");
    try {
      const data = await api("/api/auth/complete");
      if (data.ok) {
        show("#screen-rating");
        loadQueue();
        return;
      }
      showError(data.error || "Login not complete — try authenticating on Plex first.");
    } catch (e) {
      showError("Connection failed. " + e.message);
    }
    $("#login-step3").classList.add("hidden");
    $("#login-step1").classList.remove("hidden");
  }

  // ── Queue ──

  async function loadQueue() {
    show("#screen-loading");
    try {
      const data = await api("/api/queue");
      queue = data.movies || [];
      $("#count-num").textContent = queue.length;
      $("#server-name").textContent = "";
      renderCard();
      show("#screen-rating");
    } catch {
      show("#screen-login");
      $("#login-step1").classList.remove("hidden");
      $("#login-step2").classList.add("hidden");
      $("#login-step3").classList.add("hidden");
      showError("Session expired — please log in again.");
    }
  }

  // ── Card ──

  function renderCard() {
    const card = $("#card");
    const empty = $("#empty-state");

    if (queue.length === 0) {
      card.classList.add("hidden");
      empty.classList.remove("hidden");
      $("#count-num").textContent = "0";
      return;
    }

    card.classList.remove("hidden", "exit-left", "exit-right", "dragging");
    card.style.transform = "";
    card.style.opacity = "";
    empty.classList.add("hidden");

    const m = queue[0];
    const poster = $("#poster");
    const placeholder = $("#poster-placeholder");
    poster.classList.remove("loaded");
    poster.src = "";
    placeholder.style.display = "flex";
    poster.src = "/api/thumb?key=" + encodeURIComponent(m.ratingKey);
    poster.onload = () => { poster.classList.add("loaded"); placeholder.style.display = "none"; };
    poster.onerror = () => { poster.src = ""; poster.classList.remove("loaded"); placeholder.style.display = "flex"; };

    $("#card-title").textContent = m.title + (m.year ? " (" + m.year + ")" : "");
    const syn = $("#card-synopsis");
    syn.textContent = m.summary || "No synopsis available.";
    syn.style.display = m.summary ? "" : "none";
    const d = new Date(m.lastViewedAt * 1000);
    $("#card-date").textContent = "Watched " + d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

    currentRating = 0;
    renderStars();
    $("#btn-save").disabled = true;
    $("#count-num").textContent = queue.length;
  }

  // ── Stars ──

  function renderStars() {
    const c = $("#stars");
    c.innerHTML = "";
    for (let i = 1; i <= 5; i++) {
      const wrap = document.createElement("div");
      wrap.className = "star-wrap";
      const left = document.createElement("div");
      left.className = "star-half left";
      left.onclick = (e) => { e.stopPropagation(); setRating(i * 2 - 1); };
      const right = document.createElement("div");
      right.className = "star-half right";
      right.onclick = (e) => { e.stopPropagation(); setRating(i * 2); };
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.classList.add("star-svg");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z");
      const filled = currentRating >= i * 2;
      const half = !filled && currentRating === i * 2 - 1;
      if (filled) {
        path.setAttribute("fill", "var(--accent)");
        path.setAttribute("stroke", "var(--accent)");
      } else if (half) {
        const id = "hf" + i;
        path.setAttribute("fill", "url(#" + id + ")");
        path.setAttribute("stroke", "var(--accent)");
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        const g = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        g.id = id;
        const s1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        s1.setAttribute("offset", "50%");
        s1.setAttribute("stop-color", "var(--accent)");
        const s2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        s2.setAttribute("offset", "50%");
        s2.setAttribute("stop-color", "var(--accent-dim)");
        g.appendChild(s1);
        g.appendChild(s2);
        defs.appendChild(g);
        svg.appendChild(defs);
      } else {
        path.setAttribute("fill", "var(--accent-dim)");
        path.setAttribute("stroke", "var(--accent-dim)");
      }
      path.setAttribute("stroke-width", "1");
      path.setAttribute("stroke-linejoin", "round");
      svg.appendChild(path);
      wrap.appendChild(left);
      wrap.appendChild(right);
      wrap.appendChild(svg);
      c.appendChild(wrap);
    }
  }

  function setRating(val) {
    currentRating = currentRating === val ? 0 : val;
    renderStars();
    $("#btn-save").disabled = currentRating === 0;
  }

  // ── Actions ──

  async function saveRating() {
    const m = queue[0];
    if (!m || currentRating === 0) return;
    try {
      await api("/api/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratingKey: m.ratingKey, rating: currentRating }),
      });
      queue.shift();
      animateExit("exit-right");
    } catch {}
  }

  function skipCard() {
    if (queue.length === 0) return;
    queue.push(queue.shift());
    animateExit("exit-left");
  }

  function animateExit(cls) {
    const card = $("#card");
    card.classList.add(cls);
    setTimeout(renderCard, 300);
  }

  // ── Swipe ──

  function initSwipe() {
    const card = $("#card");
    function onStart(x) { if (!queue.length) return; dragging = true; startX = x; dragX = 0; card.classList.add("dragging"); }
    function onMove(x) { if (!dragging) return; dragX = x - startX; card.style.transform = "translateX(" + dragX + "px) rotate(" + dragX * 0.05 + "deg)"; card.style.opacity = 1 - Math.abs(dragX) / 400; }
    function onEnd() {
      if (!dragging) return; dragging = false; card.classList.remove("dragging");
      if (Math.abs(dragX) > 80 && dragX > 0 && currentRating > 0) saveRating();
      else if (Math.abs(dragX) > 80) skipCard();
      else { card.style.transform = ""; card.style.opacity = ""; }
      dragX = 0;
    }
    card.addEventListener("touchstart", (e) => onStart(e.touches[0].clientX), { passive: true });
    card.addEventListener("touchmove", (e) => onMove(e.touches[0].clientX), { passive: true });
    card.addEventListener("touchend", onEnd);
    card.addEventListener("mousedown", (e) => { e.preventDefault(); onStart(e.clientX); });
    document.addEventListener("mousemove", (e) => onMove(e.clientX));
    document.addEventListener("mouseup", onEnd);
  }

  // ── Keyboard ──

  document.addEventListener("keydown", (e) => {
    if (!$("#screen-rating").classList.contains("active")) return;
    if (e.key === "ArrowRight" || e.key === "d") { if (currentRating > 0) saveRating(); else skipCard(); }
    if (e.key === "ArrowLeft" || e.key === "a") skipCard();
    if (e.key >= "1" && e.key <= "9") setRating(parseInt(e.key));
    if (e.key === "0") setRating(0);
  });

  // ── Init ──

  async function checkExisting() {
    try {
      const data = await api("/api/status");
      if (data.loggedIn) {
        show("#screen-rating");
        loadQueue();
        return;
      }
    } catch {}
    show("#screen-login");
  }

  $("#btn-connect").onclick = doConnect;
  $("#btn-complete").onclick = doComplete;
  $("#btn-logout").onclick = async () => {
    await api("/api/logout", { method: "POST" });
    $("#login-step1").classList.remove("hidden");
    $("#login-step2").classList.add("hidden");
    $("#login-step3").classList.add("hidden");
    show("#screen-login");
  };
  $("#btn-skip").onclick = skipCard;
  $("#btn-save").onclick = saveRating;
  $("#btn-reload").onclick = loadQueue;
  initSwipe();
  checkExisting();
})();
