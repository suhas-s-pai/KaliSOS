import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  Siren,
  Timer,
  Satellite,
  Activity,
  Phone,
  Clock,
  MapPin,
  Copy,
  Check,
  Navigation,
  Crosshair,
  CircleCheckBig,
  TriangleAlert,
  User,
} from "lucide-react";
import CommandShell from "./CommandShell";
import SafetyResources from "./SafetyResources";
import { API_BASE } from "./api";
import { distanceKm, formatDistance } from "./nearby";
import { usePrefs, getPrefs, recordSync } from "./prefs";

const siren = new Audio("/siren.mp3");
siren.loop = true;
siren.preload = "auto";

// Raises a system notification for alerts that arrived while the operator was
// looking at another window. Silently skipped unless Settings enabled it and
// the browser granted permission.
function notifyNewAlerts(rows, count) {
  if (!getPrefs().desktopNotifications) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const newest = rows[0];

  try {
    new Notification(count > 1 ? `${count} new SOS alerts` : "New SOS alert", {
      body: newest ? `${newest.user_name} · ${newest.phone}` : "Open the control room",
      tag: "kalisos-alert",
    });
  } catch {
    /* notification construction is best effort */
  }
}

/* ---------- presentation helpers (no API or state involvement) ---------- */

// Priority is derived from how long the caller has been waiting. It is a
// display heuristic, not a value the backend assigns.
function priorityOf(createdAt) {
  const minutes = (Date.now() - new Date(createdAt).getTime()) / 60000;
  if (minutes < 3) return { level: "P1", cls: "", chip: "ks-chip--red", label: "Critical" };
  if (minutes < 12) return { level: "P2", cls: "ks-alert--p2", chip: "ks-chip--amber", label: "Elevated" };
  return { level: "P3", cls: "ks-alert--p3", chip: "ks-chip--blue", label: "Standing" };
}

function elapsedSince(createdAt) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function raisedWithinMinutes(createdAt, minutes) {
  return Date.now() - new Date(createdAt).getTime() < minutes * 60000;
}

function clockTime(value) {
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

function stamp(value) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function osmEmbed(lat, lon, span = 0.012) {
  const bbox = [lon - span, lat - span * 0.75, lon + span, lat + span * 0.75].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
}

export default function Dashboard({ focus }) {

  const prefs = usePrefs();

  const [alerts, setAlerts] = useState([]);
  const [feedError, setFeedError] = useState(false);

  // Held in a ref, not state: the polling interval captures its callback once,
  // so a state value read inside it would stay frozen at its initial value and
  // re-trigger the siren on every single poll.
  const lastCountRef = useRef(null);

  const fetchAlerts = useCallback(async () => {

    const startedAt = performance.now();

    try {

      const res = await axios.get(`${API_BASE}/alerts`);
      const previous = lastCountRef.current;

      // `previous === null` is the first load: existing alerts are not new
      // arrivals, so the room is not alarmed for them.
      if (previous !== null && res.data.length > previous) {

        // Read at fire time rather than captured, so switching the sound off
        // in Settings silences the very next alert.
        if (getPrefs().notificationSound) {
          siren.currentTime = 0;
          siren.play().catch(() => {});

          setTimeout(() => {
            siren.pause();
            siren.currentTime = 0;
          }, 1000);
        }

        notifyNewAlerts(res.data, res.data.length - previous);
      }

      lastCountRef.current = res.data.length;
      setAlerts(res.data);
      setFeedError(false);

      recordSync({
        ok: true,
        latencyMs: Math.round(performance.now() - startedAt),
        status: res.status,
      });

    } catch (error) {
      // Render cold-starts and mobile handover both surface here. The feed
      // keeps its last known rows and the banner says the link is stale.
      setFeedError(true);

      recordSync({
        ok: false,
        latencyMs: Math.round(performance.now() - startedAt),
        status: error.response?.status || 0,
      });
    }

  }, []);

  // Browsers refuse programmatic audio until the page has been interacted
  // with. Kept in its own effect so a changed poll interval does not re-arm it.
  useEffect(() => {
    document.body.addEventListener("click", () => {
      siren.play().then(() => siren.pause()).catch(() => {});
    }, { once: true });
  }, []);

  // Re-created whenever the operator changes the interval in Settings.
  //
  // Self-scheduling rather than setInterval: the next poll is queued only once
  // the previous one has settled. At a 2s interval against a cold Render
  // instance, setInterval would stack up overlapping requests and let an older
  // response land after a newer one.
  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    const schedule = (delay) => {
      timer = setTimeout(async () => {
        await fetchAlerts();
        if (!cancelled) schedule(prefs.refreshIntervalMs);
      }, delay);
    };

    schedule(0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fetchAlerts, prefs.refreshIntervalMs]);

  const handleAlert = async (id) => {

  try {
    await axios.delete(`${API_BASE}/alerts/${id}`);
  } catch {
    setFeedError(true);
    return;
  }

  // The row is gone from the next poll anyway; dropping it now keeps the
  // click from feeling laggy.
  lastCountRef.current = Math.max(0, (lastCountRef.current || 1) - 1);
  setAlerts((rows) => rows.filter((row) => row.id !== id));

  fetchAlerts();

};

  /* ---------- view state ---------- */

  const [selectedId, setSelectedId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [origin, setOrigin] = useState(null);

  const feedOnly = focus === "feed";

  const selected =
    alerts.find((a) => a.id === selectedId) || alerts[0] || null;

  const uniqueDevices = new Set(alerts.map((a) => a.phone)).size;

  const critical = alerts.filter((a) => raisedWithinMinutes(a.created_at, 3)).length;

  const oldest = alerts.reduce(
    (worst, a) => (!worst || new Date(a.created_at) < new Date(worst.created_at) ? a : worst),
    null
  );

  const copyCoordinates = async (alert) => {
    const text = `${alert.latitude}, ${alert.longitude}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(alert.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      window.prompt("Copy coordinates", text);
    }
  };

  const pinControlRoom = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setOrigin({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setOrigin(null)
    );
  };

  /* ---------- pieces ---------- */

  const statsRow = (
    <section className="ks-stats">

      <article className="ks-stat ks-stat--red">
        <div className="ks-stat__top"><Siren size={15} strokeWidth={1.8} /><span>Active Alerts</span></div>
        <p className="ks-stat__value">{alerts.length}</p>
        <p className="ks-stat__meta">Awaiting response</p>
      </article>

      <article className="ks-stat ks-stat--amber">
        <div className="ks-stat__top"><TriangleAlert size={15} strokeWidth={1.8} /><span>Critical · P1</span></div>
        <p className="ks-stat__value">{critical}</p>
        <p className="ks-stat__meta">Raised in the last 3 minutes</p>
      </article>

      <article className="ks-stat ks-stat--green">
        <div className="ks-stat__top"><Satellite size={15} strokeWidth={1.8} /><span>Live GPS Devices</span></div>
        <p className="ks-stat__value">{uniqueDevices}</p>
        <p className="ks-stat__meta">Distinct handsets transmitting</p>
      </article>

      <article className="ks-stat">
        <div className="ks-stat__top"><Timer size={15} strokeWidth={1.8} /><span>Longest Waiting</span></div>
        <p className="ks-stat__value ks-stat__value--sm">
          {oldest ? elapsedSince(oldest.created_at) : "—"}
        </p>
        <p className="ks-stat__meta">{oldest ? oldest.user_name : "Queue is clear"}</p>
      </article>

      <article className="ks-stat">
        <div className="ks-stat__top"><Activity size={15} strokeWidth={1.8} /><span>Alert Feed</span></div>
        <p className="ks-stat__value ks-stat__value--sm">
          {feedError ? "Reconnecting" : `Polling · ${prefs.refreshIntervalMs / 1000}s`}
        </p>
        <p className="ks-stat__meta">
          {feedError ? "Backend unreachable, retrying" : "Streaming from Supabase"}
        </p>
      </article>

    </section>
  );

  const feed = (
    <section>

      <div className="ks-sectionhead">
        <h2>Live Emergency Feed</h2>
        <span className="ks-chip ks-chip--ghost">{alerts.length} open</span>
        <div className="ks-sectionhead__spacer" />
        <button
          className="ks-btn ks-btn--ghost ks-btn--sm"
          onClick={pinControlRoom}
          title="Use this browser's location as the control room origin to compute distances"
        >
          <Crosshair size={14} strokeWidth={1.8} />
          {origin ? "Origin pinned" : "Pin control room"}
        </button>
      </div>

      {feedError && (
        <div className="ks-banner">
          <TriangleAlert size={15} strokeWidth={1.9} />
          Live link interrupted — showing the last received state while retrying.
        </div>
      )}

      <div className="ks-feed">

        {alerts.length === 0 && (
          <div className="ks-card">
            <div className="ks-empty">
              <CircleCheckBig size={22} strokeWidth={1.6} />
              <h3>No active emergencies</h3>
              <p>The channel is monitored continuously. Incoming alerts appear here within two seconds.</p>
            </div>
          </div>
        )}

        {alerts.map((alert) => {
          const priority = priorityOf(alert.created_at);
          const away = origin
            ? distanceKm(origin.lat, origin.lon, Number(alert.latitude), Number(alert.longitude))
            : null;

          return (
            <article
              className={`ks-alert ${priority.cls}${selected && selected.id === alert.id ? " is-selected" : ""}`}
              key={alert.id}
              onClick={() => setSelectedId(alert.id)}
            >

              <header className="ks-alert__head">

                <span className="ks-avatar">
                  {String(alert.user_name || "?").trim().charAt(0).toUpperCase()}
                </span>

                <div className="ks-alert__id">
                  <h3>{alert.user_name}</h3>
                  <div className="ks-alert__sub">
                    <span className="ks-mono">
                      <Phone size={12} strokeWidth={1.9} style={{ verticalAlign: -2, marginRight: 4 }} />
                      {alert.phone}
                    </span>
                    <span>
                      <Clock size={12} strokeWidth={1.9} style={{ verticalAlign: -2, marginRight: 4 }} />
                      {stamp(alert.created_at)}
                    </span>
                  </div>
                </div>

                <span className={`ks-chip ${priority.chip}`}>{priority.level} · {priority.label}</span>

              </header>

              <div className="ks-alert__badges">
                <span className="ks-chip ks-chip--red">
                  <span className="ks-dot ks-dot--red" /> SOS Active
                </span>
                <span className="ks-chip ks-chip--ghost">
                  <Timer size={11} strokeWidth={2} /> {elapsedSince(alert.created_at)} elapsed
                </span>
                {alert.updated_at && (
                  <span className="ks-chip ks-chip--ghost">
                    <Satellite size={11} strokeWidth={2} /> Last ping {clockTime(alert.updated_at)}
                  </span>
                )}
              </div>

              <div className="ks-grid2">
                <div className="ks-kv">
                  <div className="ks-kv__k"><MapPin size={10} strokeWidth={2.2} /> Latitude</div>
                  <div className="ks-kv__v">{Number(alert.latitude).toFixed(6)}</div>
                </div>
                <div className="ks-kv">
                  <div className="ks-kv__k"><MapPin size={10} strokeWidth={2.2} /> Longitude</div>
                  <div className="ks-kv__v">{Number(alert.longitude).toFixed(6)}</div>
                </div>
                {away !== null && (
                  <div className="ks-kv">
                    <div className="ks-kv__k"><Navigation size={10} strokeWidth={2.2} /> From control room</div>
                    <div className="ks-kv__v">{formatDistance(away)}</div>
                  </div>
                )}
              </div>

              <div className="ks-actions" onClick={(e) => e.stopPropagation()}>

                <a
                  className="ks-btn ks-btn--sm"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${alert.latitude},${alert.longitude}&travelmode=driving`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Navigation size={14} strokeWidth={1.9} /> Navigate
                </a>

                <button className="ks-btn ks-btn--ghost ks-btn--sm" onClick={() => copyCoordinates(alert)}>
                  {copiedId === alert.id
                    ? <><Check size={14} strokeWidth={2.2} /> Copied</>
                    : <><Copy size={14} strokeWidth={1.9} /> Coordinates</>}
                </button>

                <button
                  className="ks-btn ks-btn--success ks-btn--sm"
                  onClick={() => handleAlert(alert.id)}
                >
                  <Check size={14} strokeWidth={2.2} /> Handle Alert
                </button>

              </div>

            </article>
          );
        })}

      </div>
    </section>
  );

  const sidePanel = (
    <aside className="ks-mappanel">

      <div className="ks-card">

        <div className="ks-card__head">
          <MapPin size={15} strokeWidth={1.8} />
          <h2>Live Position</h2>
          {selected && <span className="ks-chip ks-chip--red"><span className="ks-dot ks-dot--red" /> Tracking</span>}
        </div>

        {selected ? (
          <>
            <div className="ks-mapwrap">
              <iframe
                className="ks-map"
                title="Live emergency position"
                src={osmEmbed(Number(selected.latitude), Number(selected.longitude))}
                loading="lazy"
              />
            </div>

            <div className="ks-card__body" style={{ display: "grid", gap: 12 }}>

              <div className="ks-list">
                <div className="ks-list__row">
                  <User size={14} strokeWidth={1.8} style={{ color: "var(--muted)" }} />
                  <span style={{ color: "var(--muted)" }}>Caller</span>
                  <b>{selected.user_name}</b>
                </div>
                <div className="ks-list__row">
                  <Phone size={14} strokeWidth={1.8} style={{ color: "var(--muted)" }} />
                  <span style={{ color: "var(--muted)" }}>Phone</span>
                  <b>{selected.phone}</b>
                </div>
                <div className="ks-list__row">
                  <Siren size={14} strokeWidth={1.8} style={{ color: "var(--muted)" }} />
                  <span style={{ color: "var(--muted)" }}>SOS raised</span>
                  <b>{stamp(selected.created_at)}</b>
                </div>
                <div className="ks-list__row">
                  <Satellite size={14} strokeWidth={1.8} style={{ color: "var(--muted)" }} />
                  <span style={{ color: "var(--muted)" }}>Last ping</span>
                  <b>{selected.updated_at ? clockTime(selected.updated_at) : "—"}</b>
                </div>
                <div className="ks-list__row">
                  <MapPin size={14} strokeWidth={1.8} style={{ color: "var(--muted)" }} />
                  <span style={{ color: "var(--muted)" }}>Coordinates</span>
                  <b>{Number(selected.latitude).toFixed(5)}, {Number(selected.longitude).toFixed(5)}</b>
                </div>
              </div>

              <div className="ks-actions">
                <a
                  className="ks-btn ks-btn--sm"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selected.latitude},${selected.longitude}&travelmode=driving`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Navigation size={14} strokeWidth={1.9} /> Navigate to caller
                </a>
                <button className="ks-btn ks-btn--ghost ks-btn--sm" onClick={() => copyCoordinates(selected)}>
                  {copiedId === selected.id
                    ? <><Check size={14} strokeWidth={2.2} /> Copied</>
                    : <><Copy size={14} strokeWidth={1.9} /> Copy position</>}
                </button>
              </div>

            </div>
          </>
        ) : (
          <div className="ks-empty">
            <MapPin size={22} strokeWidth={1.6} />
            <h3>No position to track</h3>
            <p>Select an alert to plot the caller's live coordinates.</p>
          </div>
        )}

      </div>

      <SafetyResources
        compact
        origin={
          selected
            ? { lat: Number(selected.latitude), lon: Number(selected.longitude) }
            : null
        }
        title="Response Units Near The Caller"
        caption={
          selected
            ? `Searching around ${selected.user_name}'s live position`
            : "Select an alert to search around its position"
        }
        placeholder="Select an alert on the feed first."
      />

    </aside>
  );

  return (
    <CommandShell
      title={feedOnly ? "Live Alerts" : "Emergency Operations"}
      alertCount={alerts.length}
      syncLabel={feedError ? "Retrying" : `Live · ${prefs.refreshIntervalMs / 1000}s`}
      syncLive={!feedError}
    >
      {!feedOnly && statsRow}
      {feedOnly ? feed : <div className="ks-split">{feed}{sidePanel}</div>}
    </CommandShell>
  );
}
