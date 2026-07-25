import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

const showBootstrapError = (message: string) => {
  const root = document.getElementById("root");
  if (!root) return;

  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1f5f9;padding:24px;font-family:Inter,Segoe UI,sans-serif;">
      <div style="max-width:720px;background:#ffffff;border:1px solid #fecaca;border-radius:24px;padding:24px;box-shadow:0 12px 30px rgba(15,23,42,0.08);">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#dc2626;">Bootstrap Error</div>
        <h1 style="margin:10px 0 0;font-size:28px;line-height:1.2;color:#0f172a;">The dashboard failed before React could fully render</h1>
        <p style="margin:12px 0 0;font-size:14px;line-height:1.7;color:#475569;">
          This usually means the app hit a startup or module error very early. Share the message below and we can fix it directly.
        </p>
        <pre style="margin-top:16px;overflow:auto;border-radius:18px;background:#020617;padding:16px;color:#e2e8f0;font-size:13px;line-height:1.6;">${message}</pre>
      </div>
    </div>
  `;
};

// Once React has mounted, a stray async error (e.g. a lightweight-charts resize
// assertion) must NOT replace the whole running dashboard — log it and move on.
// The full-screen bootstrap error is only for genuine pre-render startup failures.
let booted = false;

window.addEventListener("error", (event) => {
  const message = String(event.error?.message ?? event.message ?? "");
  // ResizeObserver loop notifications are benign browser behaviour, not real errors
  if (message.includes("ResizeObserver loop")) return;
  if (booted) {
    console.error("Runtime error (app kept running):", event.error ?? event.message);
    return;
  }
  console.error("Global bootstrap error:", event.error ?? event.message);
  showBootstrapError(message || "Unknown window error");
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
  if (booted) return;
  const message =
    event.reason instanceof Error ? event.reason.message : typeof event.reason === "string" ? event.reason : JSON.stringify(event.reason);
  showBootstrapError(message);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Mark as booted after the first paint so early module/render errors still show
// the bootstrap screen, but later runtime hiccups don't nuke the dashboard.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    booted = true;
  });
});
