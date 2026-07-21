import { useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import "./App.scss";
import Search from "./components/Search";
import Slider from "./components/Slider";
import Clock from "./components/Clock";
import Settings from "./components/Settings";
import ShortcutRecorder from "./components/ShortcutRecorder";
import {
  WallClock,
  settingsManager,
  updateSettings,
} from "./config/settings-manager";
import {
  initializeGlobalShortcut,
  updateGlobalShortcut,
} from "./config/shortcut-manager";
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
  const [globalShortcut, setGlobalShortcut] = useState(
    settingsManager.getCache("globalShortcut")
  );
  const [shortcutError, setShortcutError] = useState<string>();
  const [isShortcutInitializing, setIsShortcutInitializing] =
    useState(true);
  const [version, setVersion] = useState<string>();

  // Initalise App
  useLayoutEffect(() => {
    let isCurrent = true;

    initializeGlobalShortcut()
      .then((update) => {
        if (isCurrent) {
          setGlobalShortcut(update.active);
          setShortcutError(update.error ?? undefined);
        }
      })
      .catch((error) => {
        if (isCurrent) {
          setShortcutError(
            `Unable to initialise the global shortcut: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsShortcutInitializing(false);
        }
      });

    getVersion().then((appVersion) => {
      if (isCurrent) {
        setVersion(
          import.meta.env.VITE_LOCAL_BUILD_REVISION
            ? `${appVersion}+${import.meta.env.VITE_LOCAL_BUILD_REVISION}`
            : appVersion
        );
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
  

  const updateTimeFormat = async (nextIs24Hours: boolean) => {
    await updateSettings((settings) => {
      settings.userSettings.is24Hours = nextIs24Hours;
    });
    setIs24Hours(nextIs24Hours);
  };

  const changeGlobalShortcut = async (requested: string | null) => {
    setShortcutError(undefined);

    try {
      await initializeGlobalShortcut();
      const update = await updateGlobalShortcut(requested);
      setGlobalShortcut(update.active);
      setShortcutError(update.error ?? undefined);
    } catch (error) {
      setShortcutError(
        error instanceof Error ? error.message : String(error)
      );
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
        shortcutControl={
          <ShortcutRecorder
            value={globalShortcut}
            disabled={isShortcutInitializing}
            error={shortcutError}
            onChange={changeGlobalShortcut}
          />
        }
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
