import { relaunch } from "@tauri-apps/api/process";
import { checkUpdate, installUpdate } from "@tauri-apps/api/updater";

export const simpleUpdateRoutine = async (setVersion: React.Dispatch<React.SetStateAction<string | undefined>> ) => {
  try {
    const { shouldUpdate, manifest } = await checkUpdate()
    if (shouldUpdate) {
      setVersion(`Updating to ${manifest?.version}`);
      await installUpdate()
      await relaunch()
    }
  } catch (error) {
    console.error(error)
  }
}