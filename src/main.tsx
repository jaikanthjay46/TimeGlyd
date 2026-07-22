import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/tauri";
import App from "./App";
import "./styles.css";
import { initializeSettings } from "./config/settings-manager";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

initializeSettings()
  .then(() => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Unable to initialize TimeGlyd settings", error);
    void invoke("report_frontend_error", { message });

    root.render(
      <main className="startup-error" role="alert">
        <strong>TimeGlyd could not load its settings.</strong>
        <span>{message}</span>
      </main>
    );
  });
