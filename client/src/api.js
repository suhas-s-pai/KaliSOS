/**
 * Single source of truth for the KaliSOS backend origin.
 *
 * The deployed Render URL stays the default, so nothing changes in
 * production. Setting VITE_API_URL in a local .env lets the client point at
 * `http://localhost:5000` without editing any component.
 */
export const API_BASE = (
  import.meta.env.VITE_API_URL || "https://kalisos-backend.onrender.com"
).replace(/\/+$/, "");
