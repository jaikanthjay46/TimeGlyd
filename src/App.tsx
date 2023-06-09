import { useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import "./App.scss";
import Search from "./components/Search";
import Slider from "./components/Slider";
import Clock from "./components/Clock";
import {
  enable as autoStartEnable,
  isEnabled as autoStartIsEnabled,
  disable as autoStartDisable,
} from "tauri-plugin-autostart-api";
import ToggleButton from "./components/ToggleButton";
import { WallClock, settingsManager } from "./config/settings-manager";
import useRequestAnimationFrame from "./hooks/useRequestAnimationFrame";
import { getVersion } from '@tauri-apps/api/app';
import { simpleUpdateRoutine } from "./utils/update";

function App() {
  const [globalTimeOffset, setGlobalTimeOffsetMinutes] = useState(0);
  const [is24Hours, setIs24Hours] = useState(
    settingsManager.getCache("userSettings.is24Hours")
  );
  const [isSettingHidden, setIsSettingHidden] = useState(false);
  const [clocks, setClocks] = useState<WallClock[]>(
    settingsManager.getCache("clocks")
  );
  const [version, setVersion] = useState<string>();

  // Initalise App
  useLayoutEffect(() => {
    invoke("init_spotlight_window");
    getVersion().then(setVersion);
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
  

  const updateSettings = (key: string, value: any) => {
    settingsManager.setCache(("userSettings." + key) as any, value);
    setIs24Hours(settingsManager.getCache("userSettings.is24Hours"));
    settingsManager.syncCache();
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
      <section className="collapse">
        <button
          className={isSettingHidden ? "btn toggle down" : "btn toggle"}
          onClick={() => setIsSettingHidden(!isSettingHidden)}
        >
          &nbsp;
        </button>
      </section>
      <section className={isSettingHidden ? "hidden" : ""}>
        {/* <ToggleButton
          label={"Date"}
          onEnable={() => updateSettings("showDate", true)}
          onDisable={() => updateSettings("showDate", false)}
          defaultValue={settingsManager.getCache("userSettings.showDate")}
        /> */}
        <ToggleButton
          label={"24 Hours"}
          onEnable={() => updateSettings("is24Hours", true)}
          onDisable={() => updateSettings("is24Hours", false)}
          defaultValue={is24Hours}
        />
        {/* <ToggleButton
          label={"Compact View"}
          onEnable={() => updateSettings("compactView", true)}
          onDisable={() => updateSettings("compactView", false)}
          defaultValue={settingsManager.getCache("userSettings.compactView")}
        /> */}
        <ToggleButton
          label={"Open at Login"}
          onEnable={() => autoStartEnable()}
          onDisable={() => autoStartDisable()}
          defaultValue={autoStartIsEnabled()}
        />
        <section className="settings">
          <button onClick={() => simpleUpdateRoutine(setVersion)} className="btn update clearfix">
            <span className="update-message">Check for Update</span>
            <span className="version gray">v{version}</span>
          </button>
        </section>
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
