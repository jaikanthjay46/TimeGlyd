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

fn main() {
    tauri::Builder::default()
        .system_tray(SystemTray::new()) // .with_menu(system_tray_menu)
        .manage(spotlight::State::default())
        .on_system_tray_event(move |app, event| match event {
            SystemTrayEvent::LeftClick { position, size, .. } => {
                if let Some(panel) = panel!(app) {
                    let visible = panel.is_visible();
                    if visible {
                        panel.order_out(None);
                    } else {
                        let window = app.get_window("main").unwrap();
                        spotlight::position_window_near_position(&window, position, size);
                        panel.show()
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
                }
                api.prevent_close();
            }
            tauri::WindowEvent::Focused(false) => {
                // hide the window automatically when the user
                // clicks out.
                if let Some(panel) = panel!(event.window().app_handle()) {
                    panel.order_out(None);
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            quit,
            set_size,
            spotlight::init_spotlight_window,
            spotlight::show_spotlight,
            spotlight::hide_spotlight
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            Ok(())
        })
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
