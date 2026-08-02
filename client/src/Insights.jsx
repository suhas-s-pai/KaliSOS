import { useEffect, useState } from "react";
import axios from "axios";
import {
  BarChart3,
  Clock,
  MapPin,
  Users,
  Flame,
} from "lucide-react";
import CommandShell from "./CommandShell";
import { API_BASE } from "./api";

/**
 * Analytics over the live alert feed.
 *
 * GET /alerts returns alerts that are still active, so every figure here is
 * computed from the open queue. Historical series — daily volume, response
 * times, resolution rate — would need a history endpoint, so they are not
 * shown at all rather than shown as empty shells.
 */
export default function Insights() {
  const [alerts, setAlerts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // Captured when data arrives so the render stays pure.
  const [sampledAt, setSampledAt] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await axios.get(`${API_BASE}/alerts`);
        if (!cancelled) {
          setAlerts(res.data);
          setSampledAt(Date.now());
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    };

    load();
    const timer = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Distribution of currently-open alerts across the 24h clock.
  const byHour = Array.from({ length: 24 }, () => 0);
  alerts.forEach((a) => {
    const hour = new Date(a.created_at).getHours();
    if (!Number.isNaN(hour)) byHour[hour] += 1;
  });
  const peakCount = Math.max(1, ...byHour);
  const peakHour = byHour.indexOf(Math.max(...byHour));

  // Priority mix, using the same elapsed-time heuristic as the feed.
  const buckets = { P1: 0, P2: 0, P3: 0 };
  alerts.forEach((a) => {
    const minutes = (sampledAt - new Date(a.created_at).getTime()) / 60000;
    if (minutes < 3) buckets.P1 += 1;
    else if (minutes < 12) buckets.P2 += 1;
    else buckets.P3 += 1;
  });

  // Coarse clustering: coordinates rounded to ~1km so repeat locations group.
  const clusters = {};
  alerts.forEach((a) => {
    const key = `${Number(a.latitude).toFixed(2)}, ${Number(a.longitude).toFixed(2)}`;
    clusters[key] = (clusters[key] || 0) + 1;
  });
  const topClusters = Object.entries(clusters).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const devices = new Set(alerts.map((a) => a.phone)).size;

  return (
    <CommandShell
      title="Insights"
      alertCount={alerts.length}
      syncLabel={loaded ? "Live · 10s" : "Loading"}
      syncLive={loaded}
    >

      <section className="ks-stats">

        <article className="ks-stat ks-stat--red">
          <div className="ks-stat__top"><Flame size={15} strokeWidth={1.8} /><span>Open Now</span></div>
          <p className="ks-stat__value">{alerts.length}</p>
          <p className="ks-stat__meta">Currently active alerts</p>
        </article>

        <article className="ks-stat ks-stat--amber">
          <div className="ks-stat__top"><Clock size={15} strokeWidth={1.8} /><span>Peak Hour</span></div>
          <p className="ks-stat__value ks-stat__value--sm">
            {alerts.length ? `${String(peakHour).padStart(2, "0")}:00` : "—"}
          </p>
          <p className="ks-stat__meta">Busiest hour among open alerts</p>
        </article>

        <article className="ks-stat ks-stat--green">
          <div className="ks-stat__top"><MapPin size={15} strokeWidth={1.8} /><span>Distinct Zones</span></div>
          <p className="ks-stat__value">{topClusters.length}</p>
          <p className="ks-stat__meta">Coordinate clusters (~1km)</p>
        </article>

        <article className="ks-stat">
          <div className="ks-stat__top"><Users size={15} strokeWidth={1.8} /><span>Callers</span></div>
          <p className="ks-stat__value">{devices}</p>
          <p className="ks-stat__meta">Distinct handsets in the queue</p>
        </article>

      </section>

      <div className="ks-split" style={{ marginBottom: 16 }}>

        <div className="ks-card">
          <div className="ks-card__head">
            <BarChart3 size={15} strokeWidth={1.8} />
            <h2>Open Alerts by Hour</h2>
            <span className="ks-chip ks-chip--ghost">24h clock</span>
          </div>
          <div className="ks-card__body">
            {alerts.length === 0 ? (
              <div className="ks-empty">
                <h3>No open alerts</h3>
                <p>The hourly distribution populates as alerts arrive.</p>
              </div>
            ) : (
              <div className="ks-chart">
                {byHour.map((count, hour) => (
                  <div className="ks-bar" key={hour} title={`${hour}:00 — ${count} alert(s)`}>
                    <div
                      className={`ks-bar__fill${count === peakCount && count > 0 ? " ks-bar__fill--red" : ""}`}
                      style={{
                        height: `${(count / peakCount) * 100}%`,
                        animationDelay: `${hour * 12}ms`,
                      }}
                    />
                    {hour % 3 === 0 && <span className="ks-bar__label">{hour}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ks-card">
          <div className="ks-card__head">
            <Flame size={15} strokeWidth={1.8} />
            <h2>Priority Mix</h2>
          </div>
          <div className="ks-card__body">
            {alerts.length === 0 ? (
              <div className="ks-empty"><p>Nothing open right now.</p></div>
            ) : (
              <div className="ks-donut__legend">
                {[
                  { key: "P1", label: "P1 · Critical (<3m)", color: "var(--emergency)" },
                  { key: "P2", label: "P2 · Elevated (<12m)", color: "var(--warning)" },
                  { key: "P3", label: "P3 · Standing", color: "var(--accent)" },
                ].map(({ key, label, color }) => (
                  <div key={key} style={{ display: "grid", gap: 6 }}>
                    <div className="ks-donut__row">
                      <span className="ks-dot" style={{ background: color }} />
                      {label}
                      <b>{buckets[key]}</b>
                    </div>
                    <div className="ks-track">
                      <div
                        className="ks-track__fill"
                        style={{
                          width: `${(buckets[key] / Math.max(1, alerts.length)) * 100}%`,
                          background: color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      <div>

        <div className="ks-card">
          <div className="ks-card__head">
            <MapPin size={15} strokeWidth={1.8} />
            <h2>Most Common Locations</h2>
            <span className="ks-chip ks-chip--ghost">rounded to ~1km</span>
          </div>
          <div className="ks-card__body">
            {topClusters.length === 0 ? (
              <div className="ks-empty"><p>No coordinates to cluster.</p></div>
            ) : (
              <div className="ks-list">
                {topClusters.map(([key, count]) => (
                  <div className="ks-list__row" key={key}>
                    <MapPin size={14} strokeWidth={1.8} style={{ color: "var(--muted)" }} />
                    <span className="ks-mono">{key}</span>
                    <b>{count}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

    </CommandShell>
  );
}
