import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";

export const openSettingsWindow = () =>
  invoke<void>("open_settings_window");

const useSettingsShortcut = () => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && event.key === ",") {
        event.preventDefault();
        void openSettingsWindow();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
};

export default useSettingsShortcut;
