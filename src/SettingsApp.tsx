import { useEffect, useMemo, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import {
  disable as autoStartDisable,
  enable as autoStartEnable,
  isEnabled as autoStartIsEnabled,
} from "tauri-plugin-autostart-api";
import ShortcutRecorder from "./components/ShortcutRecorder";
import ToggleButton from "./components/ToggleButton";
import {
  AppSettings,
  WallClock,
  addClock,
  deleteClock,
  moveClock,
  renameClock,
  setTimeFormat,
  updateGlobalShortcut,
} from "./config/settings-client";
import { findCity } from "./config/city-search";
import useSettingsShortcut from "./hooks/useSettingsShortcut";
import useSettingsSnapshot from "./hooks/useSettingsSnapshot";
import { simpleUpdateRoutine } from "./utils/update";
import "./SettingsApp.scss";

type ClockRowProps = {
  clock: WallClock;
  index: number;
  count: number;
  disabled: boolean;
  onRename: (id: string, name: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
  onMove: (id: string, targetIndex: number) => Promise<void>;
  onDragStart: (id: string) => void;
  onDrop: (targetIndex: number) => void;
};

const ClockRow = ({
  clock,
  index,
  count,
  disabled,
  onRename,
  onDelete,
  onMove,
  onDragStart,
  onDrop,
}: ClockRowProps) => {
  const [name, setName] = useState(clock.clockName);
  const cancelBlur = useRef(false);

  useEffect(() => setName(clock.clockName), [clock.clockName]);

  const commitName = async () => {
    if (cancelBlur.current) {
      cancelBlur.current = false;
      setName(clock.clockName);
      return;
    }
    const nextName = name.trim();
    if (!nextName || nextName === clock.clockName) {
      setName(clock.clockName);
      return;
    }
    const renamed = await onRename(clock.id, nextName);
    if (!renamed) {
      setName(clock.clockName);
    }
  };

  return (
    <li
      className="clock-setting-row"
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDrop(index)}
    >
      <span
        className="clock-drag-handle"
        draggable={!disabled}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", clock.id);
          onDragStart(clock.id);
        }}
        title="Drag to reorder"
        aria-hidden="true"
      >
        ⠿
      </span>
      <div className="clock-setting-details">
        <input
          value={name}
          disabled={disabled}
          aria-label={`Name for ${clock.clockName}`}
          onChange={(event) => {
            cancelBlur.current = false;
            setName(event.currentTarget.value);
          }}
          onBlur={() => void commitName()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              cancelBlur.current = true;
              setName(clock.clockName);
              event.currentTarget.blur();
            }
          }}
        />
        <span>{clock.timeZoneId}</span>
      </div>
      <div className="clock-setting-actions">
        <button
          type="button"
          disabled={disabled || index === 0}
          aria-label={`Move ${clock.clockName} up`}
          onClick={() => void onMove(clock.id, index - 1)}
        >
          ↑
        </button>
        <button
          type="button"
          disabled={disabled || index === count - 1}
          aria-label={`Move ${clock.clockName} down`}
          onClick={() => void onMove(clock.id, index + 1)}
        >
          ↓
        </button>
        <button
          type="button"
          className="destructive"
          disabled={disabled}
          aria-label={`Delete ${clock.clockName}`}
          onClick={() => void onDelete(clock.id)}
        >
          Delete
        </button>
      </div>
    </li>
  );
};

const moveOptimistically = (
  clocks: WallClock[],
  id: string,
  targetIndex: number
) => {
  const sourceIndex = clocks.findIndex((clock) => clock.id === id);
  if (sourceIndex < 0 || clocks.length <= 1) {
    return clocks;
  }
  const clampedTarget = Math.max(0, Math.min(targetIndex, clocks.length - 1));
  if (sourceIndex === clampedTarget) {
    return clocks;
  }
  const next = [...clocks];
  const [clock] = next.splice(sourceIndex, 1);
  next.splice(clampedTarget, 0, clock);
  return next;
};

const SettingsApp = () => {
  useSettingsShortcut();
  const { settings, error: loadError } = useSettingsSnapshot();
  const [displayClocks, setDisplayClocks] = useState<WallClock[]>([]);
  const [query, setQuery] = useState("");
  const [draggedId, setDraggedId] = useState<string>();
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const [shortcutError, setShortcutError] = useState<string>();
  const [isAutoStartEnabled, setIsAutoStartEnabled] = useState(false);
  const [isAutoStartLoading, setIsAutoStartLoading] = useState(true);
  const [activeShortcut, setActiveShortcut] = useState<string | null>(null);
  const [version, setVersion] = useState<string>();

  useEffect(() => {
    if (settings) {
      setDisplayClocks(settings.clocks);
      setActiveShortcut(settings.globalShortcut || null);
    }
  }, [settings]);

  useEffect(() => {
    let isCurrent = true;
    void autoStartIsEnabled()
      .then((enabled) => {
        if (isCurrent) setIsAutoStartEnabled(enabled);
      })
      .catch((loadAutoStartError) => {
        if (isCurrent) {
          setError(
            `Unable to read Open at Login: ${String(loadAutoStartError)}`
          );
        }
      })
      .finally(() => {
        if (isCurrent) setIsAutoStartLoading(false);
      });
    void getVersion().then((appVersion) => {
      if (isCurrent) {
        setVersion(
          import.meta.env.VITE_LOCAL_BUILD_REVISION
            ? `${appVersion}+${import.meta.env.VITE_LOCAL_BUILD_REVISION}`
            : appVersion
        );
      }
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  const searchResult = useMemo(() => findCity(query), [query]);
  const isBusy = pending !== undefined;

  const run = async (
    operation: string,
    action: () => Promise<AppSettings>
  ) => {
    if (isBusy) return undefined;
    setPending(operation);
    setError(undefined);
    try {
      return await action();
    } catch (operationError) {
      setError(
        operationError instanceof Error
          ? operationError.message
          : String(operationError)
      );
      return undefined;
    } finally {
      setPending(undefined);
    }
  };

  const reorder = async (id: string, targetIndex: number) => {
    const previous = settings?.clocks ?? displayClocks;
    setDisplayClocks((clocks) =>
      moveOptimistically(clocks, id, targetIndex)
    );
    const result = await run("reorder", () => moveClock(id, targetIndex));
    if (!result) {
      setDisplayClocks(previous);
    }
  };

  const addSearchResult = async () => {
    if (!searchResult) return;
    const result = await run("add", () =>
      addClock(
        searchResult.fullName,
        searchResult.timeZoneOffset,
        searchResult.timeZoneId
      )
    );
    if (result) setQuery("");
  };

  if (!settings) {
    return (
      <main className="settings-window loading-state">
        {loadError ?? "Loading Settings…"}
      </main>
    );
  }

  return (
    <main className="settings-window">
      <header className="settings-window-header">
        <h1>Settings</h1>
        <p>Manage clocks and how TimeGlyd behaves.</p>
      </header>

      <div className="settings-window-content">
        <section className="settings-window-section">
          <div className="settings-section-heading">
            <div>
              <h2>Clocks</h2>
              <p>Drag clocks into the order shown in the menu-bar panel.</p>
            </div>
            <span>{displayClocks.length}</span>
          </div>

          <div className="clock-add-row">
            <input
              autoFocus
              value={query}
              disabled={isBusy}
              placeholder="Search for a city or time zone"
              aria-label="Search for a city or time zone"
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searchResult) {
                  event.preventDefault();
                  void addSearchResult();
                }
              }}
            />
            <button
              type="button"
              disabled={isBusy || !searchResult}
              onClick={() => void addSearchResult()}
            >
              Add
            </button>
          </div>
          {searchResult ? (
            <p className="clock-search-result">{searchResult.fullName}</p>
          ) : null}

          {displayClocks.length === 0 ? (
            <p className="settings-empty-state">
              Add a city to start building your clock list.
            </p>
          ) : (
            <ul className="clock-settings-list">
              {displayClocks.map((clock, index) => (
                <ClockRow
                  key={clock.id}
                  clock={clock}
                  index={index}
                  count={displayClocks.length}
                  disabled={isBusy}
                  onDragStart={setDraggedId}
                  onDrop={(targetIndex) => {
                    if (draggedId) void reorder(draggedId, targetIndex);
                    setDraggedId(undefined);
                  }}
                  onMove={reorder}
                  onRename={async (id, name) => {
                    return Boolean(
                      await run("rename", () => renameClock(id, name))
                    );
                  }}
                  onDelete={async (id) => {
                    await run("delete", () => deleteClock(id));
                  }}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="settings-window-section">
          <div className="settings-section-heading">
            <div>
              <h2>General</h2>
              <p>Choose the defaults TimeGlyd uses on this Mac.</p>
            </div>
          </div>
          <div className="settings-control-list">
            <ToggleButton
              label="24-hour time"
              checked={settings.userSettings.is24Hours}
              disabled={isBusy}
              onChange={async (enabled) => {
                await run("time-format", () => setTimeFormat(enabled));
              }}
            />
            <ToggleButton
              label="Open at Login"
              checked={isAutoStartEnabled}
              disabled={isBusy || isAutoStartLoading}
              onChange={async (enabled) => {
                setPending("auto-start");
                setError(undefined);
                try {
                  if (enabled) await autoStartEnable();
                  else await autoStartDisable();
                  setIsAutoStartEnabled(enabled);
                } catch (autoStartError) {
                  setError(String(autoStartError));
                } finally {
                  setPending(undefined);
                }
              }}
            />
          </div>
        </section>

        <section className="settings-window-section">
          <div className="settings-section-heading">
            <div>
              <h2>Keyboard Shortcut</h2>
              <p>Open TimeGlyd from anywhere without reaching for the menu bar.</p>
            </div>
          </div>
          <ShortcutRecorder
            value={activeShortcut}
            disabled={isBusy}
            error={shortcutError}
            onChange={async (requested) => {
              setPending("shortcut");
              setShortcutError(undefined);
              try {
                const update = await updateGlobalShortcut(requested);
                setActiveShortcut(update.active);
                setShortcutError(update.error ?? undefined);
              } catch (shortcutError) {
                setShortcutError(String(shortcutError));
              } finally {
                setPending(undefined);
              }
            }}
          />
        </section>

        <section className="settings-window-section updates-section">
          <div className="settings-section-heading">
            <div>
              <h2>Updates</h2>
              <p>TimeGlyd checks only when you ask it to.</p>
            </div>
            <span>{version ? `v${version}` : ""}</span>
          </div>
          <button
            type="button"
            className="settings-primary-action"
            disabled={isBusy}
            onClick={() => {
              setPending("update");
              setError(undefined);
              void simpleUpdateRoutine(setVersion)
                .catch((updateError) => setError(String(updateError)))
                .finally(() => setPending(undefined));
            }}
          >
            Check for Update
          </button>
        </section>

        {error ? (
          <p className="settings-window-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
};

export default SettingsApp;
