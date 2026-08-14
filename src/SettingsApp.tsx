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

type SettingsSection = "clocks" | "general" | "shortcut" | "updates";

const settingsSections: Array<{
  id: SettingsSection;
  icon: string;
  label: string;
}> = [
  { id: "clocks", icon: "◷", label: "Clocks" },
  { id: "general", icon: "⚙︎", label: "General" },
  { id: "shortcut", icon: "⌨︎", label: "Shortcut" },
  { id: "updates", icon: "ⓘ", label: "About" },
];

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
          −
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
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("clocks");
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

  const selectedSection =
    settingsSections.find((section) => section.id === activeSection) ??
    settingsSections[0];

  if (!settings) {
    return (
      <main className="settings-window loading-state">
        {loadError ?? "Loading Settings…"}
      </main>
    );
  }

  return (
    <main className="settings-window">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-title">TimeGlyd</div>
        <nav aria-label="Settings sections">
          {settingsSections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={activeSection === section.id ? "selected" : ""}
              aria-current={activeSection === section.id ? "page" : undefined}
              onClick={() => setActiveSection(section.id)}
            >
              <span aria-hidden="true">{section.icon}</span>
              {section.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="settings-detail">
        <header className="settings-detail-header">
          <h1>{selectedSection.label}</h1>
          <p>
            {activeSection === "clocks"
              ? "Choose which clocks appear and their order."
              : activeSection === "general"
                ? "Set how TimeGlyd behaves on this Mac."
                : activeSection === "shortcut"
                  ? "Open TimeGlyd without reaching for the menu bar."
                  : "Version information and software updates."}
          </p>
        </header>

        <div className="settings-detail-content">
          {activeSection === "clocks" ? (
            <section className="settings-pane" aria-labelledby="clocks-pane">
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
                  className="primary-button"
                  disabled={isBusy || !searchResult}
                  onClick={() => void addSearchResult()}
                >
                  Add
                </button>
              </div>
              {searchResult ? (
                <p className="clock-search-result">{searchResult.fullName}</p>
              ) : null}

              <div className="settings-group clocks-group">
                <div className="settings-group-header">
                  <span>Menu-bar clocks</span>
                  <span>{displayClocks.length}</span>
                </div>
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
              </div>
            </section>
          ) : null}

          {activeSection === "general" ? (
            <section className="settings-pane">
              <div className="settings-group">
                <div className="native-setting-row">
                  <div>
                    <strong>24-hour time</strong>
                    <span>Display times using the 24-hour clock.</span>
                  </div>
                  <ToggleButton
                    label="24-hour time"
                    checked={settings.userSettings.is24Hours}
                    disabled={isBusy}
                    onChange={async (enabled) => {
                      await run("time-format", () => setTimeFormat(enabled));
                    }}
                  />
                </div>
                <div className="native-setting-row">
                  <div>
                    <strong>Open at Login</strong>
                    <span>Launch TimeGlyd when you sign in.</span>
                  </div>
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
              </div>
            </section>
          ) : null}

          {activeSection === "shortcut" ? (
            <section className="settings-pane">
              <div className="settings-group shortcut-group">
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
              </div>
            </section>
          ) : null}

          {activeSection === "updates" ? (
            <section className="settings-pane about-pane">
              <div className="app-mark" aria-hidden="true">
                TG
              </div>
              <h2>TimeGlyd</h2>
              <p className="about-version">{version ? `Version ${version}` : ""}</p>
              <p>
                A private, offline-friendly time-zone companion for distributed
                teams.
              </p>
              <button
                type="button"
                className="primary-button"
                disabled={isBusy}
                onClick={() => {
                  setPending("update");
                  setError(undefined);
                  void simpleUpdateRoutine(setVersion)
                    .catch((updateError) => setError(String(updateError)))
                    .finally(() => setPending(undefined));
                }}
              >
                Check for Updates…
              </button>
            </section>
          ) : null}

          {error ? (
            <p className="settings-window-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
};

export default SettingsApp;
