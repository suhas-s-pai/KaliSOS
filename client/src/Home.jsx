import { useState, useRef } from "react";
import axios from "axios";

export default function Home() {

  const user = JSON.parse(localStorage.getItem("user"))
  const [status,setStatus] = useState("Ready");
  const [listening,setListening] = useState(false);
  const [mapLink,setMapLink] = useState("");
  const recognitionRef = useRef(null);

 const startListening = () => {

const SpeechRecognition =
window.SpeechRecognition || window.webkitSpeechRecognition;

if(!SpeechRecognition){
alert("Speech recognition not supported");
return;
}

const recognition = new SpeechRecognition();

recognition.continuous = true;
recognition.interimResults = false;

recognitionRef.current = recognition;

setListening(true);
setStatus("Voice protection active");

recognition.onresult = (event)=>{

const speech =
event.results[event.results.length-1][0].transcript.toLowerCase();

if(speech.includes("help me") || speech.includes("sos")){
triggerSOS();
}

};

recognition.onend = () => {

if(listening && recognitionRef.current){
recognitionRef.current.start();
}

};

recognition.start();

};


  const stopListening = () => {

setListening(false);

if(recognitionRef.current){
recognitionRef.current.stop();
}

setStatus("Voice protection stopped");

};


  const triggerSOS = () => {

    setStatus("Getting location...");

    navigator.geolocation.getCurrentPosition(async(pos)=>{

      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      const mapURL = `https://maps.google.com/?q=${lat},${lon}`;
      setMapLink(mapURL);

      try{

        await axios.post("http://localhost:5000/sos",{
         user_name:user.name,
         phone:user.phone,
         latitude:lat,
         longitude:lon
        });

        setStatus("🚨 SOS Alert Sent");

      }catch{
        setStatus("Error sending alert");
      }

    });

  };


  return(

  <div className="page">

    <div className="teamBrand">
  SpringX
</div>

    <div className="panel">

      <h1 className="logo">ShankSOS</h1>

      <p className="subtitle">
        Voice Activated Emergency Safety Platform
      </p>


      <div className="centerArea">

        <button
        className={`voiceCircle ${listening ? "voiceOn" : "voiceOff"}`}
        onClick={listening ? stopListening : startListening}
        >
        🎤
        <span>
        {listening ? "Voice Protection ON" : "Voice Protection OFF"}
        </span>
        </button>

        <button className="sosButton" onClick={triggerSOS}>
          SOS
        </button>

      </div>


      <div className="statusBox">
        Status: {status}
      </div>

      {mapLink && (
        <a
          href={mapLink}
          target="_blank"
          rel="noreferrer"
          className="mapLink"
        >
          View Emergency Location
        </a>
      )}

    </div>


    <div className="footer">
      Your voice can be your strongest signal for safety.
    </div>



<style>{`

.page{
height:100vh;
width:100vw;
display:flex;
flex-direction:column;
justify-content:center;
align-items:center;
font-family:Inter,sans-serif;
background:linear-gradient(135deg,#ff5f6d,#ffc371,#6a11cb,#2575fc);
background-size:400% 400%;
animation:gradientMove 12s ease infinite;
color:white;
}

@keyframes gradientMove{
0%{background-position:0% 50%;}
50%{background-position:100% 50%;}
100%{background-position:0% 50%;}
}

.teamBrand{
position:absolute;
top:25px;
left:35px;
font-size:32px;
font-weight:700;
letter-spacing:2px;

color:#ffd166;

text-shadow:0 2px 8px rgba(0,0,0,0.4);

z-index:10;
}

/* WIDER PANEL */

.panel{
background:rgba(0,0,0,0.35);
backdrop-filter:blur(12px);
border-radius:25px;
padding:70px;
box-shadow:0 30px 80px rgba(0,0,0,0.5);
text-align:center;
width:520px;
}

.logo{
font-size:64px;
margin-top:10px;
margin-bottom:10px;
}
.subtitle{
opacity:0.9;
margin-bottom:40px;
font-size:18px;
}

.centerArea{
display:flex;
flex-direction:column;
align-items:center;
gap:30px;
}

/* MAIN VOICE BUTTON */

.voiceCircle{
width:260px;
height:260px;
border-radius:50%;
border:none;
background:linear-gradient(135deg,#ff4d6d,#ff9a44);
color:white;
font-size:48px;
cursor:pointer;
display:flex;
flex-direction:column;
align-items:center;
justify-content:center;
gap:8px;
box-shadow:0 20px 70px rgba(0,0,0,0.5);
transition:.3s;
animation:pulse 2.5s infinite;
}

.voiceCircle span{
font-size:16px;
font-weight:500;
}

.voiceCircle:hover{
transform:scale(1.12);
}

/* PULSE EFFECT */

@keyframes pulse{
0%{box-shadow:0 0 0 0 rgba(255,100,100,.6)}
70%{box-shadow:0 0 0 40px rgba(255,100,100,0)}
100%{box-shadow:0 0 0 0 rgba(255,100,100,0)}
}

/* SOS BUTTON */

.sosButton{
padding:16px 44px;
font-size:20px;
border-radius:40px;
border:none;
background:linear-gradient(135deg,#36d1dc,#5b86e5);
color:white;
cursor:pointer;
transition:.3s;
}

.sosButton:hover{
transform:scale(1.07);
box-shadow:0 0 25px #5b86e5;
}

.statusBox{
margin-top:30px;
font-size:16px;
opacity:0.95;
}

.mapLink{
display:block;
margin-top:12px;
color:#ffe066;
font-weight:bold;
}

.footer{
position:absolute;
bottom:25px;
font-size:15px;
opacity:0.85;
}

.voiceOff{
background:linear-gradient(135deg,#6c757d,#495057);
animation:none;
}

.voiceOn{
background:linear-gradient(135deg,#ff4d6d,#ff9a44);
animation:voicePulse 1.8s infinite;
box-shadow:0 0 25px rgba(255,80,80,0.7);
}

@keyframes voicePulse{
0%{transform:scale(1)}
50%{transform:scale(1.08)}
100%{transform:scale(1)}
}

`}</style>

  </div>

  );

}