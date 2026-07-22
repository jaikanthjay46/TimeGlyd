// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

mod macos;
mod spotlight;
use std::process;

use tauri::{Manager, SystemTray, SystemTrayEvent};

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

#[tauri::command]
fn report_frontend_error(message: String) {
    eprintln!("TimeGlyd frontend startup failed: {message}");
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

fn main() {
    tauri::Builder::default()
        .system_tray(SystemTray::new()) // .with_menu(system_tray_menu)
        .manage(spotlight::State::default())
        .manage(spotlight::ShortcutManagerState::default())
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
            tauri::WindowEvent::CloseRequested { api, .. } => {
                // don't kill the app when the user clicks close. this is important
                if let Some(panel) = panel!(event.window().app_handle()) {
                    panel.order_out(None);
                } else {
                    spotlight::hide_window(event.window());
                }
                api.prevent_close();
            }
            tauri::WindowEvent::Focused(false) => {
                // hide the window automatically when the user
                // clicks out.
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
            report_frontend_error,
            spotlight::init_spotlight_window,
            spotlight::set_global_shortcut,
            spotlight::show_spotlight,
            spotlight::hide_spotlight
        ])
        .setup(|app| {
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
    use super::{tray_click_action, TrayClickAction};

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
}
