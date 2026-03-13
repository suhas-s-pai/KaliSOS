import { useEffect, useState } from "react";
import axios from "axios";

const siren = new Audio("/siren.mp3");
siren.loop = true;
siren.preload = "auto";

export default function Dashboard() {

  const [alerts, setAlerts] = useState([]);
  const [lastAlertCount, setLastAlertCount] = useState(0);

 useEffect(() => {

  // unlock audio
  document.body.addEventListener("click", () => {
    siren.play().then(()=>siren.pause()).catch(()=>{});
  }, { once: true });

  fetchAlerts();

  const interval = setInterval(() => {
    fetchAlerts();
  }, 2000);

  return () => clearInterval(interval);

}, []);

const fetchAlerts = async () => {

const res = await axios.get("https://kalisos-backend.onrender.com/alerts");

if(res.data.length > lastAlertCount){

  siren.currentTime = 0;
  siren.play().catch(()=>{});

  setTimeout(()=>{
    siren.pause();
    siren.currentTime = 0;
  },1000);

}

setLastAlertCount(res.data.length);
setAlerts(res.data);

};

  const handleAlert = async (id) => {

  await axios.delete(`https://kalisos-backend.onrender.com/alerts/${id}`);

  fetchAlerts();

};

  return (
    <div className="page">

      <div className="container">

        <h1 className="title">🚨 KaliSOS Monitoring Dashboard</h1>

        <p className="subtitle">
          Live Emergency Alerts & Location Monitoring
        </p>

        <div className="alertsGrid">

  {alerts.length === 0 && (
    <div className="empty">
      No alerts yet
    </div>
  )}

  {alerts.map((alert) => (

    <div className="alertCard" key={alert.id}>

  <h3>🚨 User Alert</h3>

  <p><strong>SOS Caller:</strong> {alert.user_name}</p>

  <p><strong>Phone:</strong> {alert.phone}</p>

  <p>📍 Latitude: {alert.latitude}</p>

  <p>📍 Longitude: {alert.longitude}</p>

  <p>
{new Date(alert.created_at + " UTC").toLocaleString("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true
})}
</p>

  <a
    href={`https://maps.google.com/?q=${alert.latitude},${alert.longitude}`}
    target="_blank"
    className="mapButton"
  >
    View Location
  </a>

  <button
    className="handleBtn"
    onClick={() => handleAlert(alert.id)}
  >
    Handled
  </button>

</div>

  ))}

</div>


<style>{`

.page{
min-height:100vh;
width:100%;
display:flex;
justify-content:center;
align-items:center;
background:linear-gradient(135deg,#ff416c,#ff4b2b);
font-family:Inter,sans-serif;
padding:40px;
}

.container{
width:90%;
max-width:1200px;
background:rgba(255,255,255,0.15);
backdrop-filter:blur(20px);
border-radius:25px;
padding:40px;
box-shadow:0 25px 60px rgba(0,0,0,0.3);
}

.title{
color:white;
font-size:42px;
text-align:center;
margin-bottom:10px;
}

.subtitle{
color:white;
text-align:center;
margin-bottom:40px;
opacity:.9;
}

.alertsGrid{
display:grid;
grid-template-columns:repeat(auto-fit,minmax(250px,1fr));
gap:25px;
}

.alertCard{
background:white;
border-radius:20px;
padding:25px;
box-shadow:0 10px 30px rgba(0,0,0,0.2);
transition:all .3s ease;
}

.alertCard:hover{
transform:translateY(-5px);
box-shadow:0 20px 40px rgba(0,0,0,0.3);
}

.alertCard h3{
color:#ff3c3c;
margin-bottom:15px;
}

.mapButton{
display:inline-block;
margin-top:10px;
padding:10px 18px;
border-radius:20px;
background:#ff3c3c;
color:white;
text-decoration:none;
font-weight:bold;
transition:all .3s ease;
}

.mapButton:hover{
background:#ff0000;
transform:scale(1.05);
}

.empty{
color:white;
font-size:18px;
text-align:center;
}

.handleBtn{
margin-top:5px;
margin-left:auto;
display:block;
padding:18px 26px;
border:none;
border-radius:15px;
background:#22c55e;
color:white;
cursor:pointer;
font-weight:bold;
transition:all .3s ease;
}

.handleBtn:hover{
background:#16a34a;
transform:scale(1.05);
}

`}</style>

      </div>

    </div>
  );
}