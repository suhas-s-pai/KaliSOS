import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  ShieldAlert,
  Mic,
  MicOff,
  MapPin,
  ExternalLink,
  LogOut,
  Satellite,
  Radio,
  LayoutDashboard,
} from "lucide-react";
import { API_BASE } from "./api";
import SafetyResources from "./SafetyResources";
import { usePrefs, getPrefs, voiceProfile, saveLastFix } from "./prefs";

export default function Home() {

const user = JSON.parse(localStorage.getItem("user"))
const prefs = usePrefs();
const [status,setStatus] = useState("Ready");
// Drives every status chip. Kept separate from the message text so a wording
// change can never alter behaviour.
const [phase,setPhase] = useState("idle");
const [listening,setListening] = useState(false);
const [mapLink,setMapLink] = useState("");
// Latest fix, refreshed by the tracking loop while an SOS is open.
const [coords,setCoords] = useState(null);
const recognitionRef = useRef(null);
const trackingRef = useRef(null);
const statusCheckRef = useRef(null);
const sosActiveRef = useRef(false);
// A recogniser outlives the render that created it, so it dispatches through
// a ref and always reaches the current handler.
const triggerSOSRef = useRef(null);

// The recogniser is created once per listening session, so the sensitivity in
// force when it started has to travel with it rather than be read from a
// closure that a later render replaced.
const profileRef = useRef(voiceProfile(prefs.voiceSensitivity));
useEffect(() => {
  profileRef.current = voiceProfile(prefs.voiceSensitivity);
}, [prefs.voiceSensitivity]);

// Timers and the microphone are process-wide; leaving this screen has to
// release both.
useEffect(() => () => {
  clearInterval(trackingRef.current);
  clearInterval(statusCheckRef.current);
  const recognition = recognitionRef.current;
  recognitionRef.current = null;
  if (recognition) {
    recognition.onend = null;
    recognition.stop();
  }
}, []);

 const startListening = () => {

const SpeechRecognition =
window.SpeechRecognition || window.webkitSpeechRecognition;

if(!SpeechRecognition){
alert("Speech recognition not supported");
return;
}

const recognition = new SpeechRecognition();

recognition.continuous = true;
// High sensitivity acts on unconfirmed speech, which reaches the handler a
// word or two sooner at the cost of the occasional misfire.
recognition.interimResults = profileRef.current.interim;

recognitionRef.current = recognition;

setListening(true);
setStatus("Voice protection active");

recognition.onresult = (event)=>{

const speech =
event.results[event.results.length-1][0].transcript.toLowerCase();

if(profileRef.current.phrases.some((phrase)=>speech.includes(phrase))){
triggerSOSRef.current?.();
}

};

// Chrome ends a continuous session after a silent stretch. Restarting keeps
// protection on — but only while the reference is still ours, so stopping
// really stops.
recognition.onend = () => {
  if (recognitionRef.current === recognition) {
    recognition.start();
  }
};

recognition.start();

};


  const stopListening = () => {

const recognition = recognitionRef.current;
recognitionRef.current = null;

setListening(false);

if(recognition){
recognition.onend = null;
recognition.stop();
}

setStatus("Voice protection stopped");

};

  // Holds the current starter so the mount-time auto-arm below needs no
  // dependency on a function that is rebuilt on every render.
  const startListeningRef = useRef(null);
  useEffect(() => {
    startListeningRef.current = startListening;
  });

  // Voice protection default (Settings → Voice). Deliberately mount-only:
  // turning the preference on later should not seize the microphone of a
  // console that is already open.
  useEffect(() => {
    if (!getPrefs().voiceDefaultOn) return;
    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) return;
    startListeningRef.current?.();
  }, []);

  // Every fix is mirrored to storage so Settings → Location can report the
  // last known position and its accuracy after this screen unmounts.
  const rememberFix = (position) => {
    const fix = {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      accuracy: position.coords.accuracy,
      at: Date.now(),
    };
    setCoords(fix);
    saveLastFix(fix);
    return fix;
  };


  const startLiveTracking = () => {

clearInterval(trackingRef.current);

trackingRef.current = setInterval(()=>{

navigator.geolocation.getCurrentPosition(async(pos)=>{

const lat = pos.coords.latitude;
const lon = pos.coords.longitude;

rememberFix(pos);

try{

await axios.post(`${API_BASE}/sos`,{
user_name:user.name,
phone:user.phone,
latitude:lat,
longitude:lon
});

}catch{
console.log("Tracking error");
}

});

},5000);

};


const checkIfHandled = () => {

clearInterval(statusCheckRef.current);

statusCheckRef.current = setInterval(async()=>{

try{

const res = await axios.get(`${API_BASE}/alert-status/${user.phone}`);
if(res.data.status === "handled"){

clearInterval(trackingRef.current);
clearInterval(statusCheckRef.current);

sosActiveRef.current = false;

setPhase("handled");
setStatus("Emergency handled by authorities");

}

}catch{
console.log("Status check failed");
}

},3000);

};

  // Declared after the two loops it starts, so neither is referenced before it
  // exists.
   const triggerSOS = () => {

    if(sosActiveRef.current) return;
    sosActiveRef.current = true;

    setPhase("locating");
    setStatus("Getting location...");

    navigator.geolocation.getCurrentPosition(async(pos)=>{

      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      const mapURL = `https://maps.google.com/?q=${lat},${lon}`;
      setMapLink(mapURL);
      rememberFix(pos);

      try{

        await axios.post(`${API_BASE}/sos`,{
         user_name:user.name,
         phone:user.phone,
         latitude:lat,
         longitude:lon
        });

        setPhase("sent");
        setStatus("SOS alert sent");
        startLiveTracking();
        checkIfHandled();

      }catch{
        // The alert never reached the control room, so the button has to arm
        // again instead of staying locked for the rest of the session.
        sosActiveRef.current = false;
        setPhase("error");
        setStatus("Could not send the alert");
      }

    }, () => {
      sosActiveRef.current = false;
      setPhase("error");
      setStatus("Location unavailable — allow location access");
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });

  };


  useEffect(() => {
    triggerSOSRef.current = triggerSOS;
  });


  /* ---------- derived display state ---------- */

  const tracking = phase === "sent";

  const emergency =
    phase === "handled" ? { text: "Help On The Way", dot: "ks-dot--green" }
    : phase === "error" ? { text: "Send Failed", dot: "ks-dot--red" }
    : phase === "sent" ? { text: "Alert Sent", dot: "ks-dot--red" }
    : phase === "locating" ? { text: "Sending Alert", dot: "ks-dot--amber" }
    : { text: "Idle", dot: "" };

  const voice = tracking
    ? { text: "SOS Activated", dot: "ks-dot--red" }
    : listening
    ? { text: "Listening", dot: "ks-dot--green" }
    : { text: "Not Listening", dot: "" };

  const gps = coords
    ? { text: "Location Found", dot: "ks-dot--green" }
    : { text: "Not Available", dot: "" };

  const locationState =
    phase === "sent" ? { text: "Live Tracking", chip: "ks-chip--red", dot: "ks-dot--red" }
    : phase === "handled" ? { text: "Responders Notified", chip: "ks-chip--green", dot: "ks-dot--green" }
    : phase === "locating" ? { text: "Acquiring Fix", chip: "ks-chip--amber", dot: "ks-dot--amber" }
    : { text: "Waiting for SOS", chip: "ks-chip--ghost", dot: "" };

  return (

  <div className="ks-home">

    <div className="ks-home__particles" aria-hidden="true">
      <i /><i /><i /><i /><i /><i />
    </div>

    <header className="ks-home__nav">

      <a className="ks-logo" href="/" style={{ marginBottom: 0, height: "auto" }}>
        <span className="ks-logo__mark"><ShieldAlert size={16} strokeWidth={2.1} /></span>
        <span className="ks-logo__text">Kali<span>SOS</span></span>
      </a>

      <div style={{ flex: 1 }} />

      <a className="ks-btn ks-btn--ghost ks-btn--sm" href="/dashboard" title="Control room">
        <LayoutDashboard size={14} strokeWidth={1.9} />
      </a>

      <div className="ks-badge-police" title={user?.phone}>
        <span className="ks-avatar ks-avatar--sm ks-avatar--neutral">
          {String(user?.name || "?").trim().charAt(0).toUpperCase()}
        </span>
        <span className="ks-badge-police__id">
          <strong>{user?.name}</strong>
          <span>{user?.phone}</span>
        </span>
      </div>

      <button
        className="ks-btn ks-btn--ghost ks-btn--sm"
        onClick={() => {
          localStorage.removeItem("user");
          window.location.reload();
        }}
        title="Logout"
      >
        <LogOut size={14} strokeWidth={1.9} />
      </button>

    </header>

    <main className="ks-home__main">

      <div className="ks-hero">

        <button
          className={`ks-sos${tracking ? " is-live" : ""}`}
          onClick={triggerSOS}
          disabled={phase === "locating"}
        >
          <span className="ks-sos__label">SOS</span>
          <small>{tracking ? "Alert active · location broadcasting" : "Send emergency alert"}</small>
        </button>

        <button
          className={`ks-voice ${listening ? "is-on" : ""}`}
          onClick={listening ? stopListening : startListening}
        >
          <span className="ks-voice__ring">
            {listening ? <Mic size={24} strokeWidth={1.7} /> : <MicOff size={24} strokeWidth={1.7} />}
          </span>
          <span className="ks-voice__text">
            <strong>{listening ? "Voice Protection On" : "Voice Protection Off"}</strong>
            <span>{listening ? "Listening for “help me”" : "Tap to activate hands free SOS"}</span>
          </span>
        </button>

      </div>

      <p className="ks-home__status">
        <span className={`ks-dot ${emergency.dot}`} />
        {status}
      </p>

      <div className="ks-statusgrid">
        <div className="ks-statuscell">
          <span className="ks-statuscell__k">Voice</span>
          <span className="ks-statuscell__v"><span className={`ks-dot ${voice.dot}`} />{voice.text}</span>
        </div>
        <div className="ks-statuscell">
          <span className="ks-statuscell__k">GPS</span>
          <span className="ks-statuscell__v"><span className={`ks-dot ${gps.dot}`} />{gps.text}</span>
        </div>
        <div className="ks-statuscell">
          <span className="ks-statuscell__k">Emergency</span>
          <span className="ks-statuscell__v"><span className={`ks-dot ${emergency.dot}`} />{emergency.text}</span>
        </div>
      </div>

      <div className="ks-card">

        <div className="ks-card__head">
          <MapPin size={15} strokeWidth={1.8} />
          <h2>Live Location</h2>
          <span className={`ks-chip ${locationState.chip}`}>
            {locationState.dot && <span className={`ks-dot ${locationState.dot}`} />}
            {locationState.text}
          </span>
        </div>

        <div className="ks-card__body">

          <div className="ks-grid2">

            <div className="ks-kv">
              <div className="ks-kv__k"><Satellite size={10} strokeWidth={2.2} /> Latitude</div>
              <div className={`ks-kv__v${coords ? "" : " ks-pending"}`}>
                {coords ? coords.lat.toFixed(6) : "—"}
              </div>
            </div>

            <div className="ks-kv">
              <div className="ks-kv__k"><Satellite size={10} strokeWidth={2.2} /> Longitude</div>
              <div className={`ks-kv__v${coords ? "" : " ks-pending"}`}>
                {coords ? coords.lon.toFixed(6) : "—"}
              </div>
            </div>

            <div className="ks-kv">
              <div className="ks-kv__k"><Radio size={10} strokeWidth={2.2} /> Status</div>
              <div className="ks-kv__v">{locationState.text}</div>
            </div>

          </div>

          {coords ? (
            <div className="ks-locmeta">
              <span>
                Accuracy ±{Math.round(coords.accuracy || 0)} m · updated{" "}
                {new Date(coords.at).toLocaleTimeString("en-IN", {
                  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
                })}
                {tracking && " · refreshing every 5s"}
              </span>
              {mapLink && (
                <a className="ks-btn ks-btn--ghost ks-btn--sm" href={mapLink} target="_blank" rel="noreferrer">
                  <ExternalLink size={13} strokeWidth={1.9} /> View on map
                </a>
              )}
            </div>
          ) : (
            <p className="ks-locmeta">
              <span>
                Your coordinates appear here the moment an alert is raised, then
                refresh continuously until responders close the case.
              </span>
            </p>
          )}

        </div>

      </div>

      <SafetyResources
        autoLocate
        origin={coords ? { lat: coords.lat, lon: coords.lon } : null}
        caption="Real locations from OpenStreetMap · opens directions, never a call"
        placeholder="Allow location access to search around you."
        onLocated={(point) => {
          // Never overwrite a live SOS fix with a one-off lookup.
          if (phase === "idle" || phase === "error") {
            const fix = { ...point, at: Date.now() };
            setCoords(fix);
            saveLastFix(fix);
            setMapLink(`https://maps.google.com/?q=${point.lat},${point.lon}`);
          }
        }}
      />

    </main>

  </div>

  );

}
