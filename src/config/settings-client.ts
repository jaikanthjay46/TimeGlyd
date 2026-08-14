import { invoke } from "@tauri-apps/api/tauri";

export type UserPreferences = {
  showDate: boolean;
  is24Hours: boolean;
  compactView: boolean;
};

export type WallClock = {
  id: string;
  clockName: string;
  timezoneOffsetHours: number;
  timeZoneId: string;
};

export type AppSettings = {
  version: string;
  userSettings: UserPreferences;
  clocks: WallClock[];
  globalShortcut: string;
};

export type SettingsShortcutUpdate = {
  settings: AppSettings;
  active: string | null;
  error: string | null;
};

export const getSettings = () => invoke<AppSettings>("get_settings");

export const addClock = (
  clockName: string,
  timezoneOffsetHours: number,
  timeZoneId: string
) =>
  invoke<AppSettings>("add_clock", {
    clockName,
    timezoneOffsetHours,
    timeZoneId,
  });

export const renameClock = (id: string, clockName: string) =>
  invoke<AppSettings>("rename_clock", { id, clockName });

export const deleteClock = (id: string) =>
  invoke<AppSettings>("delete_clock", { id });

export const moveClock = (id: string, targetIndex: number) =>
  invoke<AppSettings>("move_clock", { id, targetIndex });

export const setTimeFormat = (is24Hours: boolean) =>
  invoke<AppSettings>("set_time_format", { is24Hours });

export const initializeGlobalShortcut = async () => {
  await invoke<void>("init_spotlight_window");
  return invoke<SettingsShortcutUpdate>("initialize_global_shortcut");
};

export const updateGlobalShortcut = (requested: string | null) =>
  invoke<SettingsShortcutUpdate>("update_global_shortcut", {
    requested,
  });
