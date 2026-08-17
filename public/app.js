(function () {
  "use strict";

  let queue = [];
  let currentRating = 0;
  let dragging = false;
  let startX = 0;
  let dragX = 0;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const screens = {
    login: $("#screen-login"),
    servers: $("#screen-servers"),
    rating: $("#screen-rating"),
    loading: $("#screen-loading"),
  };

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  async function api(path, opts) {
    const res = await fetch(path, opts);
    return res.json();
  }

  async function checkStatus() {
    try {
      const data = await api("/api/status");
      if (!data.loggedIn) {
        showScreen("login");
        return false;
      }
      if (!data.server) {
        await loadServers();
        return false;
      }
      return true;
    } catch {
      showScreen("login");
      return false;
    }
  }

  async function doLogin() {
    try {
      const data = await api("/api/login");
      if (data.url) window.location.href = data.url;
    } catch {
      const err = $("#login-error");
      err.textContent = "Failed to connect to Plex. Try again.";
      err.classList.remove("hidden");
    }
  }

  async function loadServers() {
    showScreen("loading");
    try {
      const data = await api("/api/servers");
      const servers = data.servers || [];
      if (servers.length === 0) {
        showScreen("login");
        return;
      }
      if (servers.length === 1) {
        await selectServer(servers[0].machineIdentifier);
        return;
      }
      const list = $("#server-list");
      list.innerHTML = "";
      servers.forEach((s) => {
        const btn = document.createElement("button");
        btn.className = "server-btn";
        btn.textContent = s.name;
        btn.onclick = () => selectServer(s.machineIdentifier);
        list.appendChild(btn);
      });
      showScreen("servers");
    } catch {
      showScreen("login");
    }
  }

  async function selectServer(machineIdentifier) {
    showScreen("loading");
    try {
      await api("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machineIdentifier }),
      });
      await loadQueue();
    } catch {
      showScreen("login");
    }
  }

  async function loadQueue() {
    showScreen("loading");
    try {
      const data = await api("/api/queue");
      queue = data.movies || [];
      currentRating = 0;
      renderCard();
      showScreen("rating");
    } catch {
      showScreen("login");
    }
  }

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

    const movie = queue[0];
    const poster = $("#poster");
    const placeholder = $("#poster-placeholder");
    poster.classList.remove("loaded");
    poster.src = "/api/thumb?key=" + encodeURIComponent(movie.ratingKey);
    poster.onload = () => poster.classList.add("loaded");
    poster.onerror = () => { poster.src = ""; poster.classList.remove("loaded"); };
    placeholder.style.display = movie.thumb ? "none" : "flex";

    $("#card-title").textContent = movie.title + (movie.year ? " (" + movie.year + ")" : "");
    $("#card-meta").textContent = movie.summary ? "" : "";
    const synopsis = $("#card-synopsis");
    synopsis.textContent = movie.summary || "No synopsis available.";
    synopsis.style.display = movie.summary ? "" : "none";

    const d = new Date(movie.lastViewedAt * 1000);
    $("#card-date").textContent = "Watched " + d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

    currentRating = 0;
    renderStars();
    updateSaveButton();
    $("#count-num").textContent = queue.length;
  }

  function renderStars() {
    const container = $("#stars");
    container.innerHTML = "";
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
        path.setAttribute("fill", "url(#halffill-" + i + ")");
        path.setAttribute("stroke", "var(--accent)");
      } else {
        path.setAttribute("fill", "var(--accent-dim)");
        path.setAttribute("stroke", "var(--accent-dim)");
      }
      path.setAttribute("stroke-width", "1");
      path.setAttribute("stroke-linejoin", "round");
      svg.appendChild(path);

      if (half) {
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        grad.id = "halffill-" + i;
        const s1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        s1.setAttribute("offset", "50%");
        s1.setAttribute("stop-color", "var(--accent)");
        const s2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        s2.setAttribute("offset", "50%");
        s2.setAttribute("stop-color", "var(--accent-dim)");
        grad.appendChild(s1);
        grad.appendChild(s2);
        defs.appendChild(grad);
        svg.appendChild(defs);
      }

      wrap.appendChild(left);
      wrap.appendChild(right);
      wrap.appendChild(svg);
      container.appendChild(wrap);
    }
  }

  function setRating(val) {
    currentRating = currentRating === val ? 0 : val;
    renderStars();
    updateSaveButton();
  }

  function updateSaveButton() {
    $("#btn-save").disabled = currentRating === 0;
  }

  async function saveRating() {
    const movie = queue[0];
    if (!movie || currentRating === 0) return;
    try {
      await api("/api/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratingKey: movie.ratingKey, rating: currentRating }),
      });
      queue.shift();
      animateExit("exit-right");
    } catch {
      // keep card, user can retry
    }
  }

  function skipCard() {
    if (queue.length === 0) return;
    const movie = queue.shift();
    queue.push(movie);
    animateExit("exit-left");
  }

  function animateExit(cls) {
    const card = $("#card");
    card.classList.add(cls);
    setTimeout(() => renderCard(), 300);
  }

  // Swipe handling
  function initSwipe() {
    const card = $("#card");

    function onStart(x) {
      if (queue.length === 0) return;
      dragging = true;
      startX = x;
      dragX = 0;
      card.classList.add("dragging");
    }

    function onMove(x) {
      if (!dragging) return;
      dragX = x - startX;
      const rotate = dragX * 0.05;
      card.style.transform = "translateX(" + dragX + "px) rotate(" + rotate + "deg)";
      card.style.opacity = 1 - Math.abs(dragX) / 400;
    }

    function onEnd() {
      if (!dragging) return;
      dragging = false;
      card.classList.remove("dragging");

      if (Math.abs(dragX) > 80) {
        if (dragX > 0 && currentRating > 0) {
          saveRating();
        } else {
          skipCard();
        }
      } else {
        card.style.transform = "";
        card.style.opacity = "";
      }
      dragX = 0;
    }

    card.addEventListener("touchstart", (e) => onStart(e.touches[0].clientX), { passive: true });
    card.addEventListener("touchmove", (e) => onMove(e.touches[0].clientX), { passive: true });
    card.addEventListener("touchend", onEnd);

    card.addEventListener("mousedown", (e) => { e.preventDefault(); onStart(e.clientX); });
    document.addEventListener("mousemove", (e) => onMove(e.clientX));
    document.addEventListener("mouseup", onEnd);
  }

  // Keyboard support
  document.addEventListener("keydown", (e) => {
    if (!screens.rating.classList.contains("active")) return;
    if (e.key === "ArrowRight" || e.key === "d") {
      if (currentRating > 0) saveRating();
      else skipCard();
    }
    if (e.key === "ArrowLeft" || e.key === "a") skipCard();
    if (e.key >= "1" && e.key <= "9") setRating(parseInt(e.key));
    if (e.key === "0") setRating(0);
  });

  function init() {
    $("#btn-login").onclick = doLogin;
    $("#btn-logout-servers").onclick = async () => { await api("/api/logout", { method: "POST" }); showScreen("login"); };
    $("#btn-logout").onclick = async () => { await api("/api/logout", { method: "POST" }); showScreen("login"); };
    $("#btn-skip").onclick = skipCard;
    $("#btn-save").onclick = saveRating;
    $("#btn-reload").onclick = loadQueue;
    initSwipe();
    checkStatus();
  }

  init();
})();
