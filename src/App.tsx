import { useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import "./App.scss";
import Search from "./components/Search";
import Slider from "./components/Slider";
import Clock from "./components/Clock";
import Settings from "./components/Settings";
import { WallClock, settingsManager } from "./config/settings-manager";
import useRequestAnimationFrame from "./hooks/useRequestAnimationFrame";
import { getVersion } from "@tauri-apps/api/app";
import { simpleUpdateRoutine } from "./utils/update";

function App() {
  const [globalTimeOffset, setGlobalTimeOffsetMinutes] = useState(0);
  const [is24Hours, setIs24Hours] = useState(
    settingsManager.getCache("userSettings.is24Hours")
  );
  const [clocks, setClocks] = useState<WallClock[]>(
    settingsManager.getCache("clocks")
  );
  const [version, setVersion] = useState<string>();

  // Initalise App
  useLayoutEffect(() => {
    invoke("init_spotlight_window").catch((error) => {
      console.error("Failed to initialise the menu bar panel", error);
    });
    getVersion().then((appVersion) => {
      setVersion(
        import.meta.env.VITE_LOCAL_BUILD_REVISION
          ? `${appVersion}+${import.meta.env.VITE_LOCAL_BUILD_REVISION}`
          : appVersion
      );
    });
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
  

  const updateTimeFormat = async (nextIs24Hours: boolean) => {
    const previousIs24Hours = settingsManager.getCache(
      "userSettings.is24Hours"
    );
    settingsManager.setCache("userSettings.is24Hours", nextIs24Hours);

    try {
      await settingsManager.syncCache();
      setIs24Hours(nextIs24Hours);
    } catch (error) {
      settingsManager.setCache(
        "userSettings.is24Hours",
        previousIs24Hours
      );
      throw error;
    }
  };

  return (
    <div className="app">
      <Search updateNewClocks={(clocks) => setClocks([...clocks])} />
      <Slider is24Hour={is24Hours} onChange={setGlobalTimeOffsetMinutes} />

      <section className="clock">
        {clocks.map((clock, index) => {
          return (
            <Clock
              globalTimeOffsetMinutes={globalTimeOffset}
              timezoneOffsetHours={clock.timezoneOffsetHours}
              timeZoneId={clock.timeZoneId}
              is24Hour={is24Hours}
              clockName={clock.clockName}
              id={index.toString()}
              updateNewClocks={(clocks) => setClocks([...clocks])}
            />
          );
        })}
      </section>
      <Settings
        is24Hours={is24Hours}
        on24HourChange={updateTimeFormat}
        version={version}
        onCheckForUpdates={() => simpleUpdateRoutine(setVersion)}
      />
      <section className="quit">
        <button onClick={() => invoke("quit")} className="btn exit">
          Quit&nbsp;<span className="app-name"></span>
        </button>
      </section>
    </div>
  );
}

export default App;
