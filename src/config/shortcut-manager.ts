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

let dirtyActiveShortcut: string | null | undefined;

const persistActiveShortcut = async (active: string | null) => {
  await updateSettings((settings) => {
    settings.globalShortcut = active;
  });
  dirtyActiveShortcut = undefined;
};

export const updateGlobalShortcut = async (
  requested: string | null
): Promise<ShortcutUpdate> => {
  const previousPersisted = settingsManager.getCache("globalShortcut");
  const update = await invokeShortcutUpdate(requested);

  if (
    update.active === previousPersisted &&
    dirtyActiveShortcut === undefined
  ) {
    return update;
  }

  try {
    await persistActiveShortcut(update.active);
    return update;
  } catch (persistenceError) {
    let rollback: ShortcutUpdate;
    try {
      rollback = await invokeShortcutUpdate(previousPersisted);
    } catch (rollbackError) {
      throw new Error(
        `Unable to save the shortcut (${errorMessage(
          persistenceError
        )}), and the previous shortcut could not be restored (${errorMessage(
          rollbackError
        )}). Restart TimeGlyd before choosing another shortcut.`
      );
    }

    if (rollback.active === previousPersisted) {
      dirtyActiveShortcut = undefined;
    } else {
      try {
        await persistActiveShortcut(rollback.active);
      } catch (rollbackPersistenceError) {
        dirtyActiveShortcut = rollback.active;
        return {
          active: rollback.active,
          error: `The active shortcut could not be saved: ${errorMessage(
            rollbackPersistenceError
          )}. Retry the change or restart TimeGlyd.`,
        };
      }
    }

    return {
      active: rollback.active,
      error: [
        `Unable to save the shortcut: ${errorMessage(persistenceError)}.`,
        rollback.error ??
          (rollback.active === previousPersisted
            ? "The previous shortcut was restored."
            : "The active shortcut was updated to match saved settings."),
      ].join(" "),
    };
  }
};

let initialization: Promise<ShortcutUpdate> | undefined;

export const initializeGlobalShortcut = () => {
  if (!initialization) {
    initialization = (async () => {
      await invoke<void>("init_spotlight_window");
      return updateGlobalShortcut(
        settingsManager.getCache("globalShortcut")
      );
    })().catch((error) => {
      initialization = undefined;
      throw error;
    });
  }

  return initialization;
};
