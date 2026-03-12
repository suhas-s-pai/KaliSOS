import { useState } from "react";

export default function Login({ setUser }) {

const [name,setName] = useState("");
const [phone,setPhone] = useState("")

const handleLogin = () => {

if(!name || !phone){
alert("Enter your details");
return;
}

const user = {name,phone};

localStorage.setItem("user",JSON.stringify(user));

setUser(user);
};

return(

<div className="page">

<div className="radar"></div>

<div className="radarDots">

<span className="dot"></span>
<span className="dot"></span>
<span className="dot"></span>
<span className="dot"></span>

<span className="thunder">⚡</span>

</div>

<div className="panel">

<h1 className="logo">KaliSOS</h1>

<p className="tag">
Emergency Voice Detection System
</p>

<input
className="loginInput"
type="text"
placeholder="Enter your name"
value={name}
onChange={(e)=>setName(e.target.value)}
onKeyDown={(e)=>{ if(e.key === "Enter") handleLogin(); }}
/>

<input
className="loginInput"
type="tel"
placeholder="Phone Number"
value={phone}
onChange={(e)=>setPhone(e.target.value)}
onKeyDown={(e)=>{ if(e.key === "Enter") handleLogin(); }}
/>

<button
onClick={handleLogin}
className="btn"
>
ENTER MONITORING SYSTEM
</button>

</div>


<style>{`

.page{
height:100vh;
display:flex;
justify-content:center;
align-items:center;
background:#020617;
font-family:Inter,sans-serif;
overflow:hidden;
position:relative;
}

/* RADAR */

.radar{
position:absolute;
width:700px;
height:700px;
border-radius:50%;
background:
radial-gradient(circle,rgba(255,60,60,0.15) 0%,transparent 65%);
animation:pulse 5s infinite ease-in-out;
}

.radar::before{
content:"";
position:absolute;
width:100%;
height:100%;
border-radius:50%;
border:2px solid rgba(255,80,80,0.3);
box-shadow:0 0 40px rgba(255,80,80,0.3);
}

.radar::after{
content:"";
position:absolute;
width:100%;
height:100%;
border-radius:50%;
background:conic-gradient(
rgba(255,80,80,0.6),
transparent 60%
);
animation:rotate 6s linear infinite;
}

@keyframes rotate{
0%{transform:rotate(0deg)}
100%{transform:rotate(360deg)}
}

@keyframes pulse{
0%{transform:scale(.92)}
50%{transform:scale(1)}
100%{transform:scale(.92)}
}

/* RADAR DOTS */

.radarDots{
position:absolute;
width:700px;
height:700px;
pointer-events:none;
}

.dot{
position:absolute;
width:10px;
height:10px;
background:#ff4b4b;
border-radius:50%;
box-shadow:0 0 10px #ff4b4b;
animation:blink 2s infinite;
}

/* positions */

.dot:nth-child(1){
top:20%;
left:65%;
animation-delay:0s;
}

.dot:nth-child(2){
top:70%;
left:25%;
animation-delay:1s;
}

.dot:nth-child(3){
top:40%;
left:85%;
animation-delay:.5s;
}

.dot:nth-child(4){
top:55%;
left:15%;
animation-delay:1.5s;
}

@keyframes blink{
0%{opacity:.2;transform:scale(.7);}
50%{opacity:1;transform:scale(1);}
100%{opacity:.2;transform:scale(.7);}
}

/* GOLDEN THUNDER SIGNAL */

.thunder{
position:absolute;
top:35%;
left:50%;
font-size:22px;
color:gold;
text-shadow:0 0 15px gold;
animation:flash 3s infinite;
}

@keyframes flash{
0%{opacity:0}
30%{opacity:1}
60%{opacity:0}
100%{opacity:0}
}

/* LOGIN PANEL */

.panel{
position:relative;
z-index:10;
background:rgba(0,0,0,0.6);
backdrop-filter:blur(20px);
padding:50px;
border-radius:20px;
width:380px;
text-align:center;
box-shadow:0 0 60px rgba(255,60,60,0.25);
}

/* TITLE */

.logo{
color:#ff4b4b;
font-size:44px;
margin-bottom:5px;
text-shadow:0 0 15px #ff4b4b;
}

.tag{
color:#94a3b8;
margin-bottom:30px;
}

/* INPUT */

.input{
width:100%;
padding:12px;
margin:12px 0;
border-radius:8px;
border:none;
outline:none;
background:#020617;
color:white;
border:1px solid rgba(255,255,255,0.1);
}

.input:focus{
border-color:#ff4b4b;
box-shadow:0 0 10px #ff4b4b;
}

/* BUTTON */

.btn{
margin-top:20px;
width:100%;
padding:14px;
border:none;
border-radius:10px;
font-weight:bold;
cursor:pointer;
color:white;
background:linear-gradient(135deg,#ff4b4b,#ff1e56);
transition:.3s;
}

.btn:hover{
transform:scale(1.05);
box-shadow:0 0 20px #ff4b4b;
}

/* MOBILE RESPONSIVE */

@media(max-width:600px){

.radar{
width:90vmin;
height:90vmin;
}

.radarDots{
width:90vmin;
height:90vmin;
}

.panel{
width:90%;
padding:35px;
}

.logo{
font-size:34px;
}

}

.loginInput{
width:100%;
padding:14px 18px;
margin-bottom:18px;
border-radius:30px;
border:1px solid rgba(255,255,255,0.25);
font-size:16px;
outline:none;

/* DARK GLASS STYLE */
background:rgba(0,0,0,0.45);
color:white;

box-shadow:0 4px 15px rgba(0,0,0,0.4);
transition:0.3s;
}

/* placeholder text */
.loginInput::placeholder{
color:rgba(255,255,255,0.65);
}

/* focus glow */
.loginInput:focus{
border:1px solid #ffd166;
box-shadow:0 0 12px rgba(255,209,102,0.6);
transform:scale(1.02);
}

`}</style>

</div>

);

}