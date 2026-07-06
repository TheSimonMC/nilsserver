const DEFAULT_CONFIG = {
  address: "nilsserver.net",
  statusSource: "status.json",
  refreshMs: 30000,
  statusLabel: "Serverdaten",
  fallbackStatus: null,
};

const CONFIG = {
  ...DEFAULT_CONFIG,
  ...(window.NILSSERVER_CONFIG || {}),
};

const statusBar = document.querySelector("#serverStatus");
const statusText = document.querySelector("#statusText");
const playerCount = document.querySelector("#playerCount");
const statusUpdated = document.querySelector("#statusUpdated");
const statusSourceLabel = document.querySelector("#statusSourceLabel");
const toast = document.querySelector("#copyToast");

let statusTimer = null;
let toastTimer = null;

function setStatusState(state, message, players, updatedLabel) {
  statusBar.dataset.state = state;
  statusText.textContent = message;
  playerCount.textContent = players;
  statusUpdated.textContent = updatedLabel;
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function getPlayerNumbers(data) {
  const online = toNumber(data?.players?.online ?? data?.onlinePlayers ?? data?.playerCount ?? data?.playersOnline);
  const max = toNumber(data?.players?.max ?? data?.maxPlayers ?? data?.playerMax ?? data?.slots);
  return { online, max };
}

function formatPlayers(data) {
  const { online, max } = getPlayerNumbers(data);

  if (online !== null && max !== null) return `${online} / ${max}`;
  if (online !== null) return `${online} / —`;
  if (max !== null) return `— / ${max}`;
  return "— / —";
}

function formatTime(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function renderStatus(data) {
  if (!data || typeof data !== "object") {
    setStatusState("error", "Daten fehlen", "— / —", "—");
    return;
  }

  const players = formatPlayers(data);
  const updated = formatTime(data.updatedAt || data.checkedAt || data.lastUpdated || data.time);
  const { online, max } = getPlayerNumbers(data);
  const hasPlayers = online !== null || max !== null;

  if (data.online === true) {
    setStatusState("online", "Online", players, updated);
    return;
  }

  if (data.online === false) {
    setStatusState("offline", "Offline", hasPlayers ? players : "— / —", updated);
    return;
  }

  if (hasPlayers) {
    setStatusState("partial", "Spielerdaten", players, updated);
    return;
  }

  setStatusState("error", "Nicht gesetzt", "— / —", updated);
}

async function readStatusFile() {
  const source = CONFIG.statusSource;

  if (!source) {
    return CONFIG.fallbackStatus || window.NILSSERVER_STATUS || null;
  }

  const response = await fetch(`${source}${source.includes("?") ? "&" : "?"}t=${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function loadStatus() {
  try {
    const data = await readStatusFile();
    renderStatus(data);
  } catch (error) {
    const fallback = CONFIG.fallbackStatus || window.NILSSERVER_STATUS || null;
    if (fallback) {
      renderStatus(fallback);
      return;
    }

    setStatusState("error", "Daten nicht erreichbar", "— / —", "—");
  }
}

function startStatusLoop() {
  statusSourceLabel.textContent = CONFIG.statusLabel || "Serverdaten";
  setStatusState("loading", "Lädt Serverdaten …", "— / —", "—");
  loadStatus();

  statusTimer = window.setInterval(loadStatus, Math.max(10000, Number(CONFIG.refreshMs) || 30000));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadStatus();
  });
}

function setupCopyButtons() {
  document.querySelectorAll(".copy-address").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.dataset.copy || CONFIG.address || "nilsserver.net";
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        const input = document.createElement("input");
        input.value = value;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }

      toast.classList.add("is-visible");
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1600);
    });
  });
}

function setupModeImages() {
  document.querySelectorAll(".mode-image").forEach((image) => {
    const media = image.closest(".mode-media");

    image.addEventListener("load", () => {
      media.classList.add("has-image");
    });

    image.addEventListener("error", () => {
      image.remove();
      media.classList.add("media-fallback");
    });

    if (image.complete && image.naturalWidth > 0) {
      media.classList.add("has-image");
    }
  });
}

function setupReveals() {
  const elements = document.querySelectorAll(".reveal");

  if (!("IntersectionObserver" in window)) {
    elements.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14, rootMargin: "0px 0px -40px 0px" });

  elements.forEach((el) => observer.observe(el));
}

function setupPixelParticles() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const bg = document.querySelector(".site-bg");
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < 34; index += 1) {
    const pixel = document.createElement("span");
    pixel.className = "ambient-pixel";
    const size = 4 + Math.round(Math.random() * 8);
    pixel.style.cssText = `
      position:absolute;
      left:${Math.random() * 100}%;
      top:${Math.random() * 100}%;
      width:${size}px;
      height:${size}px;
      background:rgba(253,175,18,${0.16 + Math.random() * 0.22});
      border:1px solid rgba(125,36,4,.45);
      animation:pixelDrift ${8 + Math.random() * 12}s steps(6,end) infinite;
      animation-delay:${Math.random() * -12}s;
    `;
    fragment.appendChild(pixel);
  }

  bg.appendChild(fragment);

  const style = document.createElement("style");
  style.textContent = `
    @keyframes pixelDrift {
      0%, 100% { transform: translate3d(0,0,0); opacity: .2; }
      50% { transform: translate3d(18px,-28px,0); opacity: .75; }
    }
  `;
  document.head.appendChild(style);
}

startStatusLoop();
setupCopyButtons();
setupModeImages();
setupReveals();
setupPixelParticles();
