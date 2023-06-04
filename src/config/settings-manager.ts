import { SettingsManager } from "tauri-settings"

export type UserPreferences = {
  showDate: boolean;
  is24Hours: boolean;
  compactView: boolean;
}

export type WallClock = {
  clockName: string;
  timezoneOffsetHours: number;
}

export const settingsManager = new SettingsManager({
  version: '0.0.0',
  userSettings: {showDate: false, is24Hours: false, compactView: true} as UserPreferences,
  clocks: [
    {clockName: "India", timezoneOffsetHours: 5.5},
    {clockName: "London", timezoneOffsetHours: 0},
    {clockName: "California", timezoneOffsetHours: -8}
  ] as WallClock[]

}, {});