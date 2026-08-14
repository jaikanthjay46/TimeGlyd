import React from "react";
import ReactDOM from "react-dom/client";
import { appWindow } from "@tauri-apps/api/window";
import App from "./App";
import SettingsApp from "./SettingsApp";
import "./styles.css";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

if (appWindow.label === "settings") {
  root.render(
    <React.StrictMode>
      <SettingsApp />
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
