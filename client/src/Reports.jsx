import { useEffect, useState } from "react";
import axios from "axios";
import {
  Search,
  Download,
  Printer,
  Users,
  Timer,
  FileText,
  Navigation,
} from "lucide-react";
import CommandShell from "./CommandShell";
import { API_BASE } from "./api";

// Re-evaluated on each 10s refresh, which is as often as the table changes.
function waitingFor(createdAt) {
  const minutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * Incident reporting over the live feed.
 *
 * The API exposes active alerts only, so this reports on what is currently
 * open. CSV export and print-to-PDF operate on the real rows on screen.
 */
export default function Reports() {
  const [alerts, setAlerts] = useState([]);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await axios.get(`${API_BASE}/alerts`);
        if (!cancelled) setAlerts(res.data);
      } catch {
        /* the top bar reports reachability */
      }
    };

    load();
    const timer = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const term = query.trim().toLowerCase();

  const rows = alerts.filter((a) => {
    if (term) {
      const haystack = `${a.user_name} ${a.phone} ${a.latitude} ${a.longitude}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    if (status !== "all" && a.status !== status) return false;

    const created = new Date(a.created_at);
    if (from && created < new Date(`${from}T00:00:00`)) return false;
    if (to && created > new Date(`${to}T23:59:59`)) return false;

    return true;
  });

  const oldest = rows.reduce(
    (worst, r) => (!worst || new Date(r.created_at) < new Date(worst.created_at) ? r : worst),
    null
  );

  const oldestLabel = oldest ? waitingFor(oldest.created_at) : "—";

  const exportCsv = () => {
    const header = ["id", "name", "phone", "latitude", "longitude", "status", "created_at", "updated_at"];
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [r.id, r.user_name, r.phone, r.latitude, r.longitude, r.status, r.created_at, r.updated_at]
          .map(escape)
          .join(",")
      ),
    ].join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kalisos-incidents-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <CommandShell
      title="Reports"
      alertCount={alerts.length}
      syncLabel="Live · 10s"
      syncLive
    >

      <section className="ks-stats">

        <article className="ks-stat">
          <div className="ks-stat__top"><FileText size={15} strokeWidth={1.8} /><span>Rows Matched</span></div>
          <p className="ks-stat__value">{rows.length}</p>
          <p className="ks-stat__meta">of {alerts.length} open incidents</p>
        </article>

        <article className="ks-stat ks-stat--green">
          <div className="ks-stat__top"><Users size={15} strokeWidth={1.8} /><span>Callers</span></div>
          <p className="ks-stat__value">{new Set(rows.map((r) => r.phone)).size}</p>
          <p className="ks-stat__meta">Distinct handsets in this selection</p>
        </article>

        <article className="ks-stat ks-stat--amber">
          <div className="ks-stat__top"><Timer size={15} strokeWidth={1.8} /><span>Oldest In Queue</span></div>
          <p className="ks-stat__value ks-stat__value--sm">{oldestLabel}</p>
          <p className="ks-stat__meta">Time since the earliest matched alert</p>
        </article>

      </section>

      <div className="ks-card">

        <div className="ks-toolbar">

          <div className="ks-searchwrap">
            <Search size={15} strokeWidth={1.8} />
            <input
              className="ks-input"
              placeholder="Search name, phone or coordinates"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <input
            className="ks-input"
            style={{ width: "auto" }}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            title="From date"
          />

          <input
            className="ks-input"
            style={{ width: "auto" }}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            title="To date"
          />

          <select
            className="ks-select"
            style={{ width: "auto" }}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="handled">Handled</option>
          </select>

          <button className="ks-btn ks-btn--ghost ks-btn--sm" onClick={exportCsv} disabled={!rows.length}>
            <Download size={14} strokeWidth={1.9} /> CSV
          </button>

          <button className="ks-btn ks-btn--ghost ks-btn--sm" onClick={() => window.print()}>
            <Printer size={14} strokeWidth={1.9} /> PDF
          </button>

        </div>

        {rows.length === 0 ? (
          <div className="ks-empty">
            <FileText size={22} strokeWidth={1.6} />
            <h3>No incidents match</h3>
            <p>
              {alerts.length
                ? "Adjust the search or date range."
                : "No active incidents. Handled alerts are not returned by the current API."}
            </p>
          </div>
        ) : (
          <div className="ks-tablewrap">
            <table className="ks-table">
              <thead>
                <tr>
                  <th>Caller</th>
                  <th>Phone</th>
                  <th>Coordinates</th>
                  <th>Raised</th>
                  <th>Last Ping</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <span className="ks-avatar ks-avatar--sm">
                          {String(r.user_name || "?").trim().charAt(0).toUpperCase()}
                        </span>
                        <strong style={{ fontWeight: 500 }}>{r.user_name}</strong>
                      </div>
                    </td>
                    <td className="ks-mono">{r.phone}</td>
                    <td className="ks-mono">
                      {Number(r.latitude).toFixed(4)}, {Number(r.longitude).toFixed(4)}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {new Date(r.created_at).toLocaleString("en-IN", {
                        day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
                      })}
                    </td>
                    <td style={{ whiteSpace: "nowrap", color: "var(--muted)" }}>
                      {r.updated_at
                        ? new Date(r.updated_at).toLocaleTimeString("en-IN", {
                            hour: "2-digit", minute: "2-digit", hour12: false,
                          })
                        : "—"}
                    </td>
                    <td>
                      <span className={`ks-chip ${r.status === "handled" ? "ks-chip--green" : "ks-chip--red"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <a
                        className="ks-btn ks-btn--ghost ks-btn--sm"
                        href={`https://www.google.com/maps/dir/?api=1&destination=${r.latitude},${r.longitude}&travelmode=driving`}
                        target="_blank"
                        rel="noreferrer"
                        title="Open directions"
                      >
                        <Navigation size={13} strokeWidth={1.9} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

    </CommandShell>
  );
}
