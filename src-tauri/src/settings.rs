use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State, Wry};
use uuid::Uuid;

const SETTINGS_EVENT: &str = "settings-changed";

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferences {
    pub show_date: bool,
    pub is_24_hours: bool,
    pub compact_view: bool,
}

impl Default for UserPreferences {
    fn default() -> Self {
        Self {
            show_date: false,
            is_24_hours: false,
            compact_view: true,
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WallClock {
    pub id: Uuid,
    pub clock_name: String,
    pub timezone_offset_hours: f64,
    pub time_zone_id: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub version: String,
    pub user_settings: UserPreferences,
    pub clocks: Vec<WallClock>,
    pub global_shortcut: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: "0.0.0".into(),
            user_settings: UserPreferences::default(),
            clocks: vec![
                WallClock {
                    id: Uuid::new_v4(),
                    clock_name: "India".into(),
                    timezone_offset_hours: 5.5,
                    time_zone_id: "Asia/Kolkata".into(),
                },
                WallClock {
                    id: Uuid::new_v4(),
                    clock_name: "London".into(),
                    timezone_offset_hours: 0.0,
                    time_zone_id: "UTC".into(),
                },
                WallClock {
                    id: Uuid::new_v4(),
                    clock_name: "California".into(),
                    timezone_offset_hours: -8.0,
                    time_zone_id: "America/Los_Angeles".into(),
                },
            ],
            global_shortcut: String::new(),
        }
    }
}

impl AppSettings {
    fn add_clock(&mut self, clock_name: String, timezone_offset_hours: f64, time_zone_id: String) {
        self.clocks.push(WallClock {
            id: Uuid::new_v4(),
            clock_name,
            timezone_offset_hours,
            time_zone_id,
        });
    }

    fn rename_clock(&mut self, id: Uuid, clock_name: String) {
        if let Some(clock) = self.clocks.iter_mut().find(|clock| clock.id == id) {
            clock.clock_name = clock_name;
        }
    }

    fn delete_clock(&mut self, id: Uuid) {
        self.clocks.retain(|clock| clock.id != id);
    }

    fn move_clock(&mut self, id: Uuid, target_index: usize) {
        let Some(source_index) = self.clocks.iter().position(|clock| clock.id == id) else {
            return;
        };
        if self.clocks.len() <= 1 {
            return;
        }
        let target_index = target_index.min(self.clocks.len() - 1);
        if source_index == target_index {
            return;
        }
        let clock = self.clocks.remove(source_index);
        self.clocks.insert(target_index, clock);
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredClock {
    #[serde(default)]
    id: Option<String>,
    clock_name: String,
    timezone_offset_hours: f64,
    time_zone_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSettings {
    #[serde(default = "default_version")]
    version: String,
    #[serde(default)]
    user_settings: UserPreferences,
    #[serde(default)]
    clocks: Vec<StoredClock>,
    #[serde(default)]
    global_shortcut: Option<String>,
}

fn default_version() -> String {
    "0.0.0".into()
}

fn normalize_settings(stored: StoredSettings) -> (AppSettings, bool) {
    let mut changed = stored.global_shortcut.is_none();
    let mut seen_ids = HashSet::new();
    let clocks = stored
        .clocks
        .into_iter()
        .map(|clock| {
            let id = clock
                .id
                .as_deref()
                .and_then(|id| Uuid::parse_str(id).ok())
                .filter(|id| seen_ids.insert(*id))
                .unwrap_or_else(|| {
                    changed = true;
                    let id = Uuid::new_v4();
                    seen_ids.insert(id);
                    id
                });

            WallClock {
                id,
                clock_name: clock.clock_name,
                timezone_offset_hours: clock.timezone_offset_hours,
                time_zone_id: clock.time_zone_id,
            }
        })
        .collect();

    (
        AppSettings {
            version: stored.version,
            user_settings: stored.user_settings,
            clocks,
            global_shortcut: stored.global_shortcut.unwrap_or_default(),
        },
        changed,
    )
}

fn write_atomic(path: &Path, settings: &AppSettings) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Settings path has no parent directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Unable to create the settings directory: {error}"))?;
    let temporary = path.with_extension("json.tmp");
    let contents = serde_json::to_vec_pretty(settings)
        .map_err(|error| format!("Unable to serialize settings: {error}"))?;
    fs::write(&temporary, contents)
        .map_err(|error| format!("Unable to write temporary settings: {error}"))?;
    fs::rename(&temporary, path)
        .map_err(|error| format!("Unable to replace the settings file: {error}"))
}

fn load_from_path(path: &Path) -> Result<AppSettings, String> {
    if !path.exists() {
        let settings = AppSettings::default();
        write_atomic(path, &settings)?;
        return Ok(settings);
    }

    let contents =
        fs::read_to_string(path).map_err(|error| format!("Unable to read settings: {error}"))?;
    let stored: StoredSettings = serde_json::from_str(&contents)
        .map_err(|error| format!("Settings are malformed; the file was not changed: {error}"))?;
    let (settings, changed) = normalize_settings(stored);
    if changed {
        write_atomic(path, &settings)?;
    }
    Ok(settings)
}

pub struct SettingsStore {
    path: PathBuf,
    settings: Mutex<Result<AppSettings, String>>,
    session_shortcut: Mutex<Option<String>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsShortcutUpdate {
    pub settings: AppSettings,
    pub active: Option<String>,
    pub error: Option<String>,
}

impl SettingsStore {
    pub fn load(app: &AppHandle<Wry>) -> Self {
        let path = app
            .path_resolver()
            .app_config_dir()
            .map(|directory| directory.join("settings.json"))
            .unwrap_or_default();
        let settings = if path.as_os_str().is_empty() {
            Err("Unable to resolve the app configuration directory".into())
        } else {
            load_from_path(&path)
        };
        Self {
            path,
            settings: Mutex::new(settings),
            session_shortcut: Mutex::new(None),
        }
    }

    fn durable_snapshot(&self) -> Result<AppSettings, String> {
        let settings = self
            .settings
            .lock()
            .map_err(|_| "Settings state is unavailable".to_string())?;
        settings.clone()
    }

    fn snapshot(&self) -> Result<AppSettings, String> {
        let mut snapshot = self.durable_snapshot()?;
        let session_shortcut = self
            .session_shortcut
            .lock()
            .map_err(|_| "Shortcut session state is unavailable".to_string())?;
        if let Some(shortcut) = session_shortcut.as_ref() {
            snapshot.global_shortcut = shortcut.clone();
        }
        Ok(snapshot)
    }

    fn mutate(
        &self,
        app: &AppHandle<Wry>,
        action: impl FnOnce(&mut AppSettings),
    ) -> Result<AppSettings, String> {
        let mut state = self
            .settings
            .lock()
            .map_err(|_| "Settings state is unavailable".to_string())?;
        let settings = state.as_mut().map_err(|error| error.clone())?;
        let previous = settings.clone();
        action(settings);
        if *settings == previous {
            drop(state);
            return self.snapshot();
        }
        if let Err(error) = write_atomic(&self.path, &settings) {
            *settings = previous;
            return Err(error);
        }
        let snapshot = settings.clone();
        drop(state);
        let snapshot = self.apply_session_shortcut(snapshot)?;
        if let Err(error) = app.emit_all(SETTINGS_EVENT, &snapshot) {
            eprintln!("TimeGlyd settings broadcast failed after a successful save: {error}");
        }
        Ok(snapshot)
    }

    fn set_session_shortcut(
        &self,
        app: &AppHandle<Wry>,
        shortcut: String,
    ) -> Result<AppSettings, String> {
        let mut snapshot = self.durable_snapshot()?;
        let mut session_shortcut = self
            .session_shortcut
            .lock()
            .map_err(|_| "Shortcut session state is unavailable".to_string())?;
        *session_shortcut = Some(shortcut.clone());
        snapshot.global_shortcut = shortcut;
        if let Err(error) = app.emit_all(SETTINGS_EVENT, &snapshot) {
            eprintln!("TimeGlyd settings broadcast failed: {error}");
        }
        Ok(snapshot)
    }

    fn clear_session_shortcut(&self) -> Result<(), String> {
        let mut session_shortcut = self
            .session_shortcut
            .lock()
            .map_err(|_| "Shortcut session state is unavailable".to_string())?;
        *session_shortcut = None;
        Ok(())
    }

    fn apply_session_shortcut(&self, mut snapshot: AppSettings) -> Result<AppSettings, String> {
        let session_shortcut = self
            .session_shortcut
            .lock()
            .map_err(|_| "Shortcut session state is unavailable".to_string())?;
        if let Some(shortcut) = session_shortcut.as_ref() {
            snapshot.global_shortcut = shortcut.clone();
        }
        Ok(snapshot)
    }

    fn persist_shortcut(
        &self,
        app: &AppHandle<Wry>,
        shortcut: String,
    ) -> Result<AppSettings, String> {
        let mut state = self
            .settings
            .lock()
            .map_err(|_| "Settings state is unavailable".to_string())?;
        let settings = state.as_mut().map_err(|error| error.clone())?;
        let previous = settings.clone();
        settings.global_shortcut = shortcut;
        if let Err(error) = write_atomic(&self.path, settings) {
            *settings = previous;
            return Err(error);
        }
        let snapshot = settings.clone();
        drop(state);
        self.clear_session_shortcut()?;
        if let Err(error) = app.emit_all(SETTINGS_EVENT, &snapshot) {
            eprintln!("TimeGlyd settings broadcast failed after a successful save: {error}");
        }
        Ok(snapshot)
    }
}

#[tauri::command]
pub fn get_settings(store: State<'_, SettingsStore>) -> Result<AppSettings, String> {
    store.snapshot()
}

#[tauri::command]
pub fn add_clock(
    app: AppHandle<Wry>,
    store: State<'_, SettingsStore>,
    clock_name: String,
    timezone_offset_hours: f64,
    time_zone_id: String,
) -> Result<AppSettings, String> {
    store.mutate(&app, |settings| {
        settings.add_clock(clock_name, timezone_offset_hours, time_zone_id);
    })
}

#[tauri::command]
pub fn rename_clock(
    app: AppHandle<Wry>,
    store: State<'_, SettingsStore>,
    id: Uuid,
    clock_name: String,
) -> Result<AppSettings, String> {
    store.mutate(&app, |settings| {
        settings.rename_clock(id, clock_name);
    })
}

#[tauri::command]
pub fn delete_clock(
    app: AppHandle<Wry>,
    store: State<'_, SettingsStore>,
    id: Uuid,
) -> Result<AppSettings, String> {
    store.mutate(&app, |settings| {
        settings.delete_clock(id);
    })
}

#[tauri::command]
pub fn move_clock(
    app: AppHandle<Wry>,
    store: State<'_, SettingsStore>,
    id: Uuid,
    target_index: usize,
) -> Result<AppSettings, String> {
    store.mutate(&app, |settings| {
        settings.move_clock(id, target_index);
    })
}

#[tauri::command]
pub fn set_time_format(
    app: AppHandle<Wry>,
    store: State<'_, SettingsStore>,
    is_24_hours: bool,
) -> Result<AppSettings, String> {
    store.mutate(&app, |settings| {
        settings.user_settings.is_24_hours = is_24_hours;
    })
}

fn apply_global_shortcut(
    app: AppHandle<Wry>,
    store: State<'_, SettingsStore>,
    requested: Option<String>,
) -> Result<SettingsShortcutUpdate, String> {
    let native = crate::spotlight::set_global_shortcut(app.clone(), requested)?;
    let previous = store.durable_snapshot()?;
    let persisted = native.active.clone().unwrap_or_default();

    if previous.global_shortcut == persisted {
        store.clear_session_shortcut()?;
        return Ok(SettingsShortcutUpdate {
            settings: store.snapshot()?,
            active: native.active,
            error: native.error,
        });
    }

    match store.persist_shortcut(&app, persisted.clone()) {
        Ok(settings) => Ok(SettingsShortcutUpdate {
            settings,
            active: native.active,
            error: native.error,
        }),
        Err(persistence_error) => {
            let settings = store.set_session_shortcut(&app, persisted)?;
            Ok(SettingsShortcutUpdate {
                settings,
                active: native.active,
                error: Some(
                    [
                        native.error,
                        Some(format!(
                            "The shortcut is active for this session but was not saved: {persistence_error}. It will revert after restart."
                        )),
                    ]
                    .into_iter()
                    .flatten()
                    .collect::<Vec<_>>()
                    .join(" "),
                ),
            })
        }
    }
}

#[tauri::command]
pub fn initialize_global_shortcut(
    app: AppHandle<Wry>,
    store: State<'_, SettingsStore>,
) -> Result<SettingsShortcutUpdate, String> {
    let saved = store.snapshot()?.global_shortcut;
    let requested = (!saved.is_empty()).then_some(saved);
    apply_global_shortcut(app, store, requested)
}

#[tauri::command]
pub fn update_global_shortcut(
    app: AppHandle<Wry>,
    store: State<'_, SettingsStore>,
    requested: Option<String>,
) -> Result<SettingsShortcutUpdate, String> {
    apply_global_shortcut(app, store, requested)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stored_clock(id: Option<String>, name: &str) -> StoredClock {
        StoredClock {
            id,
            clock_name: name.into(),
            timezone_offset_hours: 0.0,
            time_zone_id: "UTC".into(),
        }
    }

    fn stored_settings(clocks: Vec<StoredClock>) -> StoredSettings {
        StoredSettings {
            version: "0.0.0".into(),
            user_settings: UserPreferences::default(),
            clocks,
            global_shortcut: Some(String::new()),
        }
    }

    #[test]
    fn migrates_missing_and_duplicate_clock_ids_without_reordering() {
        let duplicate = Uuid::new_v4().to_string();
        let (settings, changed) = normalize_settings(stored_settings(vec![
            stored_clock(Some(duplicate.clone()), "first"),
            stored_clock(None, "second"),
            stored_clock(Some(duplicate), "third"),
        ]));

        assert!(changed);
        assert_eq!(
            settings
                .clocks
                .iter()
                .map(|clock| clock.clock_name.as_str())
                .collect::<Vec<_>>(),
            vec!["first", "second", "third"]
        );
        assert_eq!(
            settings
                .clocks
                .iter()
                .map(|clock| clock.id)
                .collect::<HashSet<_>>()
                .len(),
            3
        );
    }

    #[test]
    fn valid_clock_ids_are_idempotent() {
        let ids = [Uuid::new_v4(), Uuid::new_v4()];
        let (settings, changed) = normalize_settings(stored_settings(vec![
            stored_clock(Some(ids[0].to_string()), "first"),
            stored_clock(Some(ids[1].to_string()), "second"),
        ]));

        assert!(!changed);
        assert_eq!(settings.clocks[0].id, ids[0]);
        assert_eq!(settings.clocks[1].id, ids[1]);
    }

    #[test]
    fn malformed_settings_are_not_overwritten() {
        let path = std::env::temp_dir().join(format!("timeglyd-{}.json", Uuid::new_v4()));
        let original = b"{ definitely not valid json";
        fs::write(&path, original).unwrap();

        assert!(load_from_path(&path).is_err());
        assert_eq!(fs::read(&path).unwrap(), original);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn move_by_unknown_id_is_a_no_op() {
        let mut settings = AppSettings::default();
        let original = settings.clone();
        settings.move_clock(Uuid::new_v4(), 0);
        assert_eq!(settings, original);
    }

    #[test]
    fn move_clamps_target_and_preserves_other_order() {
        let mut settings = AppSettings::default();
        let moved = settings.clocks[0].clone();
        let second = settings.clocks[1].id;
        let third = settings.clocks[2].id;
        settings.move_clock(moved.id, usize::MAX);

        assert_eq!(settings.clocks[0].id, second);
        assert_eq!(settings.clocks[1].id, third);
        assert_eq!(settings.clocks[2].id, moved.id);
    }

    #[test]
    fn rename_and_delete_unknown_ids_are_no_ops() {
        let mut settings = AppSettings::default();
        let original = settings.clone();
        let unknown = Uuid::new_v4();
        settings.rename_clock(unknown, "ignored".into());
        settings.delete_clock(unknown);
        assert_eq!(settings, original);
    }

    #[test]
    fn add_rename_and_delete_use_stable_ids() {
        let mut settings = AppSettings::default();
        let original_count = settings.clocks.len();
        settings.add_clock("Duplicate".into(), 0.0, "UTC".into());
        settings.add_clock("Duplicate".into(), 0.0, "UTC".into());

        let first_duplicate = settings.clocks[original_count].id;
        let second_duplicate = settings.clocks[original_count + 1].id;
        assert_ne!(first_duplicate, second_duplicate);

        settings.rename_clock(first_duplicate, "Renamed".into());
        assert_eq!(
            settings
                .clocks
                .iter()
                .find(|clock| clock.id == first_duplicate)
                .unwrap()
                .clock_name,
            "Renamed"
        );
        assert_eq!(
            settings
                .clocks
                .iter()
                .find(|clock| clock.id == second_duplicate)
                .unwrap()
                .clock_name,
            "Duplicate"
        );

        settings.delete_clock(first_duplicate);
        assert!(settings
            .clocks
            .iter()
            .all(|clock| clock.id != first_duplicate));
        assert!(settings
            .clocks
            .iter()
            .any(|clock| clock.id == second_duplicate));
    }

    #[test]
    fn moving_to_the_same_index_is_a_no_op() {
        let mut settings = AppSettings::default();
        let original = settings.clone();
        let id = settings.clocks[1].id;
        settings.move_clock(id, 1);
        assert_eq!(settings, original);
    }

    #[test]
    fn session_shortcut_override_is_not_part_of_durable_settings() {
        let durable = AppSettings::default();
        let store = SettingsStore {
            path: PathBuf::new(),
            settings: Mutex::new(Ok(durable.clone())),
            session_shortcut: Mutex::new(Some("Command+T".into())),
        };

        assert_eq!(store.durable_snapshot().unwrap(), durable);
        assert_eq!(store.snapshot().unwrap().global_shortcut, "Command+T");
    }
}
