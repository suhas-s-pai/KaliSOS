import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BrowserRouter } from "react-router-dom";
import { applyAppearance } from "./prefs";
import "./styles.css";

// Theme, density and motion are attributes on <html>. Applying them before the
// first render avoids a flash of the default dark theme for a light-mode user.
applyAppearance();

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
