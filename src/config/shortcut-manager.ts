import { invoke } from "@tauri-apps/api/tauri";
import { settingsManager, updateSettings } from "./settings-manager";

export type ShortcutUpdate = {
  active: string | null;
  error: string | null;
};

const invokeShortcutUpdate = (requested: string | null) =>
  invoke<ShortcutUpdate>("set_global_shortcut", { requested });

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const persistActiveShortcut = async (active: string | null) => {
  await updateSettings((settings) => {
    settings.globalShortcut = active ?? "";
  });
};

export const updateGlobalShortcut = async (
  requested: string | null
): Promise<ShortcutUpdate> => {
  const previousPersisted =
    settingsManager.getCache("globalShortcut") || null;
  const update = await invokeShortcutUpdate(requested);

  if (update.active === previousPersisted) {
    return update;
  }

  try {
    await persistActiveShortcut(update.active);
    return update;
  } catch (persistenceError) {
    return {
      active: update.active,
      error: [
        update.error,
        `The shortcut change is active for this session but was not saved: ${errorMessage(
          persistenceError
        )}. It will revert to the last saved value after restart.`,
      ]
        .filter((message): message is string => Boolean(message))
        .join(" "),
    };
  }
};

let initialization: Promise<ShortcutUpdate> | undefined;

export const initializeGlobalShortcut = () => {
  if (!initialization) {
    initialization = (async () => {
      await invoke<void>("init_spotlight_window");
      return updateGlobalShortcut(
        settingsManager.getCache("globalShortcut") || null
      );
    })().catch((error) => {
      initialization = undefined;
      throw error;
    });
  }

  return initialization;
};
