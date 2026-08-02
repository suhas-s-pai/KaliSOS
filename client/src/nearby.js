/**
 * Nearby safety facilities, sourced entirely from OpenStreetMap.
 *
 * Two free, keyless services are used:
 *   Overpass API  — finds police stations, hospitals and fire stations that
 *                   actually exist around a coordinate.
 *   Nominatim     — reverse geocodes the handful of results whose OSM entry
 *                   carries no addr:* tags.
 *
 * Nothing here dials, messages or contacts anyone. The only outbound action a
 * result offers is `navigationUrl`, which opens Google Maps directions.
 */

import axios from "axios";
import { getPrefs } from "./prefs";

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

// `filters` are Overpass tag selectors. Several are listed where a single tag
// does not cover real-world data: hospitals, for example, are tagged either
// amenity=hospital or healthcare=hospital depending on who mapped them.
export const CATEGORIES = [
  {
    id: "police",
    title: "Nearby Police Stations",
    label: "Police",
    description:
      "Find police stations closest to this location and open turn-by-turn directions.",
    unnamed: "Police station",
    filters: ['["amenity"="police"]'],
  },
  {
    id: "hospital",
    title: "Nearby Hospitals",
    label: "Hospitals",
    description:
      "Locate hospitals and emergency departments within reach of this position.",
    unnamed: "Hospital",
    filters: ['["amenity"="hospital"]', '["healthcare"="hospital"]'],
  },
  {
    id: "fire",
    title: "Nearby Fire Stations",
    label: "Fire",
    description:
      "Show fire and rescue stations covering the surrounding area.",
    unnamed: "Fire station",
    filters: ['["amenity"="fire_station"]'],
  },
];

export function getCategory(id) {
  return CATEGORIES.find((category) => category.id === id) || CATEGORIES[0];
}

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

const EARTH_RADIUS_KM = 6371;

export function distanceKm(fromLat, fromLon, toLat, toLon) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLon = toRad(toLon - fromLon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(km) {
  if (!Number.isFinite(km)) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

// Google Maps directions. This is the single outbound action a result offers:
// it opens navigation, it never places a call.
export function navigationUrl(lat, lon) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
}

/* ------------------------------------------------------------------ *
 * Overpass
 * ------------------------------------------------------------------ */

// Public instances, tried in order until one answers. All three are free and
// keyless; each throttles independently, so a 429 or an outage on one falls
// through to the next rather than to an empty screen. Kumi is first because it
// consistently answered fastest during testing.
const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

// Deliberately shorter than the [timeout:25] inside the query: a stalled
// endpoint should hand over to the next one quickly rather than make the
// operator wait out the server's own limit.
const OVERPASS_TIMEOUT_MS = 15000;

const MAX_RESULTS = 40;

function buildQuery(filters, lat, lon, radiusMetres) {
  const clauses = filters
    .flatMap((filter) =>
      ["node", "way", "relation"].map(
        (type) => `${type}${filter}(around:${radiusMetres},${lat},${lon});`
      )
    )
    .join("");

  // `out center` gives ways and relations a single representative coordinate,
  // so buildings mapped as areas can be plotted and measured like nodes.
  return `[out:json][timeout:25];(${clauses});out center tags ${MAX_RESULTS};`;
}

function isAborted(error) {
  return (
    error?.name === "CanceledError" ||
    error?.name === "AbortError" ||
    error?.code === "ERR_CANCELED"
  );
}

async function runOverpass(query, signal) {
  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await axios.post(endpoint, `data=${encodeURIComponent(query)}`, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: OVERPASS_TIMEOUT_MS,
        signal,
      });
      return Array.isArray(res.data?.elements) ? res.data.elements : [];
    } catch (error) {
      if (isAborted(error)) throw error;
      lastError = error;
    }
  }

  throw lastError || new Error("Overpass API unreachable");
}

/* ------------------------------------------------------------------ *
 * Addresses
 * ------------------------------------------------------------------ */

const ADDRESS_PARTS = [
  ["addr:housenumber", "addr:street"],
  ["addr:suburb", "addr:neighbourhood", "addr:hamlet"],
  ["addr:city", "addr:town", "addr:village", "addr:district"],
  ["addr:state"],
  ["addr:postcode"],
];

// Builds a readable address from whatever addr:* tags the OSM entry carries.
// Returns null when there is nothing usable, which is the signal to reverse
// geocode instead.
function addressFromTags(tags) {
  const line = ADDRESS_PARTS.map((group) => {
    if (group[0] === "addr:housenumber") {
      const street = tags["addr:street"];
      if (!street) return null;
      const number = tags["addr:housenumber"];
      return number ? `${number} ${street}` : street;
    }
    const key = group.find((k) => tags[k]);
    return key ? tags[key] : null;
  })
    .filter(Boolean)
    .join(", ");

  return line || null;
}

const addressCache = new Map();

// Nominatim's usage policy allows at most one request per second. Every
// lookup is queued behind the previous one and spaced accordingly, and each
// coordinate is only ever asked for once.
let nominatimQueue = Promise.resolve();
let lastNominatimCall = 0;

function tidyNominatim(data) {
  const address = data?.address;
  if (!address) return data?.display_name || null;

  const pick = (...keys) => keys.map((k) => address[k]).find(Boolean);

  const parts = [
    pick("road", "pedestrian", "neighbourhood"),
    pick("suburb", "city_district", "village", "town"),
    pick("city", "county"),
    address.state,
    address.postcode,
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : data?.display_name || null;
}

export function reverseGeocode(lat, lon) {
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  if (addressCache.has(key)) return Promise.resolve(addressCache.get(key));

  const request = nominatimQueue.then(async () => {
    if (addressCache.has(key)) return addressCache.get(key);

    const wait = 1200 - (Date.now() - lastNominatimCall);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastNominatimCall = Date.now();

    try {
      const res = await axios.get("https://nominatim.openstreetmap.org/reverse", {
        params: { format: "jsonv2", lat, lon, zoom: 18, addressdetails: 1 },
        timeout: 12000,
      });
      const text = tidyNominatim(res.data);
      addressCache.set(key, text);
      return text;
    } catch {
      // Cached as a miss so a failing lookup is not retried on every render.
      addressCache.set(key, null);
      return null;
    }
  });

  nominatimQueue = request.catch(() => {});
  return request;
}

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

// `police=*` refines what an amenity=police object actually is. These values
// are facilities the public cannot walk into for help.
const NON_STATION_POLICE = new Set([
  "checkpoint",
  "car_pound",
  "range",
  "storage",
  "detention",
  "naval_base",
  "barracks",
]);

// Perimeter gates and building entrances repeat the amenity tag of the compound
// they belong to, so a raw Overpass result mixes "Police Headquarters" with
// "Gate 35". Those are not destinations, and listing them would push the real
// station down the distance ranking.
function isReachableFacility(tags, categoryId) {
  if (tags.barrier || tags.entrance) return false;
  if (categoryId === "police" && NON_STATION_POLICE.has(tags.police)) return false;
  return true;
}

function toPlace(element, origin, unnamedLabel) {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const tags = element.tags || {};
  const name =
    tags.name || tags["name:en"] || tags.official_name || tags.operator || null;

  return {
    id: `${element.type}/${element.id}`,
    name: name || unnamedLabel,
    named: Boolean(name),
    address: addressFromTags(tags),
    lat,
    lon,
    km: distanceKm(origin.lat, origin.lon, lat, lon),
  };
}

// The same station is often mapped twice — once as a node for the entrance and
// once as a way for the building. Matching name and a ~100m coordinate bucket
// collapses those into one row.
function dedupe(places) {
  const seen = new Set();
  return places.filter((place) => {
    const key = `${place.name.toLowerCase()}@${place.lat.toFixed(3)},${place.lon.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Finds facilities of one category around a coordinate.
 *
 * Coverage varies enormously: a metro area returns a dozen hits at 5km while a
 * rural district returns none. The radius therefore widens until enough
 * results appear, and the radius actually used is reported back so the UI can
 * state it honestly.
 *
 * @returns {Promise<{ places: Array, radiusKm: number }>}
 */
export async function findNearby(categoryId, origin, options = {}) {
  const { signal, minResults = 4 } = options;
  const category = getCategory(categoryId);

  // Read at call time, not at import time, so changing the radius in Settings
  // applies to the very next search.
  const base = options.radiusKm || getPrefs().searchRadiusKm;
  const radii = [base, base * 4, Math.max(base * 10, 50)];

  let places = [];
  let radiusKm = base;

  for (const radius of radii) {
    radiusKm = Math.round(radius);

    const elements = await runOverpass(
      buildQuery(category.filters, origin.lat, origin.lon, radiusKm * 1000),
      signal
    );

    places = dedupe(
      elements
        .filter((element) => isReachableFacility(element.tags || {}, category.id))
        .map((element) => toPlace(element, origin, category.unnamed))
        .filter(Boolean)
    ).sort((a, b) => a.km - b.km);

    if (places.length >= minResults) break;
  }

  return { places: places.slice(0, 12), radiusKm };
}

/**
 * Reads the browser's position once, as a promise.
 * High accuracy is requested because these results are distance-ranked.
 */
export function locate(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location services are not available on this device"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? "Location permission was denied"
              : "Could not determine your location"
          )
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000, ...options }
    );
  });
}
