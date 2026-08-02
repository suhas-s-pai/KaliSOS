import { useCallback, useEffect, useRef, useState } from "react";
import {
  ShieldCheck,
  HeartPulse,
  Flame,
  Navigation,
  MapPin,
  LoaderCircle,
  RefreshCw,
  X,
  ChevronRight,
  TriangleAlert,
  LocateFixed,
  Compass,
} from "lucide-react";
import {
  CATEGORIES,
  getCategory,
  findNearby,
  reverseGeocode,
  navigationUrl,
  formatDistance,
  locate,
} from "./nearby";
import { usePrefs } from "./prefs";

// Which Settings toggle governs each category.
const CATEGORY_PREF = {
  police: "showPolice",
  hospital: "showHospitals",
  fire: "showFireStations",
};

const ICONS = {
  police: ShieldCheck,
  hospital: HeartPulse,
  fire: Flame,
};

const IDLE = { status: "idle", places: [], radiusKm: 0, error: null };

const keyOf = (point) =>
  point ? `${point.lat.toFixed(2)},${point.lon.toFixed(2)}` : "";

/**
 * Safety Resources — police stations, hospitals and fire stations that exist
 * around a given coordinate, sourced from OpenStreetMap.
 *
 * Every result offers exactly one action: Navigate, which opens Google Maps
 * directions. Nothing in this component can place a call or send a message.
 *
 * @param {{lat:number, lon:number}|null} origin  Coordinate to search around.
 *        Home leaves this null and lets the component ask the browser;
 *        the dashboard passes the selected alert's live position.
 * @param {boolean} autoLocate  Request the browser's position when no origin
 *        has been supplied.
 * @param {string} placeholder  Shown when there is no origin and none can be
 *        requested — e.g. "Select an alert first".
 * @param {(point:{lat:number, lon:number}) => void} onLocated  Called when the
 *        component resolves a position itself, so the parent can reuse it.
 */
export default function SafetyResources({
  origin = null,
  autoLocate = false,
  title = "Safety Resources",
  caption = "Verified locations from OpenStreetMap · navigation only",
  placeholder = "No location available yet.",
  onLocated,
  compact = false,
}) {
  const prefs = usePrefs();
  const [located, setLocated] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [result, setResult] = useState(IDLE);

  const visible = CATEGORIES.filter((category) => prefs[CATEGORY_PREF[category.id]]);

  // Bumped on every new search so a slow response from an abandoned request
  // can never overwrite the current one.
  const requestRef = useRef(0);
  const abortRef = useRef(null);
  const searchKeyRef = useRef("");
  const onLocatedRef = useRef(onLocated);
  onLocatedRef.current = onLocated;

  const point = origin || located;

  const close = useCallback(() => {
    requestRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setActiveId(null);
    setResult(IDLE);
  }, []);

  useEffect(() => close, [close]);

  // Rounded to ~1km so a tracked caller's GPS jitter does not reset the panel,
  // while genuinely moving — or selecting a different alert — does.
  const originKey = keyOf(origin);

  useEffect(() => {
    // A parent that adopts the position this component just resolved is not a
    // change of location, so results stay on screen.
    if (originKey === searchKeyRef.current) return;
    close();
  }, [originKey, close]);

  // Switching a category off in Settings while its results are open would
  // leave a panel with no card to close it.
  const activeHidden = activeId ? !prefs[CATEGORY_PREF[activeId]] : false;

  useEffect(() => {
    if (activeHidden) close();
  }, [activeHidden, close]);

  // OSM entries frequently carry no addr:* tags. Those coordinates are reverse
  // geocoded one at a time, in the background, so rows fill in progressively
  // instead of blocking the list behind a rate-limited queue.
  const resolveAddresses = useCallback(async (token, places) => {
    for (const place of places) {
      if (place.address) continue;

      const text = await reverseGeocode(place.lat, place.lon);
      if (token !== requestRef.current) return;

      setResult((prev) => ({
        ...prev,
        places: prev.places.map((row) =>
          row.id === place.id ? { ...row, address: text, addressResolved: true } : row
        ),
      }));
    }
  }, []);

  const explore = useCallback(
    async (categoryId) => {
      const token = ++requestRef.current;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setActiveId(categoryId);
      setResult({ ...IDLE, status: point ? "loading" : "locating" });

      try {
        let searchPoint = point;

        if (!searchPoint) {
          if (!autoLocate) throw new Error(placeholder);
          searchPoint = await locate();
          if (token !== requestRef.current) return;
          searchKeyRef.current = keyOf(searchPoint);
          setLocated(searchPoint);
          onLocatedRef.current?.(searchPoint);
          setResult((prev) => ({ ...prev, status: "loading" }));
        } else {
          searchKeyRef.current = keyOf(searchPoint);
        }

        const { places, radiusKm } = await findNearby(categoryId, searchPoint, {
          signal: controller.signal,
        });

        if (token !== requestRef.current) return;

        setResult({ status: "ready", places, radiusKm, error: null });
        resolveAddresses(token, places);
      } catch (error) {
        if (token !== requestRef.current) return;
        setResult({
          status: "error",
          places: [],
          radiusKm: 0,
          error:
            error?.message ||
            "Could not reach the OpenStreetMap service. Try again in a moment.",
        });
      }
    },
    [point, autoLocate, placeholder, resolveAddresses]
  );

  const active = activeId && !activeHidden ? getCategory(activeId) : null;
  const busy = result.status === "loading" || result.status === "locating";

  return (
    <section className={`ks-res${compact ? " ks-res--compact" : ""}`}>

      <div className="ks-res__head">
        <span className="ks-res__headIcon">
          <Compass size={15} strokeWidth={1.9} />
        </span>
        <div className="ks-res__headText">
          <h2>{title}</h2>
          <p>{caption}</p>
        </div>
      </div>

      {visible.length === 0 && (
        <div className="ks-card">
          <div className="ks-empty">
            <Compass size={22} strokeWidth={1.6} />
            <h3>All categories are hidden</h3>
            <p>Turn police stations, hospitals or fire stations back on under Settings → Maps.</p>
          </div>
        </div>
      )}

      <div className="ks-res__grid">
        {visible.map((category) => {
          const Icon = ICONS[category.id];
          const isActive = activeId === category.id;

          return (
            <article
              className={`ks-res__card ks-res__card--${category.id}${isActive ? " is-active" : ""}`}
              key={category.id}
            >
              <span className={`ks-res__icon ks-res__icon--${category.id}`}>
                <Icon size={19} strokeWidth={1.8} />
              </span>

              <h3>{category.title}</h3>
              <p>{category.description}</p>

              <button
                className={`ks-btn ks-btn--sm ks-res__explore${isActive ? "" : " ks-btn--ghost"}`}
                onClick={() => (isActive ? close() : explore(category.id))}
                disabled={busy && !isActive}
              >
                {isActive && busy ? (
                  <>
                    <LoaderCircle size={14} strokeWidth={2} className="ks-spin" />
                    {result.status === "locating" ? "Locating" : "Searching"}
                  </>
                ) : isActive ? (
                  <>
                    <X size={14} strokeWidth={2} /> Close
                  </>
                ) : (
                  <>
                    Explore <ChevronRight size={14} strokeWidth={2} />
                  </>
                )}
              </button>
            </article>
          );
        })}
      </div>

      {active && (
        <div className="ks-card ks-res__panel">

          <div className="ks-card__head">
            <MapPin size={15} strokeWidth={1.8} />
            <h2>{active.title}</h2>

            {result.status === "ready" && (
              <>
                <span className="ks-chip ks-chip--blue">
                  {result.places.length} found
                </span>
                <span className="ks-chip ks-chip--ghost">
                  within {result.radiusKm} km
                </span>
              </>
            )}

            <button
              className="ks-btn ks-btn--ghost ks-btn--sm"
              onClick={() => explore(active.id)}
              disabled={busy}
              title="Search again"
            >
              <RefreshCw size={13} strokeWidth={1.9} className={busy ? "ks-spin" : ""} />
            </button>

            <button
              className="ks-btn ks-btn--ghost ks-btn--sm"
              onClick={close}
              title="Close results"
            >
              <X size={13} strokeWidth={1.9} />
            </button>
          </div>

          {busy && (
            <div className="ks-places">
              {[0, 1, 2, 3].map((row) => (
                <div className="ks-place ks-place--skeleton" key={row}>
                  <span className="ks-skel ks-skel--rank" />
                  <span className="ks-place__text">
                    <span className="ks-skel ks-skel--line" />
                    <span className="ks-skel ks-skel--line ks-skel--short" />
                  </span>
                </div>
              ))}
              <p className="ks-res__note">
                {result.status === "locating"
                  ? "Waiting for your device location…"
                  : "Querying OpenStreetMap…"}
              </p>
            </div>
          )}

          {result.status === "error" && (
            <div className="ks-empty">
              <TriangleAlert size={22} strokeWidth={1.6} />
              <h3>Search failed</h3>
              <p>{result.error}</p>
              <button className="ks-btn ks-btn--sm" onClick={() => explore(active.id)}>
                <RefreshCw size={14} strokeWidth={1.9} /> Try again
              </button>
            </div>
          )}

          {result.status === "ready" && result.places.length === 0 && (
            <div className="ks-empty">
              <LocateFixed size={22} strokeWidth={1.6} />
              <h3>Nothing mapped nearby</h3>
              <p>
                OpenStreetMap lists no {active.label.toLowerCase()} within{" "}
                {result.radiusKm} km of this position.
              </p>
            </div>
          )}

          {result.status === "ready" && result.places.length > 0 && (
            <div className="ks-places">
              {result.places.map((place, index) => (
                <article className="ks-place" key={place.id}>

                  <span className="ks-place__rank">{index + 1}</span>

                  <div className="ks-place__text">
                    <h4>
                      {place.name}
                      {!place.named && (
                        <span className="ks-place__tag">unnamed on OSM</span>
                      )}
                    </h4>
                    <p className={place.address ? "" : "ks-place__addr--pending"}>
                      {place.address ||
                        (place.addressResolved
                          ? "Address not listed in OpenStreetMap"
                          : "Resolving address…")}
                    </p>
                  </div>

                  <span className="ks-place__dist">
                    <b>{formatDistance(place.km)}</b>
                    <em>away</em>
                  </span>

                  <a
                    className="ks-btn ks-btn--sm ks-place__nav"
                    href={navigationUrl(place.lat, place.lon)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Navigation size={14} strokeWidth={1.9} /> Navigate
                  </a>

                </article>
              ))}
            </div>
          )}

        </div>
      )}

    </section>
  );
}
