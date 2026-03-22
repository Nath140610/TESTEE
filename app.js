const RADIUS_METERS = 30;
const WAIT_SECONDS = 120;

const stops = [
  { name: "Maison", lat: 49.6047, lon: 3.21337778 },
  { name: "AbecourtPont", lat: 49.59098333, lon: 3.18578056 },
  { name: "Pont du Canal", lat: 49.59001667, lon: 3.19259722 },
  { name: "Vere de Gaux", lat: 49.57979444, lon: 3.14275 },
  { name: "Gare de l'Oise", lat: 49.57846389, lon: 3.12063333 },
  { name: "Ecluse", lat: 49.57785278, lon: 3.11096111 },
];

const askLocation = document.getElementById("askLocation");
const locStatus = document.getElementById("locStatus");
const activeName = document.getElementById("activeName");
const nextStopLabel = document.getElementById("nextStopLabel");
const activeDistance = document.getElementById("activeDistance");
const activeHint = document.getElementById("activeHint");
const countdownEl = document.getElementById("countdown");
const radiusBadge = document.getElementById("radiusBadge");
const toast = document.getElementById("toast");
const nextBtn = document.getElementById("nextBtn");

let watchId = null;
let lastPosition = null;
let prevPosition = null;
let lastTimestamp = null;
let locationReady = false;
let activeStop = stops[0];
let timer = null;
let remaining = WAIT_SECONDS;
let inZone = false;
let autoSelected = false;

const passengerState = {
  Maison: { waiting: 3, boarding: 1, alighting: 0 },
  AbecourtPont: { waiting: 2, boarding: 0, alighting: 1 },
  "Pont du Canal": { waiting: 4, boarding: 2, alighting: 1 },
  "Vere de Gaux": { waiting: 1, boarding: 0, alighting: 0 },
  "Gare de l'Oise": { waiting: 5, boarding: 1, alighting: 2 },
  Ecluse: { waiting: 2, boarding: 1, alighting: 1 },
};

window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => document.body.classList.add("anim-ready"), 40);
  simulatePassengers();
});

askLocation.addEventListener("click", requestLocation);
nextBtn.addEventListener("click", () => setActiveStop(nextStop(activeStop)));

/* ----------------- Location ----------------- */
function updateStatus(text, tone = "muted") {
  locStatus.textContent = text;
  locStatus.className = `chip ${tone}`;
}

function requestLocation() {
  if (!("geolocation" in navigator)) {
    updateStatus("Géolocalisation non disponible", "danger");
    activeHint.textContent = "Votre navigateur ne fournit pas la localisation.";
    return;
  }
  updateStatus("Demande en cours…", "muted");
  askLocation.disabled = true;

  watchId = navigator.geolocation.watchPosition(
    onLocation,
    (err) => {
      const insecure = !window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1";
      if (err.code === 1 && insecure) {
        updateStatus("HTTPS requis sur iOS", "danger");
        activeHint.textContent = "iOS bloque la localisation en HTTP. Ouvrez en HTTPS ou via ngrok.";
      } else if (err.code === 1) {
        updateStatus("Autorisation refusée", "danger");
        activeHint.textContent = "Permission refusée. Dans Réglages > Safari > Localisation, autorisez ce site.";
      } else {
        updateStatus("Localisation indisponible", "danger");
        activeHint.textContent = err.message || "Impossible d'obtenir la localisation.";
      }
      askLocation.disabled = false;
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
  );
}

function onLocation(pos) {
  const { latitude, longitude, accuracy } = pos.coords;
  const now = pos.timestamp || Date.now();
  if (lastPosition) {
    prevPosition = lastPosition;
    lastTimestamp = lastPosition.timestamp || now;
  }
  lastPosition = { lat: latitude, lon: longitude, accuracy, timestamp: now };
  locationReady = true;

  updateStatus(`En ligne ±${Math.round(accuracy)} m`, "success");
  evaluateActiveStop();
  maybeAutoSelectNext();
  updateStats();
  renderPassengers(activeStop);
}

/* ----------------- Active stop ----------------- */
function setActiveStop(stop) {
  activeStop = stop;
  activeName.textContent = stop.name;
  activeHint.textContent = "Rapprochez-vous de l'arrêt puis restez 2:00.";
  nextStopLabel.textContent = `Prochain : ${nextStop(stop).name}`;
  resetTimer();
  evaluateActiveStop();
  renderStopsOverlay();
  renderPassengers(stop);
}

function evaluateActiveStop() {
  if (!activeStop || !lastPosition) return;

  const distance = haversine(lastPosition, activeStop);
  const inRadius = distance <= RADIUS_METERS;
  inZone = inRadius;

  activeDistance.textContent = `${Math.round(distance)} m`;
  radiusBadge.textContent = inRadius ? "Dans la zone" : "Hors zone";
  radiusBadge.style.color = inRadius ? "#0f172a" : "var(--muted)";
  radiusBadge.style.background = inRadius ? "var(--accent)" : "#fff1e6";

  if (inRadius) {
    startTimer();
    activeHint.textContent = "Ne bougez pas : compte à rebours en cours…";
  } else {
    resetTimer();
    activeHint.textContent = "Entrez dans le cercle de 30 m pour lancer le chrono.";
  }
}

function startTimer() {
  if (timer) return;
  timer = setInterval(() => {
    if (!inZone) {
      resetTimer();
      return;
    }
    remaining -= 1;
    renderCountdown();
    if (remaining <= 0) {
      clearInterval(timer);
      timer = null;
      const nxt = nextStop(activeStop);
      showToast(`Arrêt validé ✅ | Prochain : ${nxt.name}`);
      setActiveStop(nxt);
      activeHint.textContent = "Arrêt validé. Passage au suivant.";
    }
  }, 1000);
}

function resetTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  remaining = WAIT_SECONDS;
  renderCountdown();
}

function renderCountdown() {
  const m = String(Math.floor(remaining / 60)).padStart(2, "0");
  const s = String(remaining % 60).padStart(2, "0");
  countdownEl.textContent = `${m}:${s}`;
  const percent = ((WAIT_SECONDS - remaining) / WAIT_SECONDS) * 100;
  document.getElementById("progressTime").style.width = `${Math.min(100, percent)}%`;
}

function showToast(message = "Arrêt validé ✅") {
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 2600);
}

/* ----------------- Utils ----------------- */
function haversine(a, b) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const c =
    sinDLat * sinDLat +
    sinDLon * sinDLon * Math.cos(lat1) * Math.cos(lat2);
  const d = 2 * R * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
  return d;
}

const toRad = (deg) => (deg * Math.PI) / 180;

// Auto-sélection : si l'utilisateur est dans le rayon d'un arrêt,
// choisir automatiquement le suivant de la liste.
function maybeAutoSelectNext() {
  if (autoSelected || !locationReady) return;
  const nearIndex = stops.findIndex((s) => haversine(lastPosition, s) <= RADIUS_METERS);
  if (nearIndex === -1) return;
  const nextIndex = (nearIndex + 1) % stops.length;
  setActiveStop(stops[nextIndex]);
  autoSelected = true;
}

function warnIfInsecure() {
  const isSecure = window.isSecureContext || location.protocol === "https:";
  const isLocalhost = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!isSecure && !isLocalhost) {
    updateStatus("HTTPS requis sur iOS", "danger");
    activeHint.textContent = "Sur iPhone/iPad, la localisation est bloquée en HTTP. Ouvrez en HTTPS ou via ngrok.";
  }
}

function nextStop(stop) {
  const idx = stops.findIndex((s) => s.name === stop.name);
  if (idx === -1) return stops[0];
  return stops[(idx + 1) % stops.length];
}

function updateStats() {
  const accuracyEl = document.getElementById("statAccuracy");
  const speedEl = document.getElementById("statSpeed");
  const nextDistEl = document.getElementById("statNextDistance");
  if (!lastPosition) {
    accuracyEl.textContent = "— m";
    speedEl.textContent = "— km/h";
    nextDistEl.textContent = "— m";
    return;
  }

  accuracyEl.textContent = `${Math.round(lastPosition.accuracy || 0)} m`;

  if (lastTimestamp && prevPosition) {
    const dt = (lastPosition.timestamp - lastTimestamp) / 1000;
    if (dt > 0) {
      const d = haversine(prevPosition, lastPosition);
      const speed = (d / dt) * 3.6;
      speedEl.textContent = `${speed.toFixed(1)} km/h`;
    }
  } else {
    speedEl.textContent = "— km/h";
  }

  const nxt = nextStop(activeStop);
  const distNext = lastPosition ? Math.round(haversine(lastPosition, nxt)) : null;
  nextDistEl.textContent = distNext !== null ? `${distNext} m` : "— m";

  const distCurrent = lastPosition ? haversine(lastPosition, activeStop) : null;
  if (distCurrent !== null) {
    const clamp = Math.max(0, Math.min(1, (RADIUS_METERS - distCurrent) / RADIUS_METERS));
    document.getElementById("progressDist").style.width = `${clamp * 100}%`;
  }
}

function renderPassengers(stop) {
  const state = passengerState[stop.name] || { waiting: 0, boarding: 0, alighting: 0 };
  document.getElementById("paxWaiting").textContent = state.waiting;
  document.getElementById("paxBoarding").textContent = state.boarding;
  document.getElementById("paxAlighting").textContent = state.alighting;
}

function simulatePassengers() {
  setInterval(() => {
    Object.keys(passengerState).forEach((k) => {
      const s = passengerState[k];
      s.waiting = Math.max(0, Math.min(9, s.waiting + (Math.random() > 0.5 ? 1 : -1)));
      s.boarding = Math.max(0, Math.min(4, s.boarding + (Math.random() > 0.6 ? 1 : -1)));
      s.alighting = Math.max(0, Math.min(4, s.alighting + (Math.random() > 0.7 ? 1 : -1)));
    });
    renderPassengers(activeStop);
  }, 8000);
}

function renderStopsOverlay() {
  const container = document.getElementById("stopsOverlay");
  if (!container) return;
  container.innerHTML = "";
  stops.forEach((stop) => {
    const dist = lastPosition ? Math.round(haversine(lastPosition, stop)) : null;
    const div = document.createElement("div");
    div.className = "stop-card";
    div.innerHTML = `
      <div class="stop-meta">
        <p class="stop-name">${stop.name}</p>
        <p class="stop-coord">${stop.lat.toFixed(5)}, ${stop.lon.toFixed(5)}</p>
      </div>
      <div class="stop-dist">${dist !== null ? dist + " m" : "— m"}</div>
    `;
    div.onclick = () => setActiveStop(stop);
    container.appendChild(div);
  });
}

/* ----------------- Init ----------------- */
renderCountdown();
warnIfInsecure();
setActiveStop(activeStop);
