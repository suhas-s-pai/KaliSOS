import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  UserRound,
  Bell,
  Mic,
  MapPin,
  Compass,
  Palette,
  Server,
  Info,
  Sun,
  Moon,
  Volume2,
  Play,
  Square,
  RefreshCw,
  LocateFixed,
  ShieldCheck,
  Hospital,
  Flame,
  Database,
  Activity,
  Rocket,
  Layers,
  Gauge,
  RotateCcw,
} from "lucide-react";
import CommandShell from "./CommandShell";
import { API_BASE } from "./api";
import { APP_INFO, ENVIRONMENT } from "./appInfo";
import { locate } from "./nearby";
import {
  usePrefs,
  setPrefs,
  resetPrefs,
  readLastFix,
  saveLastFix,
  readHealth,
  voiceProfile,
  REFRESH_CHOICES,
  RADIUS_CHOICES,
  VOICE_PROFILES,
} from "./prefs";
import {
  SettingsCard,
  SettingRow,
  Toggle,
  Segmented,
  StatusPill,
  Readout,
} from "./SettingsControls";

const SECTIONS = [
  { id: "operator", label: "Operator", icon: UserRound },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "voice", label: "Voice", icon: Mic },
  { id: "location", label: "Location", icon: MapPin },
  { id: "maps", label: "Maps", icon: Compass },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "system", label: "System", icon: Server },
  { id: "about", label: "About", icon: Info },
];

// The SOS ping cadence and the handled-status poll are fixed in Home. They are
// reported here as facts about the running app, not offered as settings.
const SOS_PING_MS = 5000;
const STATUS_POLL_MS = 3000;

const MIC_TEST_MS = 4000;

/* ---------- pure formatting helpers ---------- */

// `now` is passed in so nothing impure runs during render.
function agoLabel(timestamp, now) {
  if (!timestamp) return null;
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function clockLabel(timestamp) {
  return new Date(timestamp).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

function permissionPill(state) {
  if (state === "granted") return { state: "ok", text: "Granted" };
  if (state === "denied") return { state: "bad", text: "Denied" };
  if (state === "prompt") return { state: "warn", text: "Will ask" };
  return { state: "idle", text: "Unknown" };
}

export default function Settings() {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const prefs = usePrefs();

  /* Ticks only so relative timestamps stay honest while the page is open. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  /* ---------------- capability detection ---------------- */

  const [caps] = useState(() => ({
    voice: Boolean(
      typeof window !== "undefined" &&
        (window.SpeechRecognition || window.webkitSpeechRecognition)
    ),
    geolocation: typeof navigator !== "undefined" && "geolocation" in navigator,
    microphone: Boolean(navigator.mediaDevices?.getUserMedia),
    notifications: typeof Notification !== "undefined",
    secure:
      typeof window !== "undefined" &&
      (window.isSecureContext || window.location.hostname === "localhost"),
  }));

  const [geoPermission, setGeoPermission] = useState("unknown");
  const [micPermission, setMicPermission] = useState("unknown");
  const [notifyPermission, setNotifyPermission] = useState(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );

  useEffect(() => {
    let cancelled = false;
    if (!navigator.permissions?.query) return undefined;

    const read = (name, apply) =>
      navigator.permissions
        .query({ name })
        .then((result) => {
          if (cancelled) return;
          apply(result.state);
          // Reflects a permission changed from the browser's own UI while the
          // page stays open.
          result.onchange = () => !cancelled && apply(result.state);
        })
        .catch(() => {});

    read("geolocation", setGeoPermission);
    read("microphone", setMicPermission);

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------- system probe ---------------- */

  const [probe, setProbe] = useState({ state: "checking" });

  const runProbe = useCallback(async () => {
    setProbe({ state: "checking" });

    const started = performance.now();
    let backend;
    let api;

    try {
      const res = await axios.get(`${API_BASE}/`, { timeout: 10000 });
      const ms = Math.round(performance.now() - started);
      backend = { state: "ok", text: "Online", detail: `${ms} ms` };
      api = { state: "ok", text: `HTTP ${res.status}`, detail: `${ms} ms round trip` };
    } catch (error) {
      const status = error.response?.status;
      backend = { state: "bad", text: "Unreachable", detail: "No response from the API host" };
      api = {
        state: "bad",
        text: status ? `HTTP ${status}` : "No response",
        detail: status ? "Host answered with an error" : "Request failed or timed out",
      };
    }

    // There is no database health endpoint, and none is being added. GET
    // /alerts is the only route that touches Supabase on every call, so its
    // outcome is the honest signal — reported as inferred, not measured.
    let database;
    try {
      const res = await axios.get(`${API_BASE}/alerts`, { timeout: 12000 });
      database = {
        state: "ok",
        text: "Reachable",
        detail: `${Array.isArray(res.data) ? res.data.length : 0} active alerts returned`,
      };
    } catch (error) {
      const status = error.response?.status;
      database =
        status >= 500
          ? { state: "bad", text: "Query failing", detail: `/alerts returned HTTP ${status}` }
          : { state: "warn", text: "Not verifiable", detail: "The API did not respond" };
    }

    setProbe({ state: "done", backend, api, database, at: Date.now() });
  }, []);

  // Queued rather than called inline so the first render is not immediately
  // followed by a state update from inside the effect body.
  useEffect(() => {
    const timer = setTimeout(runProbe, 0);
    return () => clearTimeout(timer);
  }, [runProbe]);

  /* ---------------- microphone test ---------------- */

  const [mic, setMic] = useState({ state: "idle", level: 0, message: "" });
  const micRef = useRef(null);

  const stopMicTest = useCallback((result) => {
    const session = micRef.current;
    micRef.current = null;

    if (session) {
      cancelAnimationFrame(session.frame);
      session.stream.getTracks().forEach((track) => track.stop());
      session.context.close().catch(() => {});
    }

    if (result) setMic(result);
    else setMic((current) => ({ ...current, state: "idle", level: 0 }));
  }, []);

  useEffect(() => () => stopMicTest(), [stopMicTest]);

  const testMicrophone = async () => {
    if (micRef.current) {
      stopMicTest({ state: "idle", level: 0, message: "Test cancelled" });
      return;
    }

    setMic({ state: "testing", level: 0, message: "Speak normally…" });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);

      const buffer = new Uint8Array(analyser.fftSize);
      const startedAt = Date.now();
      let peak = 0;

      const session = { stream, context, frame: 0 };
      micRef.current = session;

      const sample = () => {
        if (micRef.current !== session) return;

        analyser.getByteTimeDomainData(buffer);

        // RMS of the waveform around the 128 midpoint, scaled so ordinary
        // speech lands near the top of the meter.
        let sum = 0;
        for (const value of buffer) {
          const deviation = (value - 128) / 128;
          sum += deviation * deviation;
        }
        const level = Math.min(1, Math.sqrt(sum / buffer.length) * 4);
        peak = Math.max(peak, level);

        setMic((current) =>
          current.state === "testing" ? { ...current, level } : current
        );

        if (Date.now() - startedAt >= MIC_TEST_MS) {
          stopMicTest(
            peak > 0.04
              ? { state: "ok", level: 0, message: `Microphone working · peak ${Math.round(peak * 100)}%` }
              : { state: "warn", level: 0, message: "No sound detected — check the input device" }
          );
          return;
        }

        session.frame = requestAnimationFrame(sample);
      };

      session.frame = requestAnimationFrame(sample);
      setMicPermission("granted");
    } catch (error) {
      micRef.current = null;
      setMic({
        state: "bad",
        level: 0,
        message:
          error.name === "NotAllowedError"
            ? "Microphone permission denied"
            : "No microphone available on this device",
      });
      if (error.name === "NotAllowedError") setMicPermission("denied");
    }
  };

  /* ---------------- location test ---------------- */

  const [lastFix, setLastFix] = useState(readLastFix);
  const [locTest, setLocTest] = useState({ state: "idle", message: "" });

  const testLocation = async () => {
    setLocTest({ state: "busy", message: "" });
    try {
      const fix = await locate();
      const stored = { ...fix, at: Date.now() };
      saveLastFix(stored);
      setLastFix(stored);
      setLocTest({ state: "ok", message: "Position acquired" });
      setGeoPermission("granted");
    } catch (error) {
      setLocTest({ state: "bad", message: error.message });
    }
  };

  /* ---------------- notifications ---------------- */

  const previewRef = useRef(null);

  const previewSound = () => {
    if (!previewRef.current) {
      previewRef.current = new Audio("/siren.mp3");
    }
    const audio = previewRef.current;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    setTimeout(() => {
      audio.pause();
      audio.currentTime = 0;
    }, 1200);
  };

  useEffect(() => () => previewRef.current?.pause(), []);

  // Storing the preference without the browser permission would leave a
  // notification that can never be shown, so the two are set together.
  const setDesktopNotifications = async (wanted) => {
    if (!wanted) {
      setPrefs({ desktopNotifications: false });
      return;
    }

    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();

    setNotifyPermission(permission);
    setPrefs({ desktopNotifications: permission === "granted" });
  };

  /* ---------------- derived ---------------- */

  const profile = voiceProfile(prefs.voiceSensitivity);
  const health = readHealth();
  const geoPill = permissionPill(geoPermission);
  const micPill = permissionPill(micPermission);

  const activeCategories =
    Number(prefs.showPolice) + Number(prefs.showHospitals) + Number(prefs.showFireStations);

  return (
    <CommandShell title="Settings" syncLabel="Stored on this device">

      <div className="ks-settings">

        <nav className="ks-settings__nav">
          {SECTIONS.map((section) => (
            <a className="ks-nav__item" href={`#${section.id}`} key={section.id}>
              <section.icon size={16} strokeWidth={1.8} />
              <span>{section.label}</span>
            </a>
          ))}
        </nav>

        <div className="ks-settings__body">

          {/* ---------------- Operator ---------------- */}

          <SettingsCard id="operator" icon={UserRound} title="Operator">
            <SettingRow title="Signed in as" hint="Held on this device only — there is no account service">
              <span className="ks-chip ks-chip--blue">{user?.name || "Unknown"}</span>
            </SettingRow>
            <SettingRow title="Contact number" hint="Transmitted with every SOS so responders can identify the caller">
              <Readout>{user?.phone || "—"}</Readout>
            </SettingRow>
            <SettingRow title="Secure context" hint="Voice and location APIs require HTTPS or localhost">
              <StatusPill state={caps.secure ? "ok" : "bad"}>
                {caps.secure ? "Secure" : "Insecure origin"}
              </StatusPill>
            </SettingRow>
          </SettingsCard>

          {/* ---------------- Notifications ---------------- */}

          <SettingsCard id="notifications" icon={Bell} title="Notifications">

            <SettingRow
              title="Notification sound"
              hint="Plays the siren on the dashboard when a new alert arrives"
            >
              <div className="ks-rowactions">
                <button
                  className="ks-btn ks-btn--ghost ks-btn--sm"
                  onClick={previewSound}
                  title="Play a short preview"
                >
                  <Volume2 size={13} strokeWidth={1.9} /> Preview
                </button>
                <Toggle
                  label="Notification sound"
                  checked={prefs.notificationSound}
                  onChange={(value) => setPrefs({ notificationSound: value })}
                />
              </div>
            </SettingRow>

            <SettingRow
              title="Browser notifications"
              hint={
                notifyPermission === "denied"
                  ? "Blocked in your browser settings — re-enable it there first"
                  : "Raises a system notification for alerts that arrive in a background tab"
              }
            >
              <div className="ks-rowactions">
                <StatusPill state={permissionPill(notifyPermission).state}>
                  {permissionPill(notifyPermission).text}
                </StatusPill>
                <Toggle
                  label="Browser notifications"
                  checked={prefs.desktopNotifications}
                  disabled={!caps.notifications || notifyPermission === "denied"}
                  onChange={setDesktopNotifications}
                />
              </div>
            </SettingRow>

            <SettingRow
              title="Dashboard refresh interval"
              hint="How often the control room polls the alert feed"
              stacked
            >
              <Segmented
                label="Dashboard refresh interval"
                value={prefs.refreshIntervalMs}
                onChange={(value) => setPrefs({ refreshIntervalMs: value })}
                options={REFRESH_CHOICES}
              />
            </SettingRow>

          </SettingsCard>

          {/* ---------------- Voice ---------------- */}

          <SettingsCard
            id="voice"
            icon={Mic}
            title="Voice Recognition"
            meta={
              <StatusPill state={caps.voice ? "ok" : "bad"}>
                {caps.voice ? "Web Speech API available" : "Not supported"}
              </StatusPill>
            }
          >

            <SettingRow
              title="Voice protection default"
              hint="Start listening automatically when the safety console opens"
            >
              <Toggle
                label="Voice protection default"
                checked={prefs.voiceDefaultOn}
                disabled={!caps.voice}
                onChange={(value) => setPrefs({ voiceDefaultOn: value })}
              />
            </SettingRow>

            <SettingRow
              title="Voice sensitivity"
              hint={profile.note}
              stacked
            >
              <Segmented
                label="Voice sensitivity"
                value={prefs.voiceSensitivity}
                onChange={(value) => setPrefs({ voiceSensitivity: value })}
                options={Object.entries(VOICE_PROFILES).map(([value, item]) => ({
                  value,
                  label: item.label,
                }))}
              />
            </SettingRow>

            <SettingRow
              title="Trigger phrases"
              hint="Matched against the live transcript at the current sensitivity"
              stacked
            >
              <div className="ks-phrases">
                {profile.phrases.map((phrase) => (
                  <span className="ks-phrase" key={phrase}>“{phrase}”</span>
                ))}
                <span className="ks-phrase ks-phrase--meta">
                  {profile.interim ? "unconfirmed speech counts" : "confirmed speech only"}
                </span>
              </div>
            </SettingRow>

            <SettingRow
              title="Microphone status"
              hint="Browser permission for audio capture"
            >
              <StatusPill state={caps.microphone ? micPill.state : "bad"}>
                {caps.microphone ? micPill.text : "No audio input API"}
              </StatusPill>
            </SettingRow>

            <SettingRow
              title="Test microphone"
              hint={mic.message || `Captures ${MIC_TEST_MS / 1000} seconds of audio and reports the peak input level`}
              stacked={mic.state === "testing"}
            >
              {mic.state === "testing" ? (
                <div className="ks-mictest">
                  <div className="ks-meter">
                    <div className="ks-meter__fill" style={{ width: `${Math.round(mic.level * 100)}%` }} />
                  </div>
                  <button className="ks-btn ks-btn--ghost ks-btn--sm" onClick={() => stopMicTest({ state: "idle", level: 0, message: "Test cancelled" })}>
                    <Square size={13} strokeWidth={2} /> Stop
                  </button>
                </div>
              ) : (
                <div className="ks-rowactions">
                  {mic.state !== "idle" && (
                    <StatusPill state={mic.state}>
                      {mic.state === "ok" ? "Passed" : mic.state === "warn" ? "Silent" : "Failed"}
                    </StatusPill>
                  )}
                  <button
                    className="ks-btn ks-btn--sm"
                    onClick={testMicrophone}
                    disabled={!caps.microphone}
                  >
                    <Play size={13} strokeWidth={2} /> Run test
                  </button>
                </div>
              )}
            </SettingRow>

          </SettingsCard>

          {/* ---------------- Location ---------------- */}

          <SettingsCard id="location" icon={MapPin} title="Location">

            <SettingRow title="GPS status" hint="Geolocation permission reported by the browser">
              <StatusPill state={caps.geolocation ? geoPill.state : "bad"}>
                {caps.geolocation ? geoPill.text : "Not available"}
              </StatusPill>
            </SettingRow>

            <SettingRow title="Tracking interval" hint="Position upload rate while an SOS is open">
              <Readout>{SOS_PING_MS / 1000}s</Readout>
            </SettingRow>

            <SettingRow title="Status poll" hint="How often the console checks whether responders closed the case">
              <Readout>{STATUS_POLL_MS / 1000}s</Readout>
            </SettingRow>

            <SettingRow title="Current accuracy" hint="Reported with the most recent fix">
              {lastFix?.accuracy ? (
                <Readout>±{Math.round(lastFix.accuracy)} m</Readout>
              ) : (
                <Readout muted>no fix yet</Readout>
              )}
            </SettingRow>

            <SettingRow
              title="Last known coordinates"
              hint={
                lastFix
                  ? `Captured at ${clockLabel(lastFix.at)} · ${agoLabel(lastFix.at, now)}`
                  : "Recorded when an SOS is raised or when you run the test below"
              }
            >
              {lastFix ? (
                <Readout>{lastFix.lat.toFixed(6)}, {lastFix.lon.toFixed(6)}</Readout>
              ) : (
                <Readout muted>—</Readout>
              )}
            </SettingRow>

            <SettingRow title="Test location" hint={locTest.message || "Requests a single high-accuracy fix and stores it above"}>
              <div className="ks-rowactions">
                {locTest.state !== "idle" && locTest.state !== "busy" && (
                  <StatusPill state={locTest.state}>
                    {locTest.state === "ok" ? "Passed" : "Failed"}
                  </StatusPill>
                )}
                <button
                  className="ks-btn ks-btn--sm"
                  onClick={testLocation}
                  disabled={!caps.geolocation || locTest.state === "busy"}
                >
                  <LocateFixed size={13} strokeWidth={1.9} className={locTest.state === "busy" ? "ks-spin" : undefined} />
                  {locTest.state === "busy" ? "Locating" : "Run test"}
                </button>
              </div>
            </SettingRow>

          </SettingsCard>

          {/* ---------------- Maps ---------------- */}

          <SettingsCard
            id="maps"
            icon={Compass}
            title="Maps &amp; Safety Resources"
            meta={
              <StatusPill state={activeCategories ? "ok" : "warn"}>
                {activeCategories} of 3 shown
              </StatusPill>
            }
          >

            <SettingRow
              title="Nearby search radius"
              hint="Starting radius. It widens automatically when too few facilities are mapped."
              stacked
            >
              <Segmented
                label="Nearby search radius"
                value={prefs.searchRadiusKm}
                onChange={(value) => setPrefs({ searchRadiusKm: value })}
                options={RADIUS_CHOICES}
              />
            </SettingRow>

            <SettingRow title="Police stations" hint="Show the police card in Safety Resources">
              <div className="ks-rowactions">
                <ShieldCheck size={15} strokeWidth={1.8} style={{ color: "var(--muted)" }} />
                <Toggle
                  label="Nearby police stations"
                  checked={prefs.showPolice}
                  onChange={(value) => setPrefs({ showPolice: value })}
                />
              </div>
            </SettingRow>

            <SettingRow title="Hospitals" hint="Show the hospital card in Safety Resources">
              <div className="ks-rowactions">
                <Hospital size={15} strokeWidth={1.8} style={{ color: "var(--muted)" }} />
                <Toggle
                  label="Nearby hospitals"
                  checked={prefs.showHospitals}
                  onChange={(value) => setPrefs({ showHospitals: value })}
                />
              </div>
            </SettingRow>

            <SettingRow title="Fire stations" hint="Show the fire and rescue card in Safety Resources">
              <div className="ks-rowactions">
                <Flame size={15} strokeWidth={1.8} style={{ color: "var(--muted)" }} />
                <Toggle
                  label="Nearby fire stations"
                  checked={prefs.showFireStations}
                  onChange={(value) => setPrefs({ showFireStations: value })}
                />
              </div>
            </SettingRow>

            <SettingRow title="Data source" hint={APP_INFO.dataSource}>
              <StatusPill state="ok">Free · no API key</StatusPill>
            </SettingRow>

            <SettingRow title="Result action" hint="Results open map directions only — this platform never places a call">
              <StatusPill state="ok">Navigation only</StatusPill>
            </SettingRow>

          </SettingsCard>

          {/* ---------------- Appearance ---------------- */}

          <SettingsCard id="appearance" icon={Palette} title="Appearance">

            <SettingRow title="Dark theme" hint="Light mode keeps the same layout with a daylight palette">
              <div className="ks-rowactions">
                {prefs.theme === "dark"
                  ? <Moon size={15} strokeWidth={1.8} style={{ color: "var(--muted)" }} />
                  : <Sun size={15} strokeWidth={1.8} style={{ color: "var(--muted)" }} />}
                <Toggle
                  label="Dark theme"
                  checked={prefs.theme === "dark"}
                  onChange={(value) => setPrefs({ theme: value ? "dark" : "light" })}
                />
              </div>
            </SettingRow>

            <SettingRow title="Compact dashboard" hint="Tightens spacing and type so more alerts fit on screen">
              <Toggle
                label="Compact dashboard"
                checked={prefs.compactDashboard}
                onChange={(value) => setPrefs({ compactDashboard: value })}
              />
            </SettingRow>

            <SettingRow title="Reduce animations" hint="Stops pulsing, drifting and entrance animations across the app">
              <Toggle
                label="Reduce animations"
                checked={prefs.reduceAnimations}
                onChange={(value) => setPrefs({ reduceAnimations: value })}
              />
            </SettingRow>

            <SettingRow title="Glass effects" hint="Turn off the background blur on panels — noticeably faster on older devices">
              <Toggle
                label="Glass effects"
                checked={prefs.glassEffects}
                onChange={(value) => setPrefs({ glassEffects: value })}
              />
            </SettingRow>

            <SettingRow title="Reset preferences" hint="Restores every setting on this page to its default">
              <button className="ks-btn ks-btn--ghost ks-btn--sm" onClick={resetPrefs}>
                <RotateCcw size={13} strokeWidth={1.9} /> Reset
              </button>
            </SettingRow>

          </SettingsCard>

          {/* ---------------- System ---------------- */}

          <SettingsCard
            id="system"
            icon={Server}
            title="System"
            meta={
              <button
                className="ks-btn ks-btn--ghost ks-btn--sm"
                onClick={runProbe}
                disabled={probe.state === "checking"}
              >
                <RefreshCw size={13} strokeWidth={1.9} className={probe.state === "checking" ? "ks-spin" : undefined} />
                Re-check
              </button>
            }
          >

            <SettingRow title="Backend status" hint={probe.backend?.detail || API_BASE.replace(/^https?:\/\//, "")}>
              <StatusPill state={probe.state === "checking" ? "busy" : probe.backend?.state}>
                {probe.state === "checking" ? "Checking" : probe.backend?.text}
              </StatusPill>
            </SettingRow>

            <SettingRow
              title="Supabase status"
              hint={probe.database?.detail || "Inferred from /alerts — the only route that queries the database"}
            >
              <StatusPill state={probe.state === "checking" ? "busy" : probe.database?.state}>
                {probe.state === "checking" ? "Checking" : probe.database?.text}
              </StatusPill>
            </SettingRow>

            <SettingRow title="API status" hint={probe.api?.detail || "Response to GET /"}>
              <StatusPill state={probe.state === "checking" ? "busy" : probe.api?.state}>
                {probe.state === "checking" ? "Checking" : probe.api?.text}
              </StatusPill>
            </SettingRow>

            <SettingRow title="Application version" hint="This build of the client">
              <Readout>v{APP_INFO.version}</Readout>
            </SettingRow>

            <SettingRow
              title="Last successful sync"
              hint={
                health.lastSyncAt
                  ? `Alert feed last returned data at ${clockLabel(health.lastSyncAt)}`
                  : "The dashboard has not completed a poll on this device yet"
              }
            >
              {health.lastSyncAt ? (
                <Readout>{agoLabel(health.lastSyncAt, now)}</Readout>
              ) : (
                <Readout muted>never</Readout>
              )}
            </SettingRow>

            <SettingRow title="Current environment" hint={API_BASE}>
              <span className={`ks-chip ${ENVIRONMENT === "Production" ? "ks-chip--green" : "ks-chip--amber"}`}>
                {ENVIRONMENT}
              </span>
            </SettingRow>

            <SettingRow
              title="Polling status"
              hint={
                health.lastAttemptAt
                  ? `Last attempt ${agoLabel(health.lastAttemptAt, now)} · ${health.lastOk ? "succeeded" : "failed"}`
                  : "Starts when the dashboard is open"
              }
            >
              <StatusPill state={health.lastAttemptAt ? (health.lastOk ? "ok" : "bad") : "idle"}>
                every {prefs.refreshIntervalMs / 1000}s
              </StatusPill>
            </SettingRow>

          </SettingsCard>

          {/* ---------------- About ---------------- */}

          <SettingsCard id="about" icon={Info} title={`About ${APP_INFO.name}`}>

            <SettingRow title="Project" hint={APP_INFO.tagline}>
              <span className="ks-chip ks-chip--red">{APP_INFO.name}</span>
            </SettingRow>

            <SettingRow title="Version" hint="Client build">
              <Readout>v{APP_INFO.version}</Readout>
            </SettingRow>

            <SettingRow title="Team" hint="Built by">
              <span className="ks-chip ks-chip--blue">{APP_INFO.team}</span>
            </SettingRow>

            <SettingRow title="Hackathon" hint="Submitted to">
              <span className="ks-chip ks-chip--ghost">{APP_INFO.hackathon}</span>
            </SettingRow>

            <SettingRow title="Frontend" hint="Client stack">
              <div className="ks-rowactions">
                <Layers size={15} strokeWidth={1.8} style={{ color: "var(--muted)" }} />
                <Readout>{APP_INFO.frontend}</Readout>
              </div>
            </SettingRow>

            <SettingRow title="Backend" hint="API stack">
              <div className="ks-rowactions">
                <Activity size={15} strokeWidth={1.8} style={{ color: "var(--muted)" }} />
                <Readout>{APP_INFO.backend}</Readout>
              </div>
            </SettingRow>

            <SettingRow title="Database" hint="Persistence">
              <div className="ks-rowactions">
                <Database size={15} strokeWidth={1.8} style={{ color: "var(--muted)" }} />
                <Readout>{APP_INFO.database}</Readout>
              </div>
            </SettingRow>

            <SettingRow title="Deployment" hint="Where each piece runs">
              <div className="ks-rowactions">
                <Rocket size={15} strokeWidth={1.8} style={{ color: "var(--muted)" }} />
                <Readout>{APP_INFO.deployment}</Readout>
              </div>
            </SettingRow>

            <SettingRow title="Preferences storage" hint="Every setting on this page is stored on this device only">
              <div className="ks-rowactions">
                <Gauge size={15} strokeWidth={1.8} style={{ color: "var(--muted)" }} />
                <Readout>localStorage</Readout>
              </div>
            </SettingRow>

          </SettingsCard>

        </div>

      </div>

    </CommandShell>
  );
}
