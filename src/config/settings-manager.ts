import { SettingsManager } from "tauri-settings";

export type UserPreferences = {
  showDate: boolean;
  is24Hours: boolean;
  compactView: boolean;
};

export type WallClock = {
  clockName: string;
  timezoneOffsetHours: number;
  timeZoneId: string;
};

export type AppSettings = {
  version: string;
  userSettings: UserPreferences;
  clocks: WallClock[];
  globalShortcut: string | null;
};

const defaultSettings: AppSettings = {
  version: "0.0.0",
  userSettings: {
    showDate: false,
    is24Hours: false,
    compactView: true,
  },
  clocks: [
    {
      clockName: "India",
      timezoneOffsetHours: 5.5,
      timeZoneId: "Asia/Kolkata",
    },
    { clockName: "London", timezoneOffsetHours: 0, timeZoneId: "UTC" },
    {
      clockName: "California",
      timezoneOffsetHours: -8,
      timeZoneId: "America/Los_Angeles",
    },
  ],
  globalShortcut: null,
};

export const settingsManager = new SettingsManager<AppSettings>(
  defaultSettings,
  {}
);

let pendingSettingsTransaction: Promise<void> = Promise.resolve();

const cloneSettings = () =>
  JSON.parse(JSON.stringify(settingsManager.settings)) as AppSettings;

export const updateSettings = <Result>(
  mutate: (settings: AppSettings) => Result | Promise<Result>
) => {
  const transaction = pendingSettingsTransaction.then(async () => {
    const previousSettings = cloneSettings();

    try {
      const result = await mutate(settingsManager.settings);
      await settingsManager.syncCache();
      return result;
    } catch (error) {
      settingsManager.settings = previousSettings;
      throw error;
    }
  });

  pendingSettingsTransaction = transaction.then(
    () => undefined,
    () => undefined
  );
  return transaction;
};
