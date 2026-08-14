// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

mod macos;
mod settings;
mod spotlight;
use std::{process, sync::Mutex};

use tauri::{Manager, SystemTray, SystemTrayEvent, WindowBuilder, WindowUrl, Wry};

use tauri_plugin_autostart::MacosLauncher;
// use tauri_nspanel::{WindowExt, ManagerExt, Panel, panel_delegate, objc_id};
// use crate::objc_id::Id;

#[tauri::command]
fn quit(app: tauri::AppHandle) {
    let panel = panel!(app).unwrap();
    panel.released_when_closed(true);
    panel.close();
    process::exit(0);
}

#[tauri::command]
fn set_size(app: tauri::AppHandle, height: f64, width: f64) {
    if let Some(panel) = panel!(app) {
        panel.set_content_size(width, height);
    }
}

fn activate_settings_window(
    app: &tauri::AppHandle<Wry>,
    window: tauri::Window<Wry>,
) -> Result<(), String> {
    let app_handle = app.clone();
    app.run_on_main_thread(move || {
        spotlight::hide_spotlight(app_handle);
        spotlight::activate_window(&window);
    })
    .map_err(|error| format!("Unable to activate the Settings window: {error}"))
}

fn prepare_settings_window(
    app: &tauri::AppHandle<Wry>,
    window: tauri::Window<Wry>,
) -> Result<(), String> {
    let app_handle = app.clone();
    app.run_on_main_thread(move || {
        spotlight::hide_spotlight(app_handle);
        spotlight::activate_window(&window);
    })
    .map_err(|error| format!("Unable to prepare the Settings window: {error}"))
}

#[tauri::command]
async fn open_settings_window(app: tauri::AppHandle<Wry>) -> Result<(), String> {
    let settings_state = app.state::<SettingsWindowState>();
    let mut settings_window = settings_state
        .0
        .lock()
        .map_err(|_| "Settings window state is unavailable".to_string())?;
    if let Some(window) = settings_window.as_ref() {
        return activate_settings_window(&app, window.clone());
    }

    if let Some(window) = app.get_window("settings") {
        *settings_window = Some(window.clone());
        return activate_settings_window(&app, window);
    }

    let window = WindowBuilder::new(&app, "settings", WindowUrl::App("index.html".into()))
        .title("TimeGlyd Settings")
        .inner_size(560.0, 680.0)
        .min_inner_size(460.0, 520.0)
        .resizable(true)
        .center()
        .focused(true)
        .visible(true)
        .build()
        .map_err(|error| format!("Unable to create the Settings window: {error}"))?;
    *settings_window = Some(window.clone());
    prepare_settings_window(&app, window)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TrayClickAction {
    HideWindow,
    ShowWindow,
    HidePanel,
    ShowPanel,
}

fn tray_click_action(panel_visible: Option<bool>, window_visible: bool) -> TrayClickAction {
    match panel_visible {
        None if window_visible => TrayClickAction::HideWindow,
        None => TrayClickAction::ShowWindow,
        Some(true) => TrayClickAction::HidePanel,
        Some(false) => TrayClickAction::ShowPanel,
    }
}

fn should_prevent_close(label: &str) -> bool {
    label == "main"
}

fn should_hide_on_focus_loss(label: &str) -> bool {
    label == "main"
}

fn main() {
    tauri::Builder::default()
        .system_tray(SystemTray::new()) // .with_menu(system_tray_menu)
        .manage(spotlight::State::default())
        .manage(spotlight::ShortcutManagerState::default())
        .manage(SettingsWindowState::default())
        .on_system_tray_event(move |app, event| match event {
            SystemTrayEvent::LeftClick { position, size, .. } => {
                let Some(window) = app.get_window("main") else {
                    eprintln!("TimeGlyd tray click ignored: main window is unavailable");
                    return;
                };

                let panel = panel!(app);
                match tray_click_action(
                    panel.as_ref().map(|panel| panel.is_visible()),
                    spotlight::is_window_visible(&window),
                ) {
                    TrayClickAction::HideWindow => {
                        spotlight::hide_window(&window);
                    }
                    TrayClickAction::ShowWindow => {
                        spotlight::position_window_near_position(&window, position, size);
                        // Showing on a worker lets the tray callback return before Tauri
                        // bootstraps WebView navigation on its main event loop.
                        std::thread::spawn(move || {
                            if let Err(error) = window.show() {
                                eprintln!(
                                    "TimeGlyd tray click could not bootstrap the window: {error}"
                                );
                            }
                        });
                        return;
                    }
                    TrayClickAction::HidePanel => {
                        panel
                            .expect("visible panel action requires an initialized panel")
                            .order_out(None);
                    }
                    TrayClickAction::ShowPanel => {
                        spotlight::position_window_near_position(&window, position, size);
                        panel
                            .expect("hidden panel action requires an initialized panel")
                            .show();
                    }
                }
            }
            _ => {}
        })
        .on_window_event(|event| match event.event() {
            tauri::WindowEvent::CloseRequested { api, .. }
                if event.window().label() == "settings" =>
            {
                spotlight::hide_window(event.window());
                api.prevent_close();
            }
            _ if event.window().label() == "settings" => {}
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if should_prevent_close(event.window().label()) {
                    if let Some(panel) = panel!(event.window().app_handle()) {
                        panel.order_out(None);
                    } else {
                        spotlight::hide_window(event.window());
                    }
                    api.prevent_close();
                }
            }
            tauri::WindowEvent::Focused(false)
                if should_hide_on_focus_loss(event.window().label()) =>
            {
                if let Some(panel) = panel!(event.window().app_handle()) {
                    panel.order_out(None);
                } else {
                    spotlight::hide_window(event.window());
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            quit,
            set_size,
            open_settings_window,
            settings::get_settings,
            settings::add_clock,
            settings::rename_clock,
            settings::delete_clock,
            settings::move_clock,
            settings::set_time_format,
            settings::initialize_global_shortcut,
            settings::update_global_shortcut,
            spotlight::init_spotlight_window,
            spotlight::show_spotlight,
            spotlight::hide_spotlight
        ])
        .setup(|app| {
            app.manage(settings::SettingsStore::load(&app.handle()));
            spotlight::install_safe_send_event().map_err(std::io::Error::other)?;

            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            if let Some(window) = app.get_window("main") {
                spotlight::hide_window(&window);
            } else {
                eprintln!("TimeGlyd startup could not find the main window");
            }

            Ok(())
        })
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        should_hide_on_focus_loss, should_prevent_close, tray_click_action, TrayClickAction,
    };

    #[test]
    fn bootstraps_the_window_when_the_panel_is_not_initialized() {
        assert_eq!(tray_click_action(None, false), TrayClickAction::ShowWindow);
    }

    #[test]
    fn hides_a_visible_bootstrap_window() {
        assert_eq!(tray_click_action(None, true), TrayClickAction::HideWindow);
    }

    #[test]
    fn hides_a_visible_panel() {
        assert_eq!(
            tray_click_action(Some(true), false),
            TrayClickAction::HidePanel
        );
    }

    #[test]
    fn shows_a_hidden_panel() {
        assert_eq!(
            tray_click_action(Some(false), false),
            TrayClickAction::ShowPanel
        );
    }

    #[test]
    fn only_main_window_uses_transient_close_and_focus_behavior() {
        assert!(should_prevent_close("main"));
        assert!(should_hide_on_focus_loss("main"));
        assert!(!should_prevent_close("settings"));
        assert!(!should_hide_on_focus_loss("settings"));
    }
}
#[derive(Default)]
struct SettingsWindowState(Mutex<Option<tauri::Window<Wry>>>);
