/**
 * App entry point. Mounts the root <App/> into #root (see index.html) inside
 * React.StrictMode, and imports the global stylesheet.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Apply the saved colour theme before mounting React so the first paint
// already uses the correct CSS tokens (no flash of the wrong theme).
try {
    const t = localStorage.getItem("compass.theme.v1");
    if (t === "light" || t === "dark") {
        document.documentElement.dataset.theme = t;
    }
} catch {
    /* ignore */
}

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
