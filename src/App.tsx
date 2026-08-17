import { useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import "./App.scss";
import Search from "./components/Search";
import Slider from "./components/Slider";
import Clock from "./components/Clock";
import { initializeGlobalShortcut } from "./config/settings-client";
import useRequestAnimationFrame from "./hooks/useRequestAnimationFrame";
import useSettingsSnapshot from "./hooks/useSettingsSnapshot";
import useSettingsShortcut, {
  openSettingsWindow,
} from "./hooks/useSettingsShortcut";

function App() {
  useSettingsShortcut();
  const [globalTimeOffset, setGlobalTimeOffsetMinutes] = useState(0);
  const { settings, error: settingsError } = useSettingsSnapshot();
  const is24Hours = settings?.userSettings.is24Hours ?? false;
  const clocks = settings?.clocks ?? [];

  // Initalise App
  useLayoutEffect(() => {
    let isCurrent = true;

    initializeGlobalShortcut()
      .then((update) => {
        if (isCurrent && update.error) {
          console.error(update.error);
        }
      })
      .catch((error) => {
        if (isCurrent) {
          console.error("Unable to initialise the global shortcut", error);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  // React To Window Size Changes
  const sizeRef = useRef<{height: number, width: number}>({height: 300, width: 300});
  useRequestAnimationFrame(async () => {
    const height = document.querySelector(".app")?.clientHeight ?? 300;
    const width = document.querySelector(".app")?.clientWidth ?? 300;
    if ((height && height != sizeRef.current.height) || (width && width != sizeRef.current.width)) {
      sizeRef.current = {height, width};
      await invoke("set_size", { height, width });
    }
  }, []);
  

  return (
    <div className="app">
      {settingsError ? (
        <p className="settings-error" role="alert">
          {settingsError}
        </p>
      ) : null}
      <Search />
      <Slider is24Hour={is24Hours} onChange={setGlobalTimeOffsetMinutes} />

      <section className="clock">
        {clocks.map((clock) => {
          return (
            <Clock
              key={clock.id}
              globalTimeOffsetMinutes={globalTimeOffset}
              timezoneOffsetHours={clock.timezoneOffsetHours}
              timeZoneId={clock.timeZoneId}
              is24Hour={is24Hours}
              clockName={clock.clockName}
              id={clock.id}
            />
          );
        })}
      </section>
      <section className="settings-link">
        <button
          type="button"
          className="btn"
          onClick={() => void openSettingsWindow()}
        >
          Settings…
          <span className="version gray">⌘,</span>
        </button>
      </section>
      <section className="quit">
        <button onClick={() => invoke("quit")} className="btn exit">
          Quit&nbsp;<span className="app-name"></span>
        </button>
      </section>
    </div>
  );
}

export default App;
