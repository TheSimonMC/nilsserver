const STATUS_URL = window.NILSSERVER_STATUS_API || "/api/status";
const REFRESH_MS = 30000;

const statusBar = document.querySelector("#serverStatus");
const statusText = document.querySelector("#statusText");
const playerCount = document.querySelector("#playerCount");
const statusUpdated = document.querySelector("#statusUpdated");
const toast = document.querySelector("#copyToast");

let statusTimer = null;
let toastTimer = null;

function setStatusState(state, message, players, updatedLabel) {
  statusBar.dataset.state = state;
  statusText.textContent = message;
  playerCount.textContent = players;
  statusUpdated.textContent = updatedLabel;
}

function formatPlayers(data) {
  const online = data?.players?.online;
  const max = data?.players?.max;

  if (typeof online === "number" && typeof max === "number") return `${online} / ${max}`;
  if (typeof online === "number") return `${online} / —`;
  if (typeof max === "number") return `— / ${max}`;
  return "— / —";
}

function formatTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

async function loadStatus() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(STATUS_URL, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 404 && STATUS_URL === "/api/status") {
        setStatusState("error", "Backend fehlt", "— / —", "—");
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const updated = formatTime(data.checkedAt);

    if (data.online === true) {
      setStatusState("online", "Online", formatPlayers(data), updated);
      return;
    }

    setStatusState("offline", "Nicht erreichbar", "— / —", updated);
  } catch (error) {
    setStatusState("error", "Statusfehler", "— / —", "—");
  } finally {
    window.clearTimeout(timeout);
  }
}

function startStatusLoop() {
  setStatusState("loading", "Lädt Serverstatus …", "— / —", "—");
  loadStatus();
  statusTimer = window.setInterval(loadStatus, REFRESH_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadStatus();
  });
}

function setupCopyButtons() {
  document.querySelectorAll(".copy-address").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.dataset.copy || "nilsserver.net";
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
setupReveals();
setupPixelParticles();
