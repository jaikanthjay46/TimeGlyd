import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  AppSettings,
  getSettings,
} from "../config/settings-client";

const useSettingsSnapshot = () => {
  const [settings, setSettings] = useState<AppSettings>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let isCurrent = true;
    let unlisten: (() => void) | undefined;

    void listen<AppSettings>("settings-changed", (event) => {
      if (isCurrent) {
        setSettings(event.payload);
        setError(undefined);
      }
    }).then((cleanup) => {
      if (isCurrent) {
        unlisten = cleanup;
      } else {
        cleanup();
      }
    });

    void getSettings()
      .then((snapshot) => {
        if (isCurrent) {
          setSettings(snapshot);
          setError(undefined);
        }
      })
      .catch((loadError) => {
        if (isCurrent) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : String(loadError)
          );
        }
      });

    return () => {
      isCurrent = false;
      unlisten?.();
    };
  }, []);

  return { settings, error };
};

export default useSettingsSnapshot;
