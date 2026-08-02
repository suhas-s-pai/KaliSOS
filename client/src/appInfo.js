/**
 * Static facts about this build, shown in Settings → System and About.
 *
 * Everything here is a plain constant rather than a guess made at runtime, so
 * the About panel states what the project actually is. Update `hackathon` to
 * your event name — it is the one field that cannot be derived from the code.
 */
export const APP_INFO = {
  name: "KaliSOS",
  tagline: "Voice Activated Emergency Safety Platform",
  version: "1.0.0",
  team: "SpringX",
  hackathon: "Hackathon 2026",

  frontend: "React 19 · Vite 7 · Axios",
  backend: "Node.js · Express",
  database: "Supabase PostgreSQL",
  deployment: "Vercel · Render · Supabase",

  dataSource: "OpenStreetMap (Overpass + Nominatim)",
};

/** Vite sets this at build time; it is the real mode this bundle was built in. */
export const ENVIRONMENT = import.meta.env.DEV ? "Development" : "Production";
