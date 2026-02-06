/*
  NavScope Web UI logic.
  Handles WebSocket updates, layout management, and chart/sky rendering.
*/
"use strict";

const el = (id) => document.getElementById(id);
const utcTime = el("utc-time");
const fixSummary = el("fix-summary");
const fixQuality = el("fix-quality");
const latlon = el("latlon");
const altitude = el("altitude");
const dopPdopFill = el("dop-pdop-fill");
const dopHdopFill = el("dop-hdop-fill");
const dopVdopFill = el("dop-vdop-fill");
const dopPdopValue = el("dop-pdop-value");
const dopHdopValue = el("dop-hdop-value");
const dopVdopValue = el("dop-vdop-value");
const countsEl = el("counts");
const snrCanvas = el("snr-canvas");
const snrAxis = el("snr-axis");
const snrChart = document.querySelector(".snr-chart");
const snrPlot = document.querySelector(".snr-plot");
const snrTooltip = el("snr-tooltip");
const snrModeToggle = el("snr-mode-toggle");
const snrKey = el("snr-key");
let snrHitTargets = [];
const healthBadge = el("health-badge");
const fixBadge = el("fix-badge");
const themeToggle = el("theme-toggle");
const canvas = el("sky-canvas");
const ctx = canvas.getContext("2d");
const skyWrap = document.querySelector(".sky-wrap");
const skyTooltip = el("sky-tooltip");
let skyHitTargets = [];
const workspace = el("workspace");
const panelToggles = document.querySelectorAll("[data-panel]");
const cardsMenuToggle = el("cards-menu-toggle");
const cardsMenu = el("cards-menu");
const viewsMenuToggle = el("views-menu-toggle");
const viewsMenu = el("views-menu");
const mapCanvas = el("map-canvas");
const mapModeToggle = el("map-mode-toggle");
const mapRotateToggle = el("map-rotate-toggle");
const mapVectorToggle = el("map-vector-toggle");
const altCanvas = el("alt-canvas");
const altDigital = el("alt-digital");
const altUnits = el("alt-units");
const altScale = el("alt-scale");
const altScaleUnits = el("alt-scale-units");
const altModeToggle = el("alt-mode-toggle");
const timeCanvas = el("time-canvas");
const timeDigital = el("time-digital");
const timeModeToggle = el("time-mode-toggle");
const timeZone = el("time-zone");
const speedCanvas = el("speed-canvas");
const speedDigital = el("speed-digital");
const speedUnits = el("speed-units");
const speedModeToggle = el("speed-mode-toggle");
const cogCanvas = el("cog-canvas");
const cogDigital = el("cog-digital");
const cogModeToggle = el("cog-mode-toggle");
const altWrap = document.querySelector(".alt-wrap");
const timeWrap = document.querySelector(".time-wrap");
const speedWrap = document.querySelector(".speed-wrap");
const speedFooter = document.querySelector(".speed-footer");
const cogWrap = document.querySelector(".cog-wrap");
const speedMaxInput = el("speed-max");
const filters = {
  gps: el("filter-gps"),
  glonass: el("filter-glonass"),
  galileo: el("filter-galileo"),
  beidou: el("filter-beidou"),
  sbas: el("filter-sbas"),
  tracked: el("filter-tracked"),
};
const counts = {
  gps: el("count-gps"),
  glonass: el("count-glonass"),
  galileo: el("count-galileo"),
  beidou: el("count-beidou"),
  sbas: el("count-sbas"),
};
const skyLayout = document.querySelector(".sky-layout");

let lastState = null;
let zCounter = 1;
const minPanelSize = { w: 180, h: 140 };
let snrCols = 6;
let mapFollow = true;
let snrMode = "bars";
const snrHistory = new Map();
const snrHistoryWindowMs = 60 * 1000;
const snrMaxLines = 12;
const layoutKeys = {
  current: "navscope-layout",
  savedDefault: "navscope-layout-saved",
  savedCustom1: "navscope-layout-custom1",
  savedCustom2: "navscope-layout-custom2",
  savedCustom3: "navscope-layout-custom3",
};
const startupLayoutKey = "navscope-startup-layout";

function migrateStorageKeys() {
  const pairs = [
    ["navscope-layout", "gpscommander-layout"],
    ["navscope-layout-saved", "gpscommander-layout-saved"],
    ["navscope-layout-custom1", "gpscommander-layout-custom1"],
    ["navscope-layout-custom2", "gpscommander-layout-custom2"],
    ["navscope-layout-custom3", "gpscommander-layout-custom3"],
    ["navscope-startup-layout", "gpscommander-startup-layout"],
    ["navscope-theme", "gpscommander-theme"],
    ["navscope-snr-mode", "gpscommander-snr-mode"],
    ["navscope-map-follow", "gpscommander-map-follow"],
    ["navscope-map-rotate", "gpscommander-map-rotate"],
    ["navscope-map-vector", "gpscommander-map-vector"],
    ["navscope-alt-units", "gpscommander-alt-units"],
    ["navscope-alt-mode", "gpscommander-alt-mode"],
    ["navscope-time-zone", "gpscommander-time-zone"],
    ["navscope-time-mode", "gpscommander-time-mode"],
    ["navscope-speed-units", "gpscommander-speed-units"],
    ["navscope-speed-max", "gpscommander-speed-max"],
    ["navscope-speed-mode", "gpscommander-speed-mode"],
    ["navscope-cog-mode", "gpscommander-cog-mode"],
  ];
  pairs.forEach(([nextKey, oldKey]) => {
    if (localStorage.getItem(nextKey) === null) {
      const legacyValue = localStorage.getItem(oldKey);
      if (legacyValue !== null) {
        localStorage.setItem(nextKey, legacyValue);
      }
    }
  });
}

migrateStorageKeys();
snrMode = localStorage.getItem("navscope-snr-mode") || "bars";

function themeColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

const defaultLayout = {
  "position-panel": { x: 0, y: 0, w: 380, h: 418, hidden: false, maximized: false, z: 717 },
  "sky-panel": { x: 669, y: 0, w: 728, h: 416, hidden: false, maximized: false, z: 741 },
  "snr-panel": { x: 0, y: 416, w: 499, h: 427, hidden: false, maximized: false, z: 752 },
  "map-panel": { x: 1397, y: 0, w: 470, h: 839, hidden: false, maximized: false, z: 755 },
  "alt-panel": { x: 499, y: 415, w: 294, h: 428, hidden: false, maximized: false, z: 751 },
  "time-panel": { x: 379, y: 0, w: 292, h: 417, hidden: false, maximized: false, z: 720 },
  "speed-panel": { x: 792, y: 416, w: 305, h: 425, hidden: false, maximized: false, z: 759 },
  "cog-panel": { x: 1098, y: 416, w: 301, h: 427, hidden: false, maximized: false, z: 744 },
};

function setTheme(theme) {
  // Persist theme preference across reloads.
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("navscope-theme", theme);
  themeToggle.textContent = theme === "night" ? "Night" : "Day";
}

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "night";
  setTheme(current === "night" ? "day" : "night");
});

setTheme(localStorage.getItem("navscope-theme") || "night");

function fmtCoord(value) {
  if (value === null || value === undefined) return "--";
  return value.toFixed(3);
}

function fmtAlt(value) {
  if (value === null || value === undefined) return "--";
  return `${value.toFixed(1)} m`;
}

function fmtDop(value) {
  if (value === null || value === undefined) return "--";
  return value.toFixed(2);
}

function fmtInt(value) {
  if (value === null || value === undefined) return "--";
  return Math.round(value).toString();
}

function formatUtcTime(value) {
  if (!value) return "--:--:--";
  if (typeof value === "string") {
    const digits = value.replace(/[^0-9]/g, "");
    if (digits.length >= 6) {
      const h = digits.slice(0, 2);
      const m = digits.slice(2, 4);
      const s = digits.slice(4, 6);
      return `${h}:${m}:${s}`;
    }
  }
  return "--:--:--";
}

function updateHealth(health) {
  const status = (health && health.status) || "STALE";
  healthBadge.textContent = status;
  healthBadge.classList.remove("live", "stale", "dead");
  healthBadge.classList.add(status.toLowerCase());
}

function updateFixBadge(state) {
  if (!fixBadge) return;
  const mode = state.fix?.mode;
  const modeText = mode === 1 ? "No fix" : mode === 2 ? "2D Fix" : mode === 3 ? "3D Fix" : "Fix";
  const linkStatus = state.health?.status || "STALE";
  if (linkStatus !== "LIVE") {
    fixBadge.textContent = linkStatus;
    fixBadge.classList.remove("good", "warn", "bad");
    fixBadge.classList.add(linkStatus === "DEAD" ? "bad" : "warn");
    return;
  }
  fixBadge.textContent = modeText;
  fixBadge.classList.remove("good", "warn", "bad");
  if (mode === 3) {
    fixBadge.classList.add("good");
  } else if (mode === 2) {
    fixBadge.classList.add("warn");
  } else {
    fixBadge.classList.add("bad");
  }
}

function updateCards(state) {
  if (utcTime) {
    utcTime.textContent = state.t_utc ? `UTC ${formatUtcTime(state.t_utc)}` : "UTC --";
  }
  const fixStatus = formatFixStatus(state.fix?.status, state.fix?.mode, state.fix?.quality);
  const linkStatus = state.health?.status || "STALE";
  const isLive = linkStatus === "LIVE";
  if (!isLive) {
    const linkColor = linkStatus === "DEAD" ? "var(--status-bad)" : "var(--status-warn)";
    if (fixSummary) {
      fixSummary.textContent = linkStatus;
      fixSummary.style.color = linkColor;
    }
    if (fixQuality) {
      fixQuality.textContent = linkStatus;
      fixQuality.style.color = linkColor;
    }
  } else {
    const modeColor = fixModeColor(state.fix?.mode);
    const statusColor = fixStatusColor(state.fix?.status);
    if (fixSummary) {
      fixSummary.innerHTML = `<span style="color:${modeColor}">${fixStatus.modeText}</span> | <span style="color:${statusColor}">${fixStatus.statusText}</span>`;
      fixSummary.style.color = "";
    }
    if (fixQuality) {
      fixQuality.textContent = fixStatus.qualityText;
      fixQuality.style.color = fixQualityColor(state.fix?.quality);
    }
  }
  latlon.textContent = `${fmtCoord(state.fix?.lat)}, ${fmtCoord(state.fix?.lon)}`;
  altitude.textContent = fmtAlt(state.fix?.alt_m);
  updateDopMeters(state.dop);
  countsEl.textContent = `${state.counts?.used ?? "--"} used / ${
    state.counts?.in_view ?? "--"
  } in view`;
}

function updateDopMeters(dopState) {
  const pdop = dopState?.pdop;
  const hdop = dopState?.hdop;
  const vdop = dopState?.vdop;
  setDopMeter(dopPdopFill, dopPdopValue, pdop);
  setDopMeter(dopHdopFill, dopHdopValue, hdop);
  setDopMeter(dopVdopFill, dopVdopValue, vdop);
}

function setDopMeter(fillEl, valueEl, dopValue) {
  if (!fillEl || !valueEl) return;
  if (dopValue === null || dopValue === undefined) {
    fillEl.style.width = "0%";
    valueEl.textContent = "--";
    return;
  }
  const capped = clamp(dopValue, 0, 10);
  fillEl.style.width = `${(capped / 10) * 100}%`;
  valueEl.textContent = dopValue.toFixed(1);
}

function formatFixStatus(status, mode, quality) {
  const statusMap = {
    A: "Valid",
    V: "No fix",
  };
  const modeMap = {
    1: "No fix",
    2: "2D",
    3: "3D",
  };
  const qualityMap = {
    0: "Invalid",
    1: "GPS",
    2: "DGPS",
    3: "PPS",
    4: "RTK",
    5: "Float RTK",
    6: "Estimated",
    7: "Manual",
    8: "Simulation",
  };
  const statusText = statusMap[status] || "Unknown";
  const modeText = modeMap[mode] || "Unknown";
  const qualityText = qualityMap[quality] || "Unknown";
  return { statusText, modeText, qualityText };
}

function fixModeColor(mode) {
  if (mode === 1) return "var(--status-bad)";
  if (mode === 2) return "var(--status-warn)";
  if (mode === 3) return "var(--status-good)";
  return "var(--muted)";
}

function fixStatusColor(status) {
  if (status === "A") return "var(--status-good)";
  if (status === "V") return "var(--status-bad)";
  return "var(--muted)";
}

function fixQualityColor(quality) {
  if (quality === 0) return "var(--status-bad)";
  if (quality === 1) return "var(--status-warn)";
  if (quality >= 2) return "var(--status-good)";
  return "var(--muted)";
}

let map = null;
let mapMarker = null;
let mapVector = null;
let mapVectorArrow = null;
let mapVectorMid = null;
let mapVectorMid2 = null;
let mapRotateMode = "north";
let mapVectorEnabled = true;

function initMap() {
  if (!mapCanvas || map) return;
  map = L.map(mapCanvas, { zoomControl: false, rotate: true, bearing: 0 }).setView([38.0, -97.0], 5);
  L.tileLayer("http://localhost:5000/tiles/{z}/{x}/{y}.png", {
    maxZoom: 17,
    attribution: "Map data: Ac OpenTopoMap contributors",
  }).addTo(map);
  mapMarker = L.circleMarker([38.0, -97.0], {
    radius: 6,
    color: "#4dd2ff",
    weight: 2,
    fillColor: "#4dd2ff",
    fillOpacity: 0.8,
  }).addTo(map);
  L.control.scale({ position: "bottomleft", metric: true, imperial: true }).addTo(map);
  mapVector = L.polyline(
    [
      [38.0, -97.0],
      [38.0, -97.0],
    ],
    { color: "#4dd2ff", weight: 2, opacity: 0.8 }
  ).addTo(map);
  mapVectorArrow = L.polygon(
    [
      [38.0, -97.0],
      [38.0, -97.0],
      [38.0, -97.0],
    ],
    { color: "#4dd2ff", weight: 1, fillColor: "#4dd2ff", fillOpacity: 0.9 }
  ).addTo(map);
  mapVectorMid = L.polyline(
    [
      [38.0, -97.0],
      [38.0, -97.0],
      [38.0, -97.0],
    ],
    { color: "#4dd2ff", weight: 2, opacity: 0.8 }
  ).addTo(map);
  mapVectorMid2 = L.polyline(
    [
      [38.0, -97.0],
      [38.0, -97.0],
      [38.0, -97.0],
    ],
    { color: "#4dd2ff", weight: 2, opacity: 0.8 }
  ).addTo(map);

  mapFollow = (localStorage.getItem("navscope-map-follow") || "true") === "true";
  mapRotateMode = localStorage.getItem("navscope-map-rotate") || "north";
  mapVectorEnabled = (localStorage.getItem("navscope-map-vector") || "true") === "true";
  if (mapModeToggle) {
    mapModeToggle.textContent = mapFollow ? "Centered" : "Free";
    mapModeToggle.addEventListener("click", () => {
      mapFollow = !mapFollow;
      localStorage.setItem("navscope-map-follow", mapFollow ? "true" : "false");
      mapModeToggle.textContent = mapFollow ? "Centered" : "Free";
      if (mapFollow && lastState) {
        updateMap(
          lastState.fix?.lat,
          lastState.fix?.lon,
          true,
          lastState.fix?.cog_deg,
          lastState.fix?.speed_knots
        );
      }
    });
  }
  if (mapRotateToggle) {
    const canRotate = typeof map.setBearing === "function";
    mapRotateToggle.disabled = !canRotate;
    mapRotateToggle.textContent = mapRotateMode === "cog" ? "COG Up" : "North Up";
    mapRotateToggle.addEventListener("click", () => {
      if (!canRotate) return;
      mapRotateMode = mapRotateMode === "cog" ? "north" : "cog";
      localStorage.setItem("navscope-map-rotate", mapRotateMode);
      mapRotateToggle.textContent = mapRotateMode === "cog" ? "COG Up" : "North Up";
      if (mapRotateMode === "north") {
        map.setBearing(0);
      } else if (lastState) {
        updateMap(
          lastState.fix?.lat,
          lastState.fix?.lon,
          true,
          lastState.fix?.cog_deg,
          lastState.fix?.speed_knots
        );
      }
    });
  }
  if (mapVectorToggle) {
    mapVectorToggle.textContent = mapVectorEnabled ? "Vector On" : "Vector Off";
    mapVectorToggle.addEventListener("click", () => {
      mapVectorEnabled = !mapVectorEnabled;
      localStorage.setItem("navscope-map-vector", mapVectorEnabled ? "true" : "false");
      mapVectorToggle.textContent = mapVectorEnabled ? "Vector On" : "Vector Off";
      if (!mapVectorEnabled) {
        const markerPos = mapMarker?.getLatLng() || [0, 0];
        mapVector?.setLatLngs([markerPos, markerPos]);
        mapVectorArrow?.setLatLngs([markerPos, markerPos, markerPos]);
        mapVectorMid?.setLatLngs([markerPos, markerPos, markerPos]);
        mapVectorMid2?.setLatLngs([markerPos, markerPos, markerPos]);
      }
    });
  }

  map.on("dragstart", () => {
    if (!mapFollow) return;
    mapFollow = false;
    localStorage.setItem("navscope-map-follow", "false");
    if (mapModeToggle) mapModeToggle.textContent = "Free";
  });
}

function updateMap(lat, lon, force, cogDeg, speedKnots) {
  if (!map) return;
  if (lat === null || lat === undefined || lon === null || lon === undefined) return;
  if (!mapFollow && !force) return;
  const pos = [lat, lon];
  mapMarker.setLatLng(pos);
  map.panTo(pos, { animate: false });
  const cogValid = speedKnots !== null && speedKnots !== undefined && speedKnots >= 0.5;
  if (mapRotateMode === "cog" && cogValid && typeof map.setBearing === "function") {
    const bearing = (360 - (cogDeg ?? 0)) % 360;
    map.setBearing(bearing);
  }
  if (mapVector) {
    if (mapVectorEnabled && cogValid && cogDeg !== null && cogDeg !== undefined) {
      const distanceMeters = speedKnots * 1852;
      const dest = destinationPoint(lat, lon, cogDeg, distanceMeters);
      const arrowLen = Math.min(Math.max(distanceMeters * 0.44, 1040), 2400);
      const arrowWidth = arrowLen * 0.9;
      mapVector.setLatLngs([pos, dest]);
      if (mapVectorArrow) {
        const baseCenter = destinationPoint(dest[0], dest[1], (cogDeg + 180) % 360, arrowLen);
        const left = destinationPoint(baseCenter[0], baseCenter[1], (cogDeg + 270) % 360, arrowWidth / 2);
        const right = destinationPoint(baseCenter[0], baseCenter[1], (cogDeg + 90) % 360, arrowWidth / 2);
        mapVectorArrow.setLatLngs([dest, left, right]);
      }
      if (mapVectorMid) {
        const mid = destinationPoint(lat, lon, cogDeg, distanceMeters * 0.5);
        const midLen = arrowLen;
        const midWidth = arrowWidth * 0.9;
        const midBase = destinationPoint(mid[0], mid[1], (cogDeg + 180) % 360, midLen);
        const midLeft = destinationPoint(midBase[0], midBase[1], (cogDeg + 270) % 360, midWidth / 2);
        const midRight = destinationPoint(midBase[0], midBase[1], (cogDeg + 90) % 360, midWidth / 2);
        const notchLen = midLen * 0.5;
        const notchWidth = midWidth * 0.6;
        const notchBase = destinationPoint(mid[0], mid[1], (cogDeg + 180) % 360, notchLen);
        const notchLeft = destinationPoint(notchBase[0], notchBase[1], (cogDeg + 270) % 360, notchWidth / 2);
        const notchRight = destinationPoint(notchBase[0], notchBase[1], (cogDeg + 90) % 360, notchWidth / 2);
        mapVectorMid.setLatLngs([midLeft, mid, midRight]);
        mapVectorMid2?.setLatLngs([notchLeft, mid, notchRight]);
      }
    } else {
      mapVector.setLatLngs([pos, pos]);
      if (mapVectorArrow) {
        mapVectorArrow.setLatLngs([pos, pos, pos]);
      }
      if (mapVectorMid) {
        mapVectorMid.setLatLngs([pos, pos, pos]);
      }
      if (mapVectorMid2) {
        mapVectorMid2.setLatLngs([pos, pos, pos]);
      }
    }
  }
}

function destinationPoint(lat, lon, bearingDeg, distanceMeters) {
  const radius = 6371000;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const dr = distanceMeters / radius;

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(bearing));
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(dr) * Math.cos(lat1),
      Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [(lat2 * 180) / Math.PI, ((lon2 * 180) / Math.PI + 540) % 360 - 180];
}

function renderSnr(sats) {
  // Build the SNR chart in the selected mode.
  updateSnrHistory(sats);
  if (snrMode === "history") {
    renderSnrHistory(sats);
    return;
  }
  const filtered = filterSats(sats);
  const sorted = [...filtered].sort((a, b) => (b.snr || -1) - (a.snr || -1));
  snrCols = Math.max(1, filtered.length);
  if (snrChart) {
    snrChart.style.setProperty("--snr-cols", snrCols);
    snrChart.classList.remove("history-mode");
  }
  if (snrKey) snrKey.innerHTML = "";
  const visible = sorted.slice(0, snrCols);
  drawSnrCanvas(visible);
}

function _snrCell(text) {
  const cell = document.createElement("div");
  cell.className = "cell";
  cell.textContent = text;
  return cell;
}

function constCode(gnssid) {
  switch ((gnssid || "").toUpperCase()) {
    case "GPS":
      return "G";
    case "GLONASS":
      return "R";
    case "GALILEO":
      return "E";
    case "BEIDOU":
      return "B";
    case "SBAS":
      return "S";
    default:
      return "U";
  }
}

function satKey(sat) {
  const gnss = (sat.gnssid || "GNSS").toUpperCase();
  const prn = sat.prn ?? "--";
  return `${gnss}-${prn}`;
}

function satLabel(sat) {
  return `${constCode(sat.gnssid)}${sat.prn ?? "--"}`;
}

function satBaseHue(gnssid) {
  switch ((gnssid || "").toUpperCase()) {
    case "GPS":
      return 200;
    case "GLONASS":
      return 145;
    case "GALILEO":
      return 40;
    case "BEIDOU":
      return 350;
    case "SBAS":
      return 275;
    default:
      return 210;
  }
}

function satLineColor(sat, alpha = 0.9) {
  const base = satBaseHue(sat.gnssid);
  const prn = Number.isFinite(sat.prn) ? sat.prn : 0;
  const hue = (base + (prn % 12) * 6) % 360;
  return `hsla(${hue}, 85%, 60%, ${alpha})`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateSnrHistory(sats) {
  const now = Date.now();
  const filtered = filterSats(sats);
  const seen = new Set();
  filtered.forEach((sat) => {
    const key = satKey(sat);
    seen.add(key);
    const entry = snrHistory.get(key) || {
      key,
      label: satLabel(sat),
      gnssid: sat.gnssid,
      prn: sat.prn,
      points: [],
      last: null,
    };
    entry.label = satLabel(sat);
    entry.gnssid = sat.gnssid;
    entry.prn = sat.prn;
    entry.last = { ...sat };
    entry.points.push({
      t: now,
      snr: Number.isFinite(sat.snr) ? sat.snr : 0,
      used: !!sat.used,
    });
    while (entry.points.length && entry.points[0].t < now - snrHistoryWindowMs) {
      entry.points.shift();
    }
    snrHistory.set(key, entry);
  });
  for (const [key, entry] of snrHistory.entries()) {
    if (!entry.points.length) {
      snrHistory.delete(key);
      continue;
    }
    const lastPoint = entry.points[entry.points.length - 1];
    if (lastPoint.t < now - snrHistoryWindowMs) {
      snrHistory.delete(key);
    } else if (!seen.has(key)) {
      entry.points = entry.points.filter((pt) => pt.t >= now - snrHistoryWindowMs);
    }
  }
}

function renderSnrKey(entries) {
  if (!snrKey) return;
  snrKey.innerHTML = "";
  entries.forEach((entry) => {
    const item = document.createElement("div");
    item.className = `snr-key-item${entry.used ? " used" : ""}`;
    const swatch = document.createElement("span");
    swatch.className = "snr-key-swatch";
    swatch.style.background = entry.color;
    const label = document.createElement("span");
    label.textContent = entry.label;
    item.appendChild(swatch);
    item.appendChild(label);
    snrKey.appendChild(item);
  });
}

function renderSnrHistory(sats) {
  if (!snrCanvas || !snrAxis || !snrChart) return;
  snrChart.classList.add("history-mode");

  const now = Date.now();
  const rect = snrCanvas.getBoundingClientRect();
  const axisRect = snrAxis.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = rect.width;
  const h = rect.height;
  snrCanvas.width = w * dpr;
  snrCanvas.height = h * dpr;
  snrAxis.width = axisRect.width * dpr;
  snrAxis.height = h * dpr;

  const ctx = snrCanvas.getContext("2d");
  const axisCtx = snrAxis.getContext("2d");
  if (!ctx || !axisCtx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  axisCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  axisCtx.clearRect(0, 0, axisRect.width, h);
  snrHitTargets = [];

  const padTop = 4;
  const padBottom = 18;
  const plotHeight = Math.max(2, h - padTop - padBottom);
  const maxDb = 50;
  const ticks = [0, 10, 20, 30, 40, 50];

  const snrGrid = themeColor("--snr-grid", "rgba(200, 220, 240, 0.06)");
  const snrAxisColor = themeColor("--snr-axis", "rgba(200, 220, 240, 0.6)");
  ctx.strokeStyle = snrGrid;
  ctx.lineWidth = 1;
  ticks.forEach((t) => {
    const y = padTop + (1 - t / maxDb) * plotHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  });

  axisCtx.fillStyle = snrAxisColor;
  axisCtx.font = "11px Bahnschrift";
  axisCtx.textAlign = "right";
  axisCtx.textBaseline = "middle";
  ticks.forEach((t) => {
    const y = padTop + (1 - t / maxDb) * plotHeight;
    axisCtx.fillText(`${t}`, axisRect.width - 6, y);
  });
  axisCtx.font = "10px Bahnschrift";
  axisCtx.textAlign = "left";
  axisCtx.textBaseline = "top";
  axisCtx.fillText("DB-HZ", 2, padTop + 2);

  const windowStart = now - snrHistoryWindowMs;
  const entries = Array.from(snrHistory.values())
    .filter((entry) => entry.points.length)
    .sort((a, b) => (b.points[b.points.length - 1]?.snr ?? 0) - (a.points[a.points.length - 1]?.snr ?? 0))
    .slice(0, snrMaxLines);

  const keyEntries = entries.map((entry) => {
    const lastPoint = entry.points[entry.points.length - 1];
    return {
      label: entry.label,
      used: lastPoint?.used ?? false,
      color: satLineColor(entry, lastPoint?.used ? 0.95 : 0.4),
    };
  });
  renderSnrKey(keyEntries);

  entries.forEach((entry) => {
    const lastPoint = entry.points[entry.points.length - 1];
    const used = lastPoint?.used ?? false;
    const stroke = satLineColor(entry, used ? 0.95 : 0.4);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = used ? 1.7 : 1.1;
    ctx.beginPath();
    entry.points.forEach((pt, idx) => {
      const x = ((pt.t - windowStart) / snrHistoryWindowMs) * w;
      const snrValue = Math.max(0, Math.min(maxDb, pt.snr ?? 0));
      const y = padTop + (1 - snrValue / maxDb) * plotHeight;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      snrHitTargets.push({
        x: x - 4,
        y: y - 4,
        w: 8,
        h: 8,
        sat: { ...(entry.last || {}), snr: pt.snr, used: pt.used },
      });
    });
    ctx.stroke();
  });

  ctx.fillStyle = snrAxisColor;
  ctx.font = "10px Bahnschrift";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText("Now", w - 4, h - padBottom + 2);
  ctx.textAlign = "left";
  ctx.fillText("-60s", 4, h - padBottom + 2);
}

function filterSats(sats) {
  const allow = {
    gps: filters.gps?.checked ?? true,
    glonass: filters.glonass?.checked ?? true,
    galileo: filters.galileo?.checked ?? true,
    beidou: filters.beidou?.checked ?? true,
    sbas: filters.sbas?.checked ?? true,
  };
  const showUntracked = filters.tracked?.checked ?? true;

  return sats.filter((sat) => {
    const key = (sat.gnssid || "GNSS").toLowerCase();
    if (key.includes("gps") && !allow.gps) return false;
    if (key.includes("glonass") && !allow.glonass) return false;
    if (key.includes("galileo") && !allow.galileo) return false;
    if (key.includes("beidou") && !allow.beidou) return false;
    if (key.includes("sbas") && !allow.sbas) return false;
    if (!showUntracked && (!sat.snr || sat.snr <= 0)) return false;
    return true;
  });
}

function updateConstellationCounts(sats) {
  const byConst = {
    gps: { used: 0, total: 0 },
    glonass: { used: 0, total: 0 },
    galileo: { used: 0, total: 0 },
    beidou: { used: 0, total: 0 },
    sbas: { used: 0, total: 0 },
  };
  sats.forEach((sat) => {
    const key = (sat.gnssid || "").toLowerCase();
    if (key.includes("gps")) {
      byConst.gps.total += 1;
      if (sat.used) byConst.gps.used += 1;
    } else if (key.includes("glonass")) {
      byConst.glonass.total += 1;
      if (sat.used) byConst.glonass.used += 1;
    } else if (key.includes("galileo")) {
      byConst.galileo.total += 1;
      if (sat.used) byConst.galileo.used += 1;
    } else if (key.includes("beidou")) {
      byConst.beidou.total += 1;
      if (sat.used) byConst.beidou.used += 1;
    } else if (key.includes("sbas")) {
      byConst.sbas.total += 1;
      if (sat.used) byConst.sbas.used += 1;
    }
  });
  Object.entries(byConst).forEach(([key, value]) => {
    if (counts[key]) {
      counts[key].textContent = `${value.used}/${value.total}`;
    }
  });
}

function loadLayout() {
  try {
    const raw = localStorage.getItem(layoutKeys.current);
    if (!raw) return { ...defaultLayout };
    const stored = JSON.parse(raw);
    return { ...defaultLayout, ...stored };
  } catch {
    return { ...defaultLayout };
  }
}

function saveLayout(layout) {
  localStorage.setItem(layoutKeys.current, JSON.stringify(layout));
}

function layoutKeyForSlot(slot) {
  switch (slot) {
    case "custom1":
      return layoutKeys.savedCustom1;
    case "custom2":
      return layoutKeys.savedCustom2;
    case "custom3":
      return layoutKeys.savedCustom3;
    default:
      return layoutKeys.savedDefault;
  }
}

function loadSavedLayout(slot = "default") {
  try {
    const raw = localStorage.getItem(layoutKeyForSlot(slot));
    if (!raw) return null;
    const stored = JSON.parse(raw);
    return { ...defaultLayout, ...stored };
  } catch {
    return null;
  }
}

function saveSavedLayout(layout, slot = "default") {
  localStorage.setItem(layoutKeyForSlot(slot), JSON.stringify(layout));
}

function anyPanelVisible(layout) {
  return Object.values(layout).some((cfg) => !cfg.hidden);
}

function layoutBounds(layout) {
  let maxX = 0;
  let maxY = 0;
  Object.values(layout).forEach((cfg) => {
    if (!cfg || cfg.hidden || cfg.maximized) return;
    maxX = Math.max(maxX, (cfg.x ?? 0) + (cfg.w ?? 0));
    maxY = Math.max(maxY, (cfg.y ?? 0) + (cfg.h ?? 0));
  });
  return { w: maxX, h: maxY };
}

function scaleLayoutToFit(layout, rect) {
  const bounds = layoutBounds(layout);
  const scale = Math.min(rect.width / (bounds.w || 1), rect.height / (bounds.h || 1), 1);
  if (scale >= 0.999) return { ...layout };
  const scaled = {};
  Object.entries(layout).forEach(([id, cfg]) => {
    if (!cfg) return;
    if (cfg.maximized) {
      scaled[id] = { ...cfg };
      return;
    }
    scaled[id] = {
      ...cfg,
      x: Math.round((cfg.x ?? 0) * scale),
      y: Math.round((cfg.y ?? 0) * scale),
      w: Math.max(minPanelSize.w, Math.round((cfg.w ?? minPanelSize.w) * scale)),
      h: Math.max(minPanelSize.h, Math.round((cfg.h ?? minPanelSize.h) * scale)),
    };
  });
  return scaled;
}

function looksLikeAutoCascade(layout) {
  const ids = Object.keys(layout).filter((id) => !layout[id]?.hidden);
  if (ids.length < 3) return false;
  const first = layout[ids[0]];
  if (!first || first.maximized) return false;
  const baseW = Math.round(first.w ?? 0);
  const baseH = Math.round(first.h ?? 0);
  let prev = null;
  for (let i = 0; i < Math.min(ids.length, 3); i += 1) {
    const cfg = layout[ids[i]];
    if (!cfg || cfg.maximized) return false;
    if (Math.round(cfg.w ?? 0) !== baseW || Math.round(cfg.h ?? 0) !== baseH) return false;
    const x = Math.round(cfg.x ?? 0);
    const y = Math.round(cfg.y ?? 0);
    if (x !== y || x % 30 !== 0) return false;
    if (prev !== null && x !== prev + 30) return false;
    prev = x;
  }
  return true;
}

function normalizeLayout(layout, minSize = minPanelSize) {
  const rect = workspace.getBoundingClientRect();
  const normalized = {};
  Object.entries(layout).forEach(([id, cfg]) => {
    if (cfg.maximized) {
      normalized[id] = { ...cfg, x: 0, y: 0, w: rect.width, h: rect.height };
    } else {
      const w = clamp(cfg.w, minSize.w, rect.width);
      const h = clamp(cfg.h, minSize.h, rect.height);
      const x = clamp(cfg.x, 0, Math.max(0, rect.width - w));
      const y = clamp(cfg.y, 0, Math.max(0, rect.height - h));
      normalized[id] = { ...cfg, x, y, w, h };
    }
  });
  return normalized;
}

function applyLayout(layout) {
  Object.entries(layout).forEach(([id, cfg]) => {
    const panel = document.getElementById(id);
    if (!panel) return;
    if (cfg.maximized) {
      panel.style.left = "0px";
      panel.style.top = "0px";
      panel.style.width = "100%";
      panel.style.height = "100%";
    } else {
      panel.style.left = `${cfg.x}px`;
      panel.style.top = `${cfg.y}px`;
      panel.style.width = `${cfg.w}px`;
      panel.style.height = `${cfg.h}px`;
    }
    panel.classList.toggle("hidden", !!cfg.hidden);
    panel.classList.toggle("maximized", !!cfg.maximized);
    const maxBtn = panel.querySelector('[data-action="maximize"]');
    if (maxBtn) {
      maxBtn.classList.toggle("is-maximized", !!cfg.maximized);
      maxBtn.setAttribute("aria-pressed", cfg.maximized ? "true" : "false");
      maxBtn.setAttribute("title", cfg.maximized ? "Restore" : "Maximize");
    }
    const z = cfg.z ?? parseInt(panel.style.zIndex || "1", 10);
    panel.style.zIndex = `${z}`;
    zCounter = Math.max(zCounter, z);
  });
  panelToggles.forEach((toggle) => {
    const target = toggle.dataset.panel;
    const hidden = layout[target]?.hidden;
    if (toggle instanceof HTMLInputElement && toggle.type === "checkbox") {
      toggle.checked = !hidden;
    } else {
      toggle.classList.toggle("active", !hidden);
    }
  });

  if (lastState) {
    requestAnimationFrame(() => {
      const altVisible = layout["alt-panel"] && !layout["alt-panel"].hidden;
      const timeVisible = layout["time-panel"] && !layout["time-panel"].hidden;
      const speedVisible = layout["speed-panel"] && !layout["speed-panel"].hidden;
      const cogVisible = layout["cog-panel"] && !layout["cog-panel"].hidden;
      if (altVisible) drawAltimeter(lastState.fix?.alt_m);
      if (timeVisible) drawClock(lastState.t_utc);
      if (speedVisible) drawSpeedometer(lastState.fix?.speed_knots);
      if (cogVisible) drawCog(lastState.fix?.cog_deg, lastState.fix?.speed_knots);
    });
  }
}

function updateLayout(id, next) {
  const layout = normalizeLayout(loadLayout());
  if (Object.prototype.hasOwnProperty.call(next, "hidden") && next.hidden === false) {
    zCounter += 1;
    layout[id] = { ...layout[id], ...next, z: zCounter };
  } else {
    layout[id] = { ...layout[id], ...next };
  }
  const normalized = normalizeLayout(layout);
  saveLayout(normalized);
  applyLayout(normalized);
}

function bringToFront(panel) {
  const layout = loadLayout();
  const z = ++zCounter;
  layout[panel.id] = { ...layout[panel.id], z };
  saveLayout(layout);
  panel.style.zIndex = `${z}`;
}

function buildTileLayout(layout, showAll) {
  const rect = workspace.getBoundingClientRect();
  const ids = Object.keys(layout);
  const visible = showAll ? ids : ids.filter((id) => !layout[id].hidden);
  const count = visible.length || 1;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cellW = rect.width / cols;
  const cellH = rect.height / rows;
  visible.forEach((id, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    layout[id] = {
      ...layout[id],
      hidden: false,
      maximized: false,
      x: Math.round(col * cellW),
      y: Math.round(row * cellH),
      w: Math.round(cellW),
      h: Math.round(cellH),
      z: idx + 1,
    };
  });
  zCounter = visible.length + 1;
  return layout;
}

function buildDefaultGridLayout(rect) {
  const cols = 7;
  const rows = 2;
  const colW = rect.width / cols;
  const rowH = rect.height / rows;
  const snap = (value) => Math.round(value);
  const place = (col, row, colSpan = 1, rowSpan = 1) => ({
    x: snap(col * colW),
    y: snap(row * rowH),
    w: snap(colSpan * colW),
    h: snap(rowSpan * rowH),
    hidden: false,
    maximized: false,
  });

  return {
    "position-panel": place(0, 0, 1, 1),
    "time-panel": place(1, 0, 1, 1),
    "sky-panel": place(2, 0, 3, 1),
    "map-panel": place(5, 0, 2, 2),
    "snr-panel": place(0, 1, 2, 1),
    "alt-panel": place(2, 1, 1, 1),
    "cog-panel": place(3, 1, 1, 1),
    "speed-panel": place(4, 1, 1, 1),
  };
}

function initPanels() {
  const rect = workspace.getBoundingClientRect();
  const grid = buildDefaultGridLayout(rect);
  const minScale = Math.min(rect.width / (7 * minPanelSize.w), rect.height / (2 * minPanelSize.h), 1);
  const minSize = { w: Math.round(minPanelSize.w * minScale), h: Math.round(minPanelSize.h * minScale) };
  const startupSlot = localStorage.getItem(startupLayoutKey) || "grid";
  const saved = startupSlot !== "grid" ? loadSavedLayout(startupSlot) : null;
  let layout = saved ? normalizeLayout(saved) : normalizeLayout(grid, minSize);
  if (!anyPanelVisible(layout)) {
    layout = normalizeLayout({ ...defaultLayout });
  }
  Object.keys(layout).forEach((id, idx) => {
    if (!layout[id].z) {
      layout[id] = { ...layout[id], z: idx + 1 };
    }
  });
  saveLayout(layout);
  applyLayout(layout);

  workspace.querySelectorAll(".panel").forEach((panel) => {
    const header = panel.querySelector(".panel-header");
    const resizeHandle = panel.querySelector(".panel-resize");
    const closeBtn = panel.querySelector('[data-action="close"]');
    const maxBtn = panel.querySelector('[data-action="maximize"]');

    panel.addEventListener("mousedown", () => {
      bringToFront(panel);
    });

    if (header) {
      header.addEventListener("mousedown", (event) => {
        const rect = panel.getBoundingClientRect();
        const parentRect = workspace.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;

        bringToFront(panel);
        function onMove(e) {
          const maxX = parentRect.width - rect.width;
          const maxY = parentRect.height - rect.height;
          const x = clamp(e.clientX - parentRect.left - offsetX, 0, maxX);
          const y = clamp(e.clientY - parentRect.top - offsetY, 0, maxY);
          panel.style.left = `${x}px`;
          panel.style.top = `${y}px`;
        }
        function onUp() {
          const x = parseFloat(panel.style.left) || 0;
          const y = parseFloat(panel.style.top) || 0;
          updateLayout(panel.id, { x, y });
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    }

    if (resizeHandle) {
      resizeHandle.addEventListener("mousedown", (event) => {
        event.stopPropagation();
        const rect = panel.getBoundingClientRect();
        const parentRect = workspace.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;

        bringToFront(panel);
        function onMove(e) {
          const minW = minPanelSize.w;
          const minH = minPanelSize.h;
          const maxW = parentRect.width - (rect.left - parentRect.left);
          const maxH = parentRect.height - (rect.top - parentRect.top);
          const nextW = clamp(rect.width + (e.clientX - startX), minW, maxW);
          const nextH = clamp(rect.height + (e.clientY - startY), minH, maxH);
          panel.style.width = `${nextW}px`;
          panel.style.height = `${nextH}px`;
          requestAnimationFrame(() => {
            if (panel.id === "sky-panel" && lastState) {
              drawSky(lastState);
            }
            if (panel.id === "alt-panel") {
              drawAltimeter(lastState?.fix?.alt_m ?? 0);
            }
            if (panel.id === "time-panel") {
              drawClock(lastState?.t_utc ?? null);
            }
            if (panel.id === "speed-panel") {
              drawSpeedometer(lastState?.fix?.speed_knots ?? 0);
            }
            if (panel.id === "cog-panel") {
              drawCog(lastState?.fix?.cog_deg ?? 0, lastState?.fix?.speed_knots ?? 0);
            }
          });
        }
        function onUp() {
          const w = parseFloat(panel.style.width) || rect.width;
          const h = parseFloat(panel.style.height) || rect.height;
          updateLayout(panel.id, { w, h });
          requestAnimationFrame(() => {
            if (panel.id === "time-panel") {
              drawClock(lastState?.t_utc ?? null);
            }
            if (panel.id === "cog-panel") {
              drawCog(lastState?.fix?.cog_deg ?? 0, lastState?.fix?.speed_knots ?? 0);
            }
          });
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        updateLayout(panel.id, { hidden: true });
      });
    }

    if (maxBtn) {
      maxBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        const layout = loadLayout();
        const isMax = layout[panel.id]?.maximized;
        if (!isMax) {
          const { x, y, w, h } = layout[panel.id] || {};
          layout[panel.id] = {
            ...layout[panel.id],
            prev: { x, y, w, h },
            maximized: true,
            hidden: false,
          };
          Object.keys(layout).forEach((id) => {
            if (id !== panel.id) {
              layout[id] = { ...layout[id], maximized: false };
            }
          });
        } else {
          const prev = layout[panel.id]?.prev;
          layout[panel.id] = {
            ...layout[panel.id],
            maximized: false,
            x: prev?.x ?? layout[panel.id]?.x ?? 20,
            y: prev?.y ?? layout[panel.id]?.y ?? 20,
            w: prev?.w ?? layout[panel.id]?.w ?? 400,
            h: prev?.h ?? layout[panel.id]?.h ?? 300,
          };
        }
        const normalized = normalizeLayout(layout);
        saveLayout(normalized);
        applyLayout(normalized);
        if (panel.id === "sky-panel") {
          updateSkyCompact();
          if (lastState) drawSky(lastState);
        }
      });
    }
  });

  panelToggles.forEach((toggle) => {
    const panelId = toggle.dataset.panel;
    if (!panelId) return;
    if (toggle instanceof HTMLInputElement && toggle.type === "checkbox") {
      toggle.addEventListener("change", () => {
        updateLayout(panelId, { hidden: !toggle.checked });
      });
    } else {
      toggle.addEventListener("click", () => {
        const layout = loadLayout();
        const current = layout[panelId];
        updateLayout(panelId, { hidden: !current?.hidden });
      });
    }
  });
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawSky(state) {
  // Render the sky plot onto the canvas with quadrant tint and trails.
  if (!state || !state.sats) return;
  resizeCanvas();
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const cx = w / 2;
  const cy = h / 2;
  const margin = 18;
  const radius = Math.max(10, Math.min(w, h) * 0.5 - margin);

  ctx.clearRect(0, 0, w, h);
  skyHitTargets = [];

    ctx.save();
    ctx.translate(cx, cy);
    const quadColors = [
      themeColor("--sky-quad-1", "rgba(77, 210, 255, 0.06)"),
      themeColor("--sky-quad-2", "rgba(245, 178, 86, 0.05)"),
      themeColor("--sky-quad-3", "rgba(120, 200, 140, 0.05)"),
      themeColor("--sky-quad-4", "rgba(120, 140, 200, 0.05)"),
    ];
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
    ctx.fillStyle = quadColors[i];
    ctx.arc(0, 0, radius, (i * Math.PI) / 2, ((i + 1) * Math.PI) / 2);
    ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = themeColor("--sky-ring", "rgba(200, 220, 240, 0.12)");
    ctx.lineWidth = 1;
    [0.33, 0.66, 1].forEach((r) => {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * r, 0, Math.PI * 2);
      ctx.stroke();
    });
    for (let deg = 0; deg < 360; deg += 30) {
      const angle = ((deg - 90) * Math.PI) / 180;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    ctx.fillStyle = themeColor("--sky-label", "rgba(200, 220, 240, 0.5)");
    ctx.font = "bold 18px Bahnschrift";
    ctx.fillText("N", cx - 6, cy - radius - 6);
    ctx.fillText("S", cx - 6, cy + radius + 14);
    ctx.fillText("E", cx + radius + 6, cy + 4);
    ctx.fillText("W", cx - radius - 14, cy + 4);

  const filtered = filterSats(state.sats);
  for (const sat of filtered) {
    if (sat.az === null || sat.el === null || sat.az === undefined || sat.el === undefined) {
      continue;
    }
    const r = radius * (1 - sat.el / 90);
    const angle = ((sat.az - 90) * Math.PI) / 180;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);

    if (sat.trail && sat.trail.length > 1) {
      ctx.beginPath();
      sat.trail.forEach((pt, idx) => {
        const tr = radius * (1 - pt[1] / 90);
        const ta = ((pt[0] - 90) * Math.PI) / 180;
        const tx = cx + tr * Math.cos(ta);
        const ty = cy + tr * Math.sin(ta);
        if (idx === 0) ctx.moveTo(tx, ty);
        else ctx.lineTo(tx, ty);
      });
        ctx.strokeStyle = themeColor("--sky-trail", "rgba(255, 255, 255, 0.12)");
        ctx.lineWidth = 1;
        ctx.stroke();
      }

    const color = constColor(sat.gnssid);
    const isTracked = sat.snr && sat.snr > 0;
    const satRadius = 9;
    ctx.beginPath();
    ctx.fillStyle = isTracked ? color : "rgba(150, 160, 175, 0.65)";
    ctx.arc(x, y, satRadius, 0, Math.PI * 2);
    ctx.fill();
    if (isTracked && !sat.used) {
      const cross = satRadius * 0.75;
      ctx.strokeStyle = "rgba(235, 80, 80, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - cross, y - cross);
      ctx.lineTo(x + cross, y + cross);
      ctx.moveTo(x + cross, y - cross);
      ctx.lineTo(x - cross, y + cross);
      ctx.stroke();
    }
      ctx.fillStyle = themeColor("--text", "#e8f0f7");
      ctx.font = "10px Bahnschrift";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(`${constCode(sat.gnssid)}${sat.prn}`, x, y + satRadius + 4);
      skyHitTargets.push({
        x,
        y,
        r: satRadius + 6,
        sat: { ...sat, tracked: isTracked },
      });
    }
  }

function constColor(gnssid) {
  switch ((gnssid || "").toUpperCase()) {
    case "GPS":
      return "rgba(77, 210, 255, 0.9)";
    case "GLONASS":
      return "rgba(138, 240, 180, 0.9)";
    case "GALILEO":
      return "rgba(245, 178, 86, 0.9)";
    case "BEIDOU":
      return "rgba(255, 120, 140, 0.9)";
    case "SBAS":
      return "rgba(170, 160, 255, 0.9)";
    default:
      return "rgba(200, 210, 220, 0.9)";
  }
}

function renderSkyTooltip(target, x, y) {
  if (!skyTooltip || !skyWrap) return;
  const sat = target.sat;
  const id = `${constCode(sat.gnssid)}${sat.prn ?? "--"}`;
  const gnss = (sat.gnssid || "Unknown").toUpperCase();
  const az = sat.az === null || sat.az === undefined ? "--" : `${Math.round(sat.az)} deg`;
  const elv = sat.el === null || sat.el === undefined ? "--" : `${Math.round(sat.el)} deg`;
  const snr = sat.snr === null || sat.snr === undefined ? "--" : `${Math.round(sat.snr)} dB-Hz`;
  const status = sat.used ? "Used" : sat.tracked ? "Tracked (not used)" : "Not tracked";
  skyTooltip.innerHTML = `
    <div class="sky-tooltip-title">${id}</div>
    <div class="sky-tooltip-row"><span>Constellation</span><span>${gnss}</span></div>
    <div class="sky-tooltip-row"><span>Azimuth</span><span>${az}</span></div>
    <div class="sky-tooltip-row"><span>Elevation</span><span>${elv}</span></div>
    <div class="sky-tooltip-row"><span>SNR</span><span>${snr}</span></div>
    <div class="sky-tooltip-row"><span>Status</span><span>${status}</span></div>
  `;
  skyTooltip.hidden = false;
  const rect = skyWrap.getBoundingClientRect();
  const tw = skyTooltip.offsetWidth;
  const th = skyTooltip.offsetHeight;
  let left = x + 12;
  let top = y + 12;
  if (left + tw > rect.width) left = x - tw - 12;
  if (top + th > rect.height) top = y - th - 12;
  left = Math.max(8, Math.min(left, rect.width - tw - 8));
  top = Math.max(8, Math.min(top, rect.height - th - 8));
  skyTooltip.style.left = `${left}px`;
  skyTooltip.style.top = `${top}px`;
}

function renderSnrTooltip(target, x, y) {
  if (!snrTooltip || !snrPlot) return;
  const sat = target.sat;
  const id = `${constCode(sat.gnssid)}${sat.prn ?? "--"}`;
  const gnss = (sat.gnssid || "Unknown").toUpperCase();
  const az = sat.az === null || sat.az === undefined ? "--" : `${Math.round(sat.az)} deg`;
  const elv = sat.el === null || sat.el === undefined ? "--" : `${Math.round(sat.el)} deg`;
  const snr = sat.snr === null || sat.snr === undefined ? "--" : `${Math.round(sat.snr)} dB-Hz`;
  const status = sat.used ? "Used" : sat.snr > 0 ? "Tracked (not used)" : "Not tracked";
  snrTooltip.innerHTML = `
    <div class="snr-tooltip-title">${id}</div>
    <div class="snr-tooltip-row"><span>Constellation</span><span>${gnss}</span></div>
    <div class="snr-tooltip-row"><span>Azimuth</span><span>${az}</span></div>
    <div class="snr-tooltip-row"><span>Elevation</span><span>${elv}</span></div>
    <div class="snr-tooltip-row"><span>SNR</span><span>${snr}</span></div>
    <div class="snr-tooltip-row"><span>Status</span><span>${status}</span></div>
  `;
  snrTooltip.hidden = false;
  const rect = snrPlot.getBoundingClientRect();
  const tw = snrTooltip.offsetWidth;
  const th = snrTooltip.offsetHeight;
  let left = x + 12;
  let top = y + 12;
  if (left + tw > rect.width) left = x - tw - 12;
  if (top + th > rect.height) top = y - th - 12;
  left = Math.max(8, Math.min(left, rect.width - tw - 8));
  top = Math.max(8, Math.min(top, rect.height - th - 8));
  snrTooltip.style.left = `${left}px`;
  snrTooltip.style.top = `${top}px`;
}

if (canvas && skyWrap && skyTooltip) {
  canvas.addEventListener("mousemove", (event) => {
    if (!skyHitTargets.length) {
      skyTooltip.hidden = true;
      return;
    }
    const rect = skyWrap.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let hit = null;
    let hitDist = Infinity;
    for (const target of skyHitTargets) {
      const dx = x - target.x;
      const dy = y - target.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= target.r && dist < hitDist) {
        hit = target;
        hitDist = dist;
      }
    }
    if (!hit) {
      skyTooltip.hidden = true;
      return;
    }
    renderSkyTooltip(hit, x, y);
  });
  canvas.addEventListener("mouseleave", () => {
    skyTooltip.hidden = true;
  });
}

if (snrCanvas && snrPlot && snrTooltip) {
  snrCanvas.addEventListener("mousemove", (event) => {
    if (!snrHitTargets.length) {
      snrTooltip.hidden = true;
      return;
    }
    const rect = snrPlot.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let hit = null;
    for (const target of snrHitTargets) {
      if (x >= target.x && x <= target.x + target.w && y >= target.y && y <= target.y + target.h) {
        hit = target;
        break;
      }
    }
    if (!hit) {
      snrTooltip.hidden = true;
      return;
    }
    renderSnrTooltip(hit, x, y);
  });
  snrCanvas.addEventListener("mouseleave", () => {
    snrTooltip.hidden = true;
  });
}

function renderState(state) {
  lastState = state;
  updateHealth(state.health);
  updateFixBadge(state);
  updateCards(state);
  updateConstellationCounts(state.sats || []);
  renderSnr(state.sats || []);
  drawSky(state);
  updateMap(state.fix?.lat, state.fix?.lon, false, state.fix?.cog_deg, state.fix?.speed_knots);
  drawAltimeter(state.fix?.alt_m);
  drawClock(state.t_utc);
  drawSpeedometer(state.fix?.speed_knots);
  drawCog(state.fix?.cog_deg, state.fix?.speed_knots);
}

function connectWs() {
  const ws = new WebSocket(`ws://${window.location.host}/ws`);
  ws.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data);
      renderState(data);
    } catch (err) {
      console.error("Bad payload", err);
    }
  });
  ws.addEventListener("close", () => {
    setTimeout(connectWs, 1000);
  });
}

window.addEventListener("resize", () => {
  requestAnimationFrame(() => {
    const layout = normalizeLayout(loadLayout());
    saveLayout(layout);
    applyLayout(layout);
    if (lastState) drawSky(lastState);
  });
});

initPanels();
updateSkyCompact();
initMap();
initSnrControls();
initAltimeterControls();
initTimeControls();
initSpeedometerControls();
initCogControls();
if (cardsMenuToggle && cardsMenu) {
  cardsMenuToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    cardsMenu.classList.toggle("open");
  });
  cardsMenu.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  document.addEventListener("click", () => {
    cardsMenu.classList.remove("open");
  });
}
Object.values(filters).forEach((control) => {
  if (!control) return;
  control.addEventListener("change", () => {
    if (lastState) renderState(lastState);
  });
});
if (viewsMenuToggle && viewsMenu) {
  viewsMenuToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    viewsMenu.classList.toggle("open");
  });
  viewsMenu.addEventListener("click", (event) => {
    event.stopPropagation();
    const btn = event.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "save-layout") {
      const layout = normalizeLayout(loadLayout());
      const slot = btn.dataset.slot || "default";
      saveSavedLayout(layout, slot);
      saveLayout(layout);
    } else if (action === "load-layout") {
      const slot = btn.dataset.slot || "default";
      const saved = loadSavedLayout(slot);
      const rect = workspace.getBoundingClientRect();
      const fallback = buildDefaultGridLayout(rect);
      const minScale = Math.min(rect.width / (7 * minPanelSize.w), rect.height / (2 * minPanelSize.h), 1);
      const minSize = { w: Math.round(minPanelSize.w * minScale), h: Math.round(minPanelSize.h * minScale) };
      const layout = saved ? normalizeLayout(saved) : normalizeLayout(fallback, minSize);
      saveLayout(layout);
      applyLayout(layout);
      if (lastState) drawSky(lastState);
    } else if (action === "force-tile") {
      const rect = workspace.getBoundingClientRect();
      const grid = buildDefaultGridLayout(rect);
      const minScale = Math.min(rect.width / (7 * minPanelSize.w), rect.height / (2 * minPanelSize.h), 1);
      const minSize = { w: Math.round(minPanelSize.w * minScale), h: Math.round(minPanelSize.h * minScale) };
      const normalized = normalizeLayout(grid, minSize);
      saveLayout(normalized);
      applyLayout(normalized);
      if (lastState) drawSky(lastState);
    } else if (action === "cascade-layout") {
      const layout = loadLayout();
      const visible = Object.keys(layout).filter((id) => !layout[id].hidden);
      const rect = workspace.getBoundingClientRect();
      const baseW = Math.max(minPanelSize.w, rect.width * 0.6);
      const baseH = Math.max(minPanelSize.h, rect.height * 0.6);
      const step = 30;
      visible.forEach((id, idx) => {
        layout[id] = {
          ...layout[id],
          maximized: false,
          x: clamp(idx * step, 0, rect.width - baseW),
          y: clamp(idx * step, 0, rect.height - baseH),
          w: baseW,
          h: baseH,
          z: idx + 1,
        };
      });
      zCounter = visible.length + 1;
      const normalized = normalizeLayout(layout);
      saveLayout(normalized);
      applyLayout(normalized);
      if (lastState) drawSky(lastState);
    }
  });
  document.addEventListener("click", () => {
    viewsMenu.classList.remove("open");
  });
}

const startupToggles = document.querySelectorAll("[data-startup-slot]");
function syncStartupToggles() {
  const active = localStorage.getItem(startupLayoutKey) || "grid";
  startupToggles.forEach((toggle) => {
    if (!(toggle instanceof HTMLInputElement)) return;
    toggle.checked = toggle.dataset.startupSlot === active;
  });
}

startupToggles.forEach((toggle) => {
  if (!(toggle instanceof HTMLInputElement)) return;
  toggle.addEventListener("change", () => {
    if (toggle.checked) {
      localStorage.setItem(startupLayoutKey, toggle.dataset.startupSlot || "grid");
    } else {
      localStorage.setItem(startupLayoutKey, "grid");
    }
    syncStartupToggles();
  });
});

syncStartupToggles();
connectWs();

const workspaceObserver = new ResizeObserver(() => {
  const layout = normalizeLayout(loadLayout());
  saveLayout(layout);
  applyLayout(layout);
  if (lastState) drawSky(lastState);
  updateSnrColumns();
  if (lastState) renderSnr(lastState.sats || []);
});

workspaceObserver.observe(workspace);

function updateSkyCompact() {
  if (!skyLayout) return;
  const panel = document.getElementById("sky-panel");
  if (!panel) return;
  const width = panel.getBoundingClientRect().width;
  skyLayout.classList.toggle("compact", width < 560);
}

const skyObserver = new ResizeObserver(() => {
  updateSkyCompact();
  if (lastState) drawSky(lastState);
});

const skyPanel = document.getElementById("sky-panel");
if (skyPanel) {
  skyObserver.observe(skyPanel);
}

const mapPanel = document.getElementById("map-panel");
if (mapPanel) {
  const mapObserver = new ResizeObserver(() => {
    if (map) {
      map.invalidateSize();
    }
  });
  mapObserver.observe(mapPanel);
}

const altPanel = document.getElementById("alt-panel");
if (altPanel) {
  const altObserver = new ResizeObserver(() => {
    if (lastState) {
      requestAnimationFrame(() => drawAltimeter(lastState.fix?.alt_m));
    }
  });
  altObserver.observe(altPanel);
}

const timePanel = document.getElementById("time-panel");
if (timePanel) {
  const timeObserver = new ResizeObserver(() => {
    requestAnimationFrame(() => drawClock(lastState?.t_utc ?? null));
  });
  timeObserver.observe(timePanel);
}

const speedPanel = document.getElementById("speed-panel");
if (speedPanel) {
  const speedObserver = new ResizeObserver(() => {
    if (lastState) {
      requestAnimationFrame(() => drawSpeedometer(lastState.fix?.speed_knots));
    }
  });
  speedObserver.observe(speedPanel);
}

const cogPanel = document.getElementById("cog-panel");
if (cogPanel) {
  const cogObserver = new ResizeObserver(() => {
    if (lastState) {
      requestAnimationFrame(() => drawCog(lastState.fix?.cog_deg, lastState.fix?.speed_knots));
    }
  });
  cogObserver.observe(cogPanel);
}

function updateSnrColumns() {
  if (!snrCanvas || !snrChart) return;
  const gap = 12;
  const min = 34;
  const width = snrCanvas.clientWidth || 0;
  snrCols = Math.max(1, Math.floor((width + gap) / (min + gap)));
  snrChart.style.setProperty("--snr-cols", snrCols);
}

function drawSnrCanvas(sats) {
  if (!snrCanvas || !snrAxis) return;
  const rect = snrCanvas.getBoundingClientRect();
  const axisRect = snrAxis.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = rect.width;
  const h = rect.height;
  snrCanvas.width = w * dpr;
  snrCanvas.height = h * dpr;
  snrAxis.width = axisRect.width * dpr;
  snrAxis.height = h * dpr;

  const ctx = snrCanvas.getContext("2d");
  const axisCtx = snrAxis.getContext("2d");
  if (!ctx || !axisCtx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  axisCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, w, h);
  axisCtx.clearRect(0, 0, axisRect.width, h);
  snrHitTargets = [];

  const padTop = 4;
  const labelHeight = 18;
  const padBottom = labelHeight + 6;
  const plotHeight = Math.max(2, h - padTop - padBottom);
  const maxDb = 50;
  const ticks = [0, 10, 20, 30, 40, 50];

  // Gridlines
  const snrGrid = themeColor("--snr-grid", "rgba(200, 220, 240, 0.06)");
  const snrAxisColor = themeColor("--snr-axis", "rgba(200, 220, 240, 0.6)");
  ctx.strokeStyle = snrGrid;
  ctx.lineWidth = 1;
  ticks.forEach((t) => {
    const y = padTop + (1 - t / maxDb) * plotHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  });

  // Axis labels
  axisCtx.fillStyle = snrAxisColor;
  axisCtx.font = "11px Bahnschrift";
  axisCtx.textAlign = "right";
  axisCtx.textBaseline = "middle";
  ticks.forEach((t) => {
    const y = padTop + (1 - t / maxDb) * plotHeight;
    axisCtx.fillText(`${t}`, axisRect.width - 6, y);
  });
  axisCtx.font = "10px Bahnschrift";
  axisCtx.textAlign = "left";
  axisCtx.textBaseline = "top";
  axisCtx.fillText("DB-HZ", 2, padTop + 2);

  // Bars
  const gap = 12;
  const count = Math.max(1, sats.length);
  const barWidth = (w - gap * (count - 1)) / count;
  const totalWidth = barWidth * count + gap * Math.max(0, count - 1);
  const xOffset = Math.max(0, (w - totalWidth) / 2);
  sats.forEach((sat, idx) => {
    const snr = Math.max(0, Math.min(maxDb, sat.snr ?? 0));
    const barHeight = (snr / maxDb) * plotHeight;
    const x = xOffset + idx * (barWidth + gap);
    const y = padTop + plotHeight - barHeight;
    const style = getSnrBarStyle(sat);
    ctx.fillStyle = style.fill;
    ctx.fillRect(x, y, barWidth, barHeight);
    snrHitTargets.push({
      x,
      y,
      w: barWidth,
      h: barHeight,
      sat,
    });
  });

  ctx.fillStyle = themeColor("--text", "#e8f0f7");
  ctx.font = "10px Bahnschrift";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  sats.forEach((sat, idx) => {
    const label = `${constCode(sat.gnssid)}${sat.prn ?? "--"}`;
    const x = xOffset + idx * (barWidth + gap) + barWidth / 2;
    const y = padTop + plotHeight + 6;
    ctx.fillText(label, x, y);
  });
}

function setSnrMode(mode) {
  snrMode = mode === "history" ? "history" : "bars";
  localStorage.setItem("navscope-snr-mode", snrMode);
  if (snrModeToggle) {
    snrModeToggle.textContent = snrMode === "history" ? "History" : "Bars";
  }
  if (snrChart) {
    snrChart.classList.toggle("history-mode", snrMode === "history");
  }
  if (lastState) renderSnr(lastState.sats || []);
}

function initSnrControls() {
  setSnrMode(snrMode);
  if (snrModeToggle) {
    snrModeToggle.addEventListener("click", () => {
      const next = snrMode === "history" ? "bars" : "history";
      setSnrMode(next);
    });
  }
}

function initAltimeterControls() {
  if (altUnits) {
    altUnits.value = localStorage.getItem("navscope-alt-units") || "m";
    altUnits.addEventListener("change", () => {
      localStorage.setItem("navscope-alt-units", altUnits.value);
      if (altScaleUnits) altScaleUnits.textContent = altUnits.value;
      if (lastState) drawAltimeter(lastState.fix?.alt_m);
    });
  }
  if (altScale) {
    altScale.value = localStorage.getItem("navscope-alt-scale") || "100";
    altScale.addEventListener("change", () => {
      localStorage.setItem("navscope-alt-scale", altScale.value);
      if (lastState) drawAltimeter(lastState.fix?.alt_m);
    });
  }
  if (altScaleUnits && altUnits) {
    altScaleUnits.textContent = altUnits.value;
  }
  if (altModeToggle) {
    const saved = localStorage.getItem("navscope-alt-mode") || "dial";
    setAltMode(saved);
    altModeToggle.addEventListener("click", () => {
      const next = altModeToggle.textContent === "Dial" ? "Digital" : "Dial";
      setAltMode(next.toLowerCase());
    });
  }
}

function setAltMode(mode) {
  const wrap = document.querySelector(".alt-wrap");
  if (!wrap) return;
  const isDigital = mode === "digital";
  wrap.classList.toggle("digital", isDigital);
  altModeToggle.textContent = isDigital ? "Digital" : "Dial";
  localStorage.setItem("navscope-alt-mode", mode);
  if (lastState) drawAltimeter(lastState.fix?.alt_m);
}

function drawAltimeter(altMeters) {
  if (!altCanvas) return;
  const isDigital = document.querySelector(".alt-wrap")?.classList.contains("digital");
  const units = altUnits?.value || "m";
  const altScaleValue = Math.max(1, parseInt(altScale?.value || "100", 10));
  const altValue = altMeters ?? 0;
  const displayAlt = units === "ft" ? altValue * 3.28084 : altValue;

  if (altDigital) {
    const unitLabel = units === "ft" ? "ft" : "m";
    altDigital.innerHTML = `<span class="alt-value">${displayAlt.toFixed(0)}</span><span class="alt-unit">${unitLabel}</span>`;
    altDigital.style.color = Number.isFinite(displayAlt) ? "var(--value-bright)" : "var(--value-dim)";
  }
  if (isDigital) return;

  const wrap = altWrap || altCanvas.parentElement;
  if (!wrap) return;
  const footerHeight = altDigital ? altDigital.offsetHeight : 0;
  const wrapRect = wrap.getBoundingClientRect();
  const availableHeight = Math.max(80, wrapRect.height - footerHeight - 2);
  const availableWidth = Math.max(80, wrapRect.width);
  if (availableWidth < 10 || availableHeight < 10) return;
  const dpr = window.devicePixelRatio || 1;
  const w = availableWidth;
  const h = availableHeight;
  altCanvas.width = w * dpr;
  altCanvas.height = h * dpr;
  const ctx = altCanvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.5;
    const ring = radius * 0.96;
    const scale = clamp(ring / 140, 0.85, 2.2);
    wrap.style.setProperty("--dial-label-size", `${Math.round(24 * scale)}px`);

    const dialStroke = themeColor("--dial-stroke", "rgba(200, 220, 240, 0.2)");
    const dialTick = themeColor("--dial-tick", "rgba(200, 220, 240, 0.25)");
    const dialLabel = themeColor("--dial-label", "rgba(200, 220, 240, 0.7)");
    ctx.strokeStyle = dialStroke;
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, ring, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = dialTick;
    const tickCount = 50;
    for (let i = 0; i < tickCount; i++) {
      const angle = (i / tickCount) * Math.PI * 2 - Math.PI / 2;
      const isMajor = i % 5 === 0;
      const inner = ring * (isMajor ? 0.8 : 0.87);
      ctx.lineWidth = (isMajor ? 2 : 1) * scale;
      ctx.beginPath();
      ctx.moveTo(cx + inner * Math.cos(angle), cy + inner * Math.sin(angle));
      ctx.lineTo(cx + ring * Math.cos(angle), cy + ring * Math.sin(angle));
      ctx.stroke();
    }

    ctx.fillStyle = dialLabel;
    ctx.font = `${Math.round(24 * scale)}px Bahnschrift`;
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = ring * 0.68;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    ctx.fillText(`${i}`, x - 4, y + 4);
  }

  const majorPeriod = altScaleValue * 10;
  const minorPeriod = altScaleValue * 100;
  const hundreds = (displayAlt % majorPeriod) / majorPeriod;
  const thousands = (displayAlt % minorPeriod) / minorPeriod;
    const handPrimary = themeColor("--dial-hand", "#e6eef5");
    const handMuted = themeColor("--dial-hand-muted", "#8b9bb0");
    drawAltHand(ctx, cx, cy, ring * 0.78, hundreds, 2 * scale, handPrimary);
    drawAltHand(ctx, cx, cy, ring * 0.52, thousands, 3 * scale, handMuted);

  // Unit tag now rendered by the floating control; skip canvas label.

    ctx.fillStyle = themeColor("--dial-hand", "#e6eef5");
  ctx.beginPath();
  ctx.arc(cx, cy, 6 * scale, 0, Math.PI * 2);
  ctx.fill();
}

function drawAltHand(ctx, cx, cy, length, value, width, color) {
  const angle = value * Math.PI * 2 - Math.PI / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + length * Math.cos(angle), cy + length * Math.sin(angle));
  ctx.stroke();
}

function initTimeControls() {
  if (timeZone) {
    timeZone.value = localStorage.getItem("navscope-time-zone") || "utc";
    timeZone.addEventListener("change", () => {
      localStorage.setItem("navscope-time-zone", timeZone.value);
      if (lastState) drawClock(lastState.t_utc);
    });
  }
  if (timeModeToggle) {
    const saved = localStorage.getItem("navscope-time-mode") || "dial";
    setTimeMode(saved);
    timeModeToggle.addEventListener("click", () => {
      const next = timeModeToggle.textContent === "Dial" ? "Digital" : "Dial";
      setTimeMode(next.toLowerCase());
    });
  }
  drawClock(null);
}

function setTimeMode(mode) {
  const wrap = timeWrap || document.querySelector(".time-wrap");
  if (!wrap) return;
  const isDigital = mode === "digital";
  wrap.classList.toggle("digital", isDigital);
  timeModeToggle.textContent = isDigital ? "Digital" : "Dial";
  localStorage.setItem("navscope-time-mode", mode);
  if (lastState) drawClock(lastState.t_utc);
}

function parseUtcTime(tUtc) {
  if (!tUtc) return null;
  if (typeof tUtc === "string") {
    const iso = Date.parse(tUtc);
    if (!Number.isNaN(iso)) {
      const dt = new Date(iso);
      return { h: dt.getUTCHours(), m: dt.getUTCMinutes(), s: dt.getUTCSeconds() };
    }
    const clean = tUtc.replace(/[^0-9]/g, "");
    if (clean.length >= 6) {
      const h = parseInt(clean.slice(0, 2), 10);
      const m = parseInt(clean.slice(2, 4), 10);
      const s = parseInt(clean.slice(4, 6), 10);
      if (Number.isFinite(h) && Number.isFinite(m) && Number.isFinite(s)) {
        return { h, m, s };
      }
    }
  }
  return null;
}

function convertClockTime(parsedUtc) {
  if (!parsedUtc) return null;
  const mode = timeZone?.value || "utc";
  if (mode === "utc") {
    return { ...parsedUtc, label: "UTC" };
  }
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), parsedUtc.h, parsedUtc.m, parsedUtc.s));
  const offsetHours = mode === "local+1" ? 1 : 0;
  if (offsetHours) {
    base.setHours(base.getHours() + offsetHours);
  }
  return { h: base.getHours(), m: base.getMinutes(), s: base.getSeconds(), label: mode === "local+1" ? "Local+1" : "Local" };
}

function drawClock(tUtc) {
  if (!timeCanvas) return;
  const isDigital = document.querySelector(".time-wrap")?.classList.contains("digital");
  const parsed = parseUtcTime(tUtc);
  const clock = convertClockTime(parsed);
  if (timeDigital) {
    if (clock) {
      const hh = String(clock.h).padStart(2, "0");
      const mm = String(clock.m).padStart(2, "0");
      const ss = String(clock.s).padStart(2, "0");
      timeDigital.textContent = `${hh}:${mm}:${ss}`;
      timeDigital.style.color = "var(--value-bright)";
    } else {
      timeDigital.textContent = "--:--:--";
      timeDigital.style.color = "var(--value-dim)";
    }
  }
  if (isDigital) return;

  const wrap = timeWrap || timeCanvas.parentElement;
  if (!wrap) return;
  const footerHeight = timeDigital ? timeDigital.offsetHeight : 0;
  const wrapRect = wrap.getBoundingClientRect();
  const availableHeight = Math.max(80, wrapRect.height - footerHeight - 2);
  const availableWidth = Math.max(80, wrapRect.width);
  if (availableWidth < 10 || availableHeight < 10) return;

  const dpr = window.devicePixelRatio || 1;
  const w = availableWidth;
  const h = availableHeight;
  timeCanvas.width = w * dpr;
  timeCanvas.height = h * dpr;
  const ctx = timeCanvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.5;
    const ring = radius * 0.96;
    const scale = clamp(ring / 140, 0.85, 2.2);
    wrap.style.setProperty("--dial-label-size", `${Math.round(24 * scale)}px`);

  const dialStroke = themeColor("--dial-stroke", "rgba(200, 220, 240, 0.2)");
  const dialTick = themeColor("--dial-tick", "rgba(200, 220, 240, 0.25)");
  const dialLabel = themeColor("--dial-label", "rgba(200, 220, 240, 0.7)");
  ctx.strokeStyle = dialStroke;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.arc(cx, cy, ring, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = dialTick;
  for (let i = 0; i < 60; i++) {
    const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const isMajor = i % 5 === 0;
    const inner = ring * (isMajor ? 0.78 : 0.86);
    ctx.lineWidth = (isMajor ? 2 : 1) * scale;
    ctx.beginPath();
    ctx.moveTo(cx + inner * Math.cos(angle), cy + inner * Math.sin(angle));
    ctx.lineTo(cx + ring * Math.cos(angle), cy + ring * Math.sin(angle));
    ctx.stroke();
  }

  ctx.fillStyle = dialLabel;
  ctx.font = `${Math.round(24 * scale)}px Bahnschrift`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 1; i <= 12; i++) {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const r = ring * 0.68;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    ctx.fillText(`${i}`, x, y);
  }

  if (clock) {
    const hour = (clock.h % 12) + clock.m / 60;
    const minute = clock.m + clock.s / 60;
    const second = clock.s;
    const hourRatio = hour / 12;
    const minuteRatio = minute / 60;
    const secondRatio = second / 60;
    const handPrimary = themeColor("--dial-hand", "#e6eef5");
    const handMuted = themeColor("--dial-hand-muted", "#b6c6d6");
    const handThin = themeColor("--dial-hand-thin", "rgba(220, 232, 245, 0.8)");
    drawTimeHand(ctx, cx, cy, ring * 0.55, hourRatio, 3 * scale, handPrimary);
    drawTimeHand(ctx, cx, cy, ring * 0.78, minuteRatio, 3 * scale, handMuted);
    drawTimeHand(ctx, cx, cy, ring * 0.82, secondRatio, 1 * scale, handThin);
  }

  ctx.fillStyle = themeColor("--dial-hand", "#e6eef5");
  ctx.beginPath();
  ctx.arc(cx, cy, 6 * scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = dialLabel;
  ctx.font = `${Math.round(22 * scale)}px Bahnschrift`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const meridiem = clock ? (clock.h >= 12 ? "PM" : "AM") : "--";
  ctx.fillText(meridiem, cx, cy + ring * 0.225);
}

function drawTimeHand(ctx, cx, cy, length, value, width, color) {
  const angle = value * Math.PI * 2 - Math.PI / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + length * Math.cos(angle), cy + length * Math.sin(angle));
  ctx.stroke();
}

function initSpeedometerControls() {
  if (speedUnits) {
    speedUnits.value = localStorage.getItem("navscope-speed-units") || "kmh";
    speedUnits.addEventListener("change", () => {
      localStorage.setItem("navscope-speed-units", speedUnits.value);
      if (lastState) drawSpeedometer(lastState.fix?.speed_knots);
    });
  }
  if (speedMaxInput) {
    speedMaxInput.value = localStorage.getItem("navscope-speed-max") || "120";
    speedMaxInput.addEventListener("change", () => {
      localStorage.setItem("navscope-speed-max", speedMaxInput.value);
      if (lastState) drawSpeedometer(lastState.fix?.speed_knots);
    });
  }
  if (speedModeToggle) {
    const saved = localStorage.getItem("navscope-speed-mode") || "dial";
    setSpeedMode(saved);
    speedModeToggle.addEventListener("click", () => {
      const next = speedModeToggle.textContent === "Dial" ? "Digital" : "Dial";
      setSpeedMode(next.toLowerCase());
    });
  }
}

function setSpeedMode(mode) {
  const wrap = document.querySelector(".speed-wrap");
  if (!wrap) return;
  const isDigital = mode === "digital";
  wrap.classList.toggle("digital", isDigital);
  speedModeToggle.textContent = isDigital ? "Digital" : "Dial";
  localStorage.setItem("navscope-speed-mode", mode);
  if (lastState) drawSpeedometer(lastState.fix?.speed_knots);
}

function speedFromKnots(knots, unit) {
  if (knots === null || knots === undefined) return 0;
  if (unit === "kn") return knots;
  if (unit === "mps") return knots * 0.514444;
  if (unit === "mph") return knots * 1.15078;
  return knots * 1.852;
}

function getSpeedScale(unit) {
  if (unit === "kn") return { max: 120 };
  if (unit === "mps") return { max: 60 };
  if (unit === "mph") return { max: 120 };
  return { max: 200 };
}

function getSpeedStep(max) {
  if (!Number.isFinite(max)) return 10;
  if (max <= 140) return 10;
  if (max <= 220) return 20;
  if (max <= 320) return 40;
  if (max <= 600) return 50;
  return 100;
}

function drawSpeedometer(speedKnots) {
  if (!speedCanvas) return;
  const isDigital = document.querySelector(".speed-wrap")?.classList.contains("digital");
  const units = speedUnits?.value || "kmh";
  const speed = speedFromKnots(speedKnots ?? 0, units);
  const { max: defaultMax } = getSpeedScale(units);
  const maxOverride = speedMaxInput ? parseFloat(speedMaxInput.value) : NaN;
  const max = Number.isFinite(maxOverride) && maxOverride > 0 ? maxOverride : defaultMax;
  const step = getSpeedStep(max);

  if (speedDigital) {
    speedDigital.innerHTML = `<span class="speed-value">${speed.toFixed(1)}</span><span class="speed-unit">${units}</span>`;
    speedDigital.style.color = speedKnots !== null && speedKnots !== undefined ? "var(--value-bright)" : "var(--value-dim)";
  }
  if (isDigital) return;

  const wrap = speedWrap || speedCanvas.parentElement;
  if (!wrap) return;
  const footerHeight = speedFooter ? speedFooter.offsetHeight : 0;
  const wrapRect = wrap.getBoundingClientRect();
  const availableHeight = Math.max(80, wrapRect.height - footerHeight - 2);
  const availableWidth = Math.max(80, wrapRect.width);
  if (availableWidth < 10 || availableHeight < 10) return;
  const dpr = window.devicePixelRatio || 1;
  const w = availableWidth;
  const h = availableHeight;
  speedCanvas.width = w * dpr;
  speedCanvas.height = h * dpr;
  const ctx = speedCanvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.5;
    const ring = radius * 0.96;
    const scale = clamp(ring / 140, 0.85, 2.2);
    wrap.style.setProperty("--dial-label-size", `${Math.round(24 * scale)}px`);

  const dialStroke = themeColor("--dial-stroke", "rgba(200, 220, 240, 0.2)");
  const dialTick = themeColor("--dial-tick", "rgba(200, 220, 240, 0.25)");
  const dialLabel = themeColor("--dial-label", "rgba(200, 220, 240, 0.7)");
  ctx.strokeStyle = dialStroke;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.arc(cx, cy, ring, 0, Math.PI * 2);
  ctx.stroke();

  const ticks = Math.floor(max / step);
  const startAngle = clockAngle(7);
  let endAngle = clockAngle(5);
  if (endAngle <= startAngle) {
    endAngle += Math.PI * 2;
  }
  const sweep = endAngle - startAngle;

  ctx.strokeStyle = dialTick;
  for (let i = 0; i <= ticks * 5; i++) {
    const angle = startAngle + (i / (ticks * 5)) * sweep;
    const isMajor = i % 5 === 0;
    const inner = ring * (isMajor ? 0.8 : 0.87);
    ctx.lineWidth = (isMajor ? 2 : 1) * scale;
    ctx.beginPath();
    ctx.moveTo(cx + inner * Math.cos(angle), cy + inner * Math.sin(angle));
    ctx.lineTo(cx + ring * Math.cos(angle), cy + ring * Math.sin(angle));
    ctx.stroke();
  }

  ctx.fillStyle = dialLabel;
  ctx.font = `${Math.round(24 * scale)}px Bahnschrift`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
    for (let i = 0; i <= ticks; i++) {
      if (i === ticks) continue;
      const value = i * step;
      const angle = startAngle + (i / ticks) * sweep;
    const r = ring * 0.68;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    ctx.fillText(`${value}`, x, y);
  }

  const speedRatio = Math.max(0, Math.min(1, speed / max));
  const needleAngle = startAngle + speedRatio * sweep;
  const handPrimary = themeColor("--dial-hand", "#e6eef5");
  drawSpeedHand(ctx, cx, cy, ring * 0.78, needleAngle, 3 * scale, handPrimary);

  ctx.fillStyle = dialLabel;
  ctx.font = `${Math.round(22 * scale)}px Bahnschrift`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const unitLabel = units === "mps" ? "m/s" : units === "kmh" ? "km/h" : units;
  ctx.fillText(unitLabel, cx, cy + ring * 0.225);

  if (speedMaxInput) {
    const labelAngle = endAngle;
    const labelRadius = ring * 0.74;
    const labelX = cx + labelRadius * Math.cos(labelAngle);
    const labelY = cy + labelRadius * Math.sin(labelAngle);
    speedMaxInput.style.left = `${labelX}px`;
    speedMaxInput.style.top = `${labelY}px`;
  }
}

function drawSpeedHand(ctx, cx, cy, length, angle, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + length * Math.cos(angle), cy + length * Math.sin(angle));
  ctx.stroke();
}

function clockAngle(hour) {
  return (hour / 12) * Math.PI * 2 - Math.PI / 2;
}

function initCogControls() {
  if (cogModeToggle) {
    const saved = localStorage.getItem("navscope-cog-mode") || "dial";
    setCogMode(saved);
    cogModeToggle.addEventListener("click", () => {
      const next = cogModeToggle.textContent === "Dial" ? "Digital" : "Dial";
      setCogMode(next.toLowerCase());
    });
  }
  drawCog(0, 0);
}

function setCogMode(mode) {
  const wrap = cogWrap || document.querySelector(".cog-wrap");
  if (!wrap) return;
  const isDigital = mode === "digital";
  wrap.classList.toggle("digital", isDigital);
  cogModeToggle.textContent = isDigital ? "Digital" : "Dial";
  localStorage.setItem("navscope-cog-mode", mode);
  if (lastState) drawCog(lastState.fix?.cog_deg, lastState.fix?.speed_knots);
}

function formatCog(cogDeg, valid) {
  if (!valid || cogDeg === null || cogDeg === undefined) return "--";
  return `${Math.round(cogDeg)}\u00B0`;
}

function cogCardinal(cogDeg, valid) {
  if (!valid || cogDeg === null || cogDeg === undefined) return "--";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round((cogDeg % 360) / 45) % 8;
  return dirs[idx];
}

function drawCog(cogDeg, speedKnots) {
  if (!cogCanvas) return;
  const isDigital = document.querySelector(".cog-wrap")?.classList.contains("digital");
  const valid = speedKnots !== null && speedKnots !== undefined && speedKnots >= 0.5;
  if (cogDigital) {
    if (valid) {
      const cardinal = cogCardinal(cogDeg, valid);
      cogDigital.innerHTML = `<span class="cog-value"><span class="cog-deg">${formatCog(cogDeg, valid)}</span><span class="cog-cardinal">${cardinal}</span></span>`;
      cogDigital.style.color = "var(--value-bright)";
    } else {
      cogDigital.innerHTML = `<span class="cog-value"><span class="cog-deg">--</span><span class="cog-cardinal">--</span></span>`;
      cogDigital.style.color = "var(--value-dim)";
    }
  }
  if (isDigital) return;

  const wrap = cogWrap || cogCanvas.parentElement;
  if (!wrap) return;
  const footerHeight = cogDigital ? cogDigital.offsetHeight : 0;
  const wrapRect = wrap.getBoundingClientRect();
  const availableHeight = Math.max(80, wrapRect.height - footerHeight - 2);
  const availableWidth = Math.max(80, wrapRect.width);
  if (availableWidth < 10 || availableHeight < 10) return;

  const dpr = window.devicePixelRatio || 1;
  const w = availableWidth;
  const h = availableHeight;
  cogCanvas.width = w * dpr;
  cogCanvas.height = h * dpr;
  const ctx = cogCanvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.5;
    const ring = radius * 0.96;
    const scale = clamp(ring / 140, 0.85, 2.2);
    wrap.style.setProperty("--dial-label-size", `${Math.round(28 * scale)}px`);

  const dialStroke = themeColor("--dial-stroke", "rgba(200, 220, 240, 0.2)");
  const dialTick = themeColor("--dial-tick", "rgba(200, 220, 240, 0.25)");
  const dialLabel = themeColor("--dial-label", "rgba(200, 220, 240, 0.7)");
  ctx.strokeStyle = dialStroke;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.arc(cx, cy, ring, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  const angle = ((valid ? cogDeg : 0) || 0) * (Math.PI / 180);
  ctx.translate(cx, cy);
  ctx.rotate(-angle);

    ctx.strokeStyle = dialTick;
    const tickCount = 32;
    for (let i = 0; i < tickCount; i++) {
    const a = (i / tickCount) * Math.PI * 2 - Math.PI / 2;
    const isMajor = i % 4 === 0;
    const inner = ring * (isMajor ? 0.75 : 0.86);
      ctx.lineWidth = (isMajor ? 2.2 : 1.2) * scale;
      ctx.beginPath();
      ctx.moveTo(inner * Math.cos(a), inner * Math.sin(a));
      ctx.lineTo(ring * Math.cos(a), ring * Math.sin(a));
      ctx.stroke();
    }

    ctx.fillStyle = dialLabel;
    ctx.font = `600 ${Math.round(28 * scale)}px Bahnschrift`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const labels = ["N", "E", "S", "W"];
    for (let i = 0; i < labels.length; i++) {
      const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
      const r = ring * 0.62;
      const x = r * Math.cos(a);
      const y = r * Math.sin(a);
      ctx.fillText(labels[i], x, y);
    }

  ctx.restore();

  // Fixed "up" marker to show current COG direction.
  const pointerColor = valid ? "#4de27a" : "rgba(200, 210, 220, 0.55)";
  const pointerTip = ring * 0.92;
  const pointerBase = ring * 0.66;
  const pointerHalf = ring * 0.16;

  ctx.fillStyle = pointerColor;
  ctx.beginPath();
  ctx.moveTo(cx, cy - pointerTip);
  ctx.lineTo(cx - pointerHalf, cy - pointerBase);
  ctx.lineTo(cx + pointerHalf, cy - pointerBase);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = dialLabel;
  ctx.font = `${Math.round(22 * scale)}px Bahnschrift`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("\u00B0", cx, cy + ring * 0.225);
}

const snrPatternCache = new Map();

function getSnrBarStyle(sat) {
  const colors = getConstColors(sat.gnssid);
  if (!sat.snr || sat.snr <= 0) {
    return { fill: "rgba(90, 100, 110, 0.5)" };
  }
  if (sat.used) {
    return { fill: colors.solid };
  }
  const hatch = themeColor("--snr-hatch", "rgba(235, 80, 80, 0.7)");
  const key = `${colors.solid}-${hatch}`;
  if (!snrPatternCache.has(key)) {
    const p = document.createElement("canvas");
    p.width = 8;
    p.height = 8;
    const pctx = p.getContext("2d");
    if (pctx) {
      pctx.fillStyle = colors.solid;
      pctx.fillRect(0, 0, 8, 8);
      pctx.strokeStyle = hatch;
      pctx.lineWidth = 1;
      pctx.beginPath();
      pctx.moveTo(-2, 8);
      pctx.lineTo(8, -2);
      pctx.stroke();
    }
    snrPatternCache.set(key, snrCanvas.getContext("2d").createPattern(p, "repeat"));
  }
  return { fill: snrPatternCache.get(key) };
}

function getConstColors(gnssid) {
  switch ((gnssid || "").toUpperCase()) {
    case "GPS":
      return { solid: "#4dd2ff", dark: "#0f5a78" };
    case "GLONASS":
      return { solid: "#8af0b4", dark: "#287850" };
    case "GALILEO":
      return { solid: "#f5b256", dark: "#965a1e" };
    case "BEIDOU":
      return { solid: "#ff788c", dark: "#a03c50" };
    case "SBAS":
      return { solid: "#aaa0ff", dark: "#5a5096" };
    default:
      return { solid: "#c8d2dc", dark: "#5a646e" };
  }
}


