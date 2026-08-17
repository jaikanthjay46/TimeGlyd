import { relaunch } from "@tauri-apps/api/process";
import { checkUpdate, installUpdate } from "@tauri-apps/api/updater";
import type { Dispatch, SetStateAction } from "react";

export const simpleUpdateRoutine = async (
  setVersion: Dispatch<SetStateAction<string | undefined>>
) => {
  const { shouldUpdate, manifest } = await checkUpdate();
  if (shouldUpdate) {
    setVersion(`Updating to ${manifest?.version}`);
    await installUpdate();
    await relaunch();
  }
};