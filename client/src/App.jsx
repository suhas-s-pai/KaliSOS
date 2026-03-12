import { useState } from "react";
import Login from "./Login";
import { Routes, Route } from "react-router-dom";
import Dashboard from "./Dashboard";
import Home from "./Home";

export default function App() {

  const [user,setUser] = useState(
    JSON.parse(localStorage.getItem("user"))
  );

  // show login page first
  if(!user){
    return <Login setUser={setUser} />;
  }

  return (

    <Routes>

      <Route path="/" element={<Home user={user} />} />

      <Route path="/dashboard" element={<Dashboard user={user} />} />

    </Routes>

  );

}