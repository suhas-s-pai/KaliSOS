/**
 * Device preferences.
 *
 * Everything here lives in localStorage on the operator's own device — there
 * is no settings endpoint, and none is invented. A single store backs the
 * Settings screen and every component that reacts to it, so changing a value
 * takes effect immediately in whatever is already on screen.
 */

import { useSyncExternalStore } from "react";

export const PREFS_KEY = "kalisos.prefs";
const LAST_FIX_KEY = "kalisos.lastfix";
const HEALTH_KEY = "kalisos.health";

export const DEFAULTS = {
  /* Notifications */
  notificationSound: true,
  desktopNotifications: false,
  refreshIntervalMs: 2000,

  /* Voice recognition */
  voiceDefaultOn: false,
  voiceSensitivity: "medium",

  /* Maps and nearby search */
  searchRadiusKm: 5,
  showPolice: true,
  showHospitals: true,
  showFireStations: true,

  /* Appearance */
  theme: "dark",
  compactDashboard: false,
  reduceAnimations: false,
  glassEffects: true,
};

export const REFRESH_CHOICES = [
  { value: 2000, label: "2 seconds" },
  { value: 5000, label: "5 seconds" },
  { value: 10000, label: "10 seconds" },
];

export const RADIUS_CHOICES = [
  { value: 2, label: "2 km" },
  { value: 5, label: "5 km" },
  { value: 10, label: "10 km" },
];

/**
 * What each sensitivity level actually changes in Home's recogniser.
 *
 * `phrases` are matched against the transcript, and `interim` decides whether
 * unconfirmed speech counts. High reacts a word or two sooner and matches
 * single words, which also makes a false alert more likely — the Settings
 * screen says so rather than presenting this as a free upgrade.
 */
export const VOICE_PROFILES = {
  low: {
    label: "Low",
    phrases: ["help me"],
    interim: false,
    note: "Only the full phrase triggers an alert. Fewest false alarms.",
  },
  medium: {
    label: "Medium",
    phrases: ["help me", "sos"],
    interim: false,
    note: "Balanced. Waits for confirmed speech before matching.",
  },
  high: {
    label: "High",
    phrases: ["help me", "sos", "help", "emergency"],
    interim: true,
    note: "Matches single words and acts on unconfirmed speech. Fastest, but can misfire.",
  },
};

export function voiceProfile(sensitivity) {
  return VOICE_PROFILES[sensitivity] || VOICE_PROFILES.medium;
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

let cache = null;
const listeners = new Set();

function coerce(stored) {
  const prefs = { ...DEFAULTS };

  for (const key of Object.keys(DEFAULTS)) {
    const value = stored[key];
    // Type-checked per key: a hand-edited or half-migrated localStorage entry
    // must not be able to put a string where a boolean is expected.
    if (typeof value === typeof DEFAULTS[key] && value !== null) {
      prefs[key] = value;
    }
  }

  // Earlier builds stored the siren flag under a different name. Honour it so
  // an operator who switched the siren off does not get it back on upgrade.
  if (stored.notificationSound === undefined && typeof stored.sirenOnNewAlert === "boolean") {
    prefs.notificationSound = stored.sirenOnNewAlert;
  }
  if (stored.theme === undefined && typeof stored.reduceMotion === "boolean") {
    prefs.reduceAnimations = stored.reduceMotion;
  }

  // Guard the enumerated values: anything unrecognised falls back rather than
  // leaving the UI in a state no control can represent.
  if (!VOICE_PROFILES[prefs.voiceSensitivity]) prefs.voiceSensitivity = DEFAULTS.voiceSensitivity;
  if (!REFRESH_CHOICES.some((c) => c.value === prefs.refreshIntervalMs)) {
    prefs.refreshIntervalMs = DEFAULTS.refreshIntervalMs;
  }
  if (!RADIUS_CHOICES.some((c) => c.value === prefs.searchRadiusKm)) {
    prefs.searchRadiusKm = DEFAULTS.searchRadiusKm;
  }
  if (prefs.theme !== "dark" && prefs.theme !== "light") prefs.theme = DEFAULTS.theme;

  return prefs;
}

function load() {
  try {
    return coerce(JSON.parse(localStorage.getItem(PREFS_KEY)) || {});
  } catch {
    return { ...DEFAULTS };
  }
}

export function getPrefs() {
  if (!cache) cache = load();
  return cache;
}

function emit() {
  for (const listener of listeners) listener();
}

export function setPrefs(patch) {
  cache = { ...getPrefs(), ...patch };

  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(cache));
  } catch {
    /* private mode or a full quota — the session still honours the change */
  }

  applyAppearance(cache);
  emit();
}

export function resetPrefs() {
  cache = { ...DEFAULTS };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(cache));
  } catch {
    /* ignored */
  }
  applyAppearance(cache);
  emit();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Another tab writing preferences invalidates this one's cache.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== PREFS_KEY) return;
    cache = load();
    applyAppearance(cache);
    emit();
  });
}

/**
 * Subscribes a component to the whole preference object. The snapshot is the
 * cached object, which only changes in setPrefs, so React re-renders exactly
 * when something was actually written.
 */
export function usePrefs() {
  return useSyncExternalStore(subscribe, getPrefs, getPrefs);
}

/* ------------------------------------------------------------------ *
 * Appearance
 * ------------------------------------------------------------------ */

/**
 * Appearance preferences are expressed as attributes on <html> and consumed
 * entirely in CSS, so no component has to branch on them.
 */
export function applyAppearance(prefs = getPrefs()) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;

  root.setAttribute("data-theme", prefs.theme);
  root.classList.toggle("ks-compact", prefs.compactDashboard);
  root.classList.toggle("ks-no-anim", prefs.reduceAnimations);
  root.classList.toggle("ks-no-glass", !prefs.glassEffects);

  // Keeps form controls and the browser's own scrollbars in step with the
  // chosen theme.
  root.style.colorScheme = prefs.theme;
}

/* ------------------------------------------------------------------ *
 * Last known position
 * ------------------------------------------------------------------ */

/**
 * The most recent GPS fix this device produced, recorded by Home while an SOS
 * is tracking and by the Settings location test. Kept out of the preference
 * object because it is captured data, not a setting.
 */
export function saveLastFix(fix) {
  try {
    localStorage.setItem(LAST_FIX_KEY, JSON.stringify(fix));
  } catch {
    /* ignored */
  }
}

export function readLastFix() {
  try {
    const fix = JSON.parse(localStorage.getItem(LAST_FIX_KEY));
    return fix && Number.isFinite(fix.lat) && Number.isFinite(fix.lon) ? fix : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Feed health
 * ------------------------------------------------------------------ */

/**
 * Written by the dashboard on every poll so the Settings screen can report
 * when the alert feed last succeeded, even though the dashboard is not
 * mounted while Settings is open.
 */
export function recordSync({ ok, latencyMs, status }) {
  try {
    const previous = readHealth();
    localStorage.setItem(
      HEALTH_KEY,
      JSON.stringify({
        lastSyncAt: ok ? Date.now() : previous.lastSyncAt,
        lastAttemptAt: Date.now(),
        lastOk: ok,
        latencyMs,
        status,
      })
    );
  } catch {
    /* ignored */
  }
}

export function readHealth() {
  try {
    return JSON.parse(localStorage.getItem(HEALTH_KEY)) || {};
  } catch {
    return {};
  }
}
