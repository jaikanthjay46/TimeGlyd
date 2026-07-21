import { useEffect, useState, type ReactNode } from "react";
import {
  disable as autoStartDisable,
  enable as autoStartEnable,
  isEnabled as autoStartIsEnabled,
} from "tauri-plugin-autostart-api";
import ToggleButton from "../ToggleButton";
import "./Settings.scss";

type Operation = "timeFormat" | "autoStart" | "update";

type Props = {
  is24Hours: boolean;
  on24HourChange: (is24Hours: boolean) => Promise<void>;
  version?: string;
  onCheckForUpdates: () => Promise<void>;
  shortcutControl?: ReactNode;
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const Settings = ({
  is24Hours,
  on24HourChange,
  version,
  onCheckForUpdates,
  shortcutControl,
}: Props) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAutoStartEnabled, setIsAutoStartEnabled] = useState(false);
  const [isLoadingAutoStart, setIsLoadingAutoStart] = useState(true);
  const [pendingOperation, setPendingOperation] = useState<Operation | null>(
    null
  );
  const [error, setError] = useState<string>();

  useEffect(() => {
    let isCurrent = true;

    const loadAutoStart = async () => {
      try {
        const isEnabled = await autoStartIsEnabled();
        if (isCurrent) {
          setIsAutoStartEnabled(isEnabled);
        }
      } catch (loadError) {
        if (isCurrent) {
          setError(
            `Unable to read the Open at Login setting: ${errorMessage(
              loadError
            )}`
          );
        }
      } finally {
        if (isCurrent) {
          setIsLoadingAutoStart(false);
        }
      }
    };

    void loadAutoStart();

    return () => {
      isCurrent = false;
    };
  }, []);

  const runOperation = async (
    operation: Operation,
    description: string,
    action: () => Promise<void>
  ) => {
    if (pendingOperation !== null) {
      return;
    }

    setPendingOperation(operation);
    setError(undefined);

    try {
      await action();
    } catch (operationError) {
      setError(`${description}: ${errorMessage(operationError)}`);
    } finally {
      setPendingOperation(null);
    }
  };

  const updateAutoStart = async (isEnabled: boolean) => {
    await runOperation(
      "autoStart",
      "Unable to update Open at Login",
      async () => {
        if (isEnabled) {
          await autoStartEnable();
        } else {
          await autoStartDisable();
        }
        setIsAutoStartEnabled(isEnabled);
      }
    );
  };

  const settingsAreBusy =
    pendingOperation !== null || isLoadingAutoStart;

  return (
    <>
      <section className="settings-disclosure">
        <button
          type="button"
          className="btn settings-toggle"
          aria-expanded={isExpanded}
          aria-controls="settings-panel"
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          Settings
        </button>
      </section>
      <section
        id="settings-panel"
        className="settings-panel"
        hidden={!isExpanded}
      >
        <div className="settings-content">
          <ToggleButton
            label="24 Hours"
            checked={is24Hours}
            disabled={settingsAreBusy}
            onChange={(isEnabled) =>
              runOperation(
                "timeFormat",
                "Unable to update the time format",
                () => on24HourChange(isEnabled)
              )
            }
          />
          <ToggleButton
            label="Open at Login"
            checked={isAutoStartEnabled}
            disabled={settingsAreBusy}
            onChange={updateAutoStart}
          />
          {shortcutControl ? (
            <div className="settings-shortcut">{shortcutControl}</div>
          ) : null}
          {error ? (
            <p className="settings-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() =>
              void runOperation(
                "update",
                "Unable to check for updates",
                onCheckForUpdates
              )
            }
            className={`btn update clearfix${
              pendingOperation === "update" ? " loading" : ""
            }`}
            disabled={settingsAreBusy}
            aria-busy={pendingOperation === "update"}
          >
            <span className="update-message">Check for Update</span>
            <span className="version gray">
              {version ? `v${version}` : ""}
            </span>
          </button>
        </div>
      </section>
    </>
  );
};

export default Settings;
