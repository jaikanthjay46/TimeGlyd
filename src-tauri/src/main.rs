// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

mod macos;
use std::{process};

use macos::WindowExt;

use tauri::{Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, CustomMenuItem, PhysicalPosition, Window, Runtime, WindowBuilder, LogicalSize, Size};

use tauri_plugin_autostart::MacosLauncher;


// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn quit() {
    process::exit(0);
}

#[tauri::command]
fn set_height(app: tauri::AppHandle, size: f64) {
    let window = app.get_window("main").unwrap();
    window.set_size(Size::Logical(LogicalSize { width: 360.0, height: size })).unwrap();
}

fn main() {
    let system_tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("quit", "Quit"));
        // .add_item(CustomMenuItem::new("open", "Open"));

    tauri::Builder::default()
    .system_tray(SystemTray::new())  // .with_menu(system_tray_menu)
    .on_system_tray_event(move |app, event| match event {
        SystemTrayEvent::LeftClick {
            position,
            size,
            ..
        } => {
          let w = app.get_window("main").unwrap();
          let visible = w.is_visible().unwrap();
          if visible {
            w.hide().unwrap();
          } else {
            let window_size  = w.outer_size().unwrap();
            let physical_pos = PhysicalPosition {
              x: position.x as i32 + (size.width as i32 / 2) - (window_size.width as i32 / 2),
              y: position.y as i32 - window_size.height as i32
            };
    
            let _ = w.set_position(tauri::Position::Physical(physical_pos));
            w.show().unwrap();
            w.set_focus().unwrap();
          }
        }
        SystemTrayEvent::RightClick {
            position: _,
            size: _,
            ..
        } => {
            println!("system tray received a right click");
        }
        SystemTrayEvent::DoubleClick {
            position: _,
            size: _,
            ..
        } => {
            println!("system tray received a double click");
        }
        SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
            "quit" => {
                std::process::exit(0);
            }
            _ => {}
        },
        _ => {}
      })
    .on_window_event(|event| match event.event() {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            // don't kill the app when the user clicks close. this is important
            event.window().hide().unwrap();
            api.prevent_close();
        }
        tauri::WindowEvent::Focused(false) => {
            // hide the window automatically when the user
            // clicks out. this is for a matter of taste.
            event.window().hide().unwrap();
        }
        _ => {}
      })
    .invoke_handler(tauri::generate_handler![quit, set_height, greet])
    .setup(|app| {
        #[cfg(target_os = "macos")]
        // don't show on the taskbar/springboard
        app.set_activation_policy(tauri::ActivationPolicy::Accessory);
  
        let window = app.get_window("main").unwrap();
        #[cfg(target_os = "macos")]
        window.set_transparent_titlebar(true, true);
  
        // this is a workaround for the window to always show in current workspace.
        // see https://github.com/tauri-apps/tauri/issues/2801
        window.set_always_on_top(true).unwrap();

        Ok(())
      })
      .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
