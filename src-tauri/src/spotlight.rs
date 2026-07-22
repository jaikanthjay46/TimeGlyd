use std::{ffi::c_void, sync::Mutex};

use objc_id::{Id, ShareId};
use serde::Serialize;
use tao::{accelerator::Accelerator, keyboard::KeyCode};
use tauri::{
    AppHandle, GlobalShortcutManager, Manager, PhysicalPosition, PhysicalSize, Runtime, Window, Wry,
};

use block::ConcreteBlock;
use cocoa::{
    appkit::{CGFloat, NSEventMask, NSMainMenuWindowLevel, NSWindow, NSWindowCollectionBehavior},
    base::{id, nil, BOOL, NO, YES},
    foundation::{NSPoint, NSRect, NSSize},
};
use objc::{
    class,
    declare::ClassDecl,
    msg_send,
    runtime::{self, Class, Object, Sel},
    sel, sel_impl, Message,
};
use objc_foundation::INSObject;

use crate::macos::WindowExt;

#[link(name = "Foundation", kind = "framework")]
extern "C" {
    pub fn NSMouseInRect(aPoint: NSPoint, aRect: NSRect, flipped: BOOL) -> BOOL;
}

#[derive(Default)]
pub struct Store {
    pub panel: Option<ShareId<RawNSPanel>>,
    pub global_click_monitor_installed: bool,
}

#[derive(Default)]
pub struct State(pub Mutex<Store>);

#[derive(Default)]
struct ShortcutStore {
    active: Option<String>,
    panel: Option<ShareId<RawNSPanel>>,
}

#[derive(Default)]
pub struct ShortcutManagerState(Mutex<ShortcutStore>);

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutUpdate {
    active: Option<String>,
    error: Option<String>,
}

impl ShortcutUpdate {
    fn success(active: Option<String>) -> Self {
        Self {
            active,
            error: None,
        }
    }

    fn failure(active: Option<String>, error: impl Into<String>) -> Self {
        Self {
            active,
            error: Some(error.into()),
        }
    }
}

fn status_item_panel_origin(
    status_frame: NSRect,
    visible_frame: NSRect,
    panel_size: NSSize,
) -> NSPoint {
    panel_origin_below_anchor(
        status_frame.origin.x,
        status_frame.size.width,
        visible_frame,
        panel_size,
    )
}

fn panel_origin_below_anchor(
    anchor_x: f64,
    anchor_width: f64,
    visible_frame: NSRect,
    panel_size: NSSize,
) -> NSPoint {
    let desired_x = anchor_x + (anchor_width / 2.0) - (panel_size.width / 2.0);
    let min_x = visible_frame.origin.x;
    let max_x = (visible_frame.origin.x + visible_frame.size.width - panel_size.width).max(min_x);

    NSPoint {
        x: desired_x.clamp(min_x, max_x),
        // visibleFrame uses global Cocoa coordinates and excludes the menu bar.
        y: visible_frame.origin.y + visible_frame.size.height - panel_size.height,
    }
}

fn get_monitor_containing_point(point: NSPoint) -> Option<Monitor> {
    objc::rc::autoreleasepool(|| {
        let screens: id = unsafe { msg_send![class!(NSScreen), screens] };
        let screens_iter: id = unsafe { msg_send![screens, objectEnumerator] };

        loop {
            let screen: id = unsafe { msg_send![screens_iter, nextObject] };
            if screen == nil {
                return None;
            }

            let frame: NSRect = unsafe { msg_send![screen, frame] };
            if unsafe { NSMouseInRect(point, frame, NO) } == YES {
                return Some(monitor_from_screen(screen));
            }
        }
    })
}

fn get_status_item_frame() -> Option<NSRect> {
    const NS_STATUS_WINDOW_LEVEL: i32 = 25;
    const MAX_STATUS_ITEM_WIDTH: f64 = 100.0;

    objc::rc::autoreleasepool(|| {
        let app: id = unsafe { msg_send![class!(NSApplication), sharedApplication] };
        let windows: id = unsafe { msg_send![app, windows] };
        let count: usize = unsafe { msg_send![windows, count] };

        for index in 0..count {
            let window: id = unsafe { msg_send![windows, objectAtIndex: index] };
            let level: i32 = unsafe { msg_send![window, level] };
            let frame: NSRect = unsafe { msg_send![window, frame] };

            // Tao's status item is the app's narrow level-25 window. If it
            // cannot be found, shortcut positioning falls back to the pointer display.
            if level == NS_STATUS_WINDOW_LEVEL
                && frame.size.width > 0.0
                && frame.size.width <= MAX_STATUS_ITEM_WIDTH
                && frame.size.height > 0.0
            {
                return Some(frame);
            }
        }

        None
    })
}

#[macro_export]
macro_rules! set_state {
    ($app_handle:expr, $field:ident, $value:expr) => {{
        let handle = $app_handle.app_handle();
        handle
            .state::<$crate::spotlight::State>()
            .0
            .lock()
            .unwrap()
            .$field = $value;
    }};
}

#[macro_export]
macro_rules! get_state {
    ($app_handle:expr, $field:ident) => {{
        let handle = $app_handle.app_handle();
        let value = handle
            .state::<$crate::spotlight::State>()
            .0
            .lock()
            .unwrap()
            .$field;

        value
    }};
    ($app_handle:expr, $field:ident, $action:ident) => {{
        let handle = $app_handle.app_handle();
        let value = handle
            .state::<$crate::spotlight::State>()
            .0
            .lock()
            .unwrap()
            .$field
            .$action();

        value
    }};
}

#[macro_export]
macro_rules! panel {
    ($app_handle:expr) => {{
        let handle = $app_handle.app_handle();
        let panel = handle
            .state::<$crate::spotlight::State>()
            .0
            .lock()
            .unwrap()
            .panel
            .clone();

        panel
    }};
}

#[tauri::command]
pub fn init_spotlight_window(
    app_handle: AppHandle<Wry>,
    window: Window<Wry>,
) -> Result<(), String> {
    let panel = {
        let state = app_handle.state::<State>();
        let mut store = state
            .0
            .lock()
            .map_err(|_| "menu bar panel state is unavailable".to_string())?;

        if store.panel.is_none() {
            store.panel = Some(create_spotlight_panel(&window));
        }

        let panel = store
            .panel
            .as_ref()
            .ok_or_else(|| "menu bar panel was not created".to_string())?
            .clone();

        if !store.global_click_monitor_installed {
            install_global_click_monitor(panel.clone())?;
            store.global_click_monitor_installed = true;
        }

        panel
    };

    let shortcut_state = app_handle.state::<ShortcutManagerState>();
    let mut shortcut_store = shortcut_state
        .0
        .lock()
        .map_err(|_| "global shortcut state is unavailable".to_string())?;
    shortcut_store.panel = Some(panel);

    Ok(())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ShortcutAction<'a> {
    Register(&'a str),
    Unregister(&'a str),
}

fn update_registered_shortcut<F>(
    active: &mut Option<String>,
    requested: Option<String>,
    mut perform: F,
) -> ShortcutUpdate
where
    F: for<'a> FnMut(ShortcutAction<'a>) -> Result<(), String>,
{
    let previous = active.clone();
    if requested == previous {
        return ShortcutUpdate::success(previous);
    }

    if requested.is_none() {
        let Some(previous_shortcut) = previous else {
            return ShortcutUpdate::success(None);
        };

        return match perform(ShortcutAction::Unregister(&previous_shortcut)) {
            Ok(()) => {
                *active = None;
                ShortcutUpdate::success(None)
            }
            Err(error) => ShortcutUpdate::failure(
                Some(previous_shortcut),
                format!("Unable to disable the shortcut: {error}"),
            ),
        };
    }

    let requested_shortcut = requested.expect("requested shortcut was checked above");

    if let Some(previous_shortcut) = previous.as_deref() {
        if let Err(error) = perform(ShortcutAction::Unregister(previous_shortcut)) {
            return ShortcutUpdate::failure(
                previous,
                format!("Unable to change the shortcut: {error}"),
            );
        }
    }

    match perform(ShortcutAction::Register(&requested_shortcut)) {
        Ok(()) => {
            *active = Some(requested_shortcut.clone());
            ShortcutUpdate::success(Some(requested_shortcut))
        }
        Err(register_error) => {
            let Some(previous_shortcut) = previous else {
                *active = None;
                return ShortcutUpdate::failure(None, register_error);
            };

            match perform(ShortcutAction::Register(&previous_shortcut)) {
                Ok(()) => {
                    *active = Some(previous_shortcut.clone());
                    ShortcutUpdate::failure(
                        Some(previous_shortcut),
                        format!("{register_error}. The previous shortcut was restored."),
                    )
                }
                Err(rollback_error) => {
                    *active = None;
                    ShortcutUpdate::failure(
                        None,
                        format!(
                            "{register_error}. The previous shortcut could not be restored: {rollback_error}"
                        ),
                    )
                }
            }
        }
    }
}

fn validate_canonical_shortcut(shortcut: &str) -> Result<(), String> {
    const MODIFIERS: [&str; 4] = ["Command", "Control", "Alt", "Shift"];

    let tokens = shortcut.split('+').collect::<Vec<_>>();
    if tokens.len() < 2 {
        return Err("include at least one modifier and one key".into());
    }

    let mut previous_modifier_index = None;
    for modifier in &tokens[..tokens.len() - 1] {
        let modifier_index = MODIFIERS
            .iter()
            .position(|candidate| candidate == modifier)
            .ok_or_else(|| format!("{modifier} is not a supported modifier"))?;

        if previous_modifier_index.is_some_and(|previous| modifier_index <= previous) {
            return Err("use Command, Control, Alt, and Shift in that order".into());
        }
        previous_modifier_index = Some(modifier_index);
    }

    let key = tokens
        .last()
        .expect("shortcut token count was checked above");
    let key_code = key
        .parse::<KeyCode>()
        .map_err(|error| format!("{key} is not a supported key: {error}"))?;
    if matches!(key_code, KeyCode::Unidentified(_)) {
        return Err(format!("{key} is not a supported key"));
    }

    shortcut
        .parse::<Accelerator>()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_global_shortcut(
    app_handle: AppHandle<Wry>,
    requested: Option<String>,
) -> Result<ShortcutUpdate, String> {
    let state = app_handle.state::<ShortcutManagerState>();
    let mut store = state
        .0
        .lock()
        .map_err(|_| "global shortcut state is unavailable".to_string())?;

    if requested == store.active {
        return Ok(ShortcutUpdate::success(store.active.clone()));
    }

    if let Some(shortcut) = requested.as_deref() {
        if let Err(error) = validate_canonical_shortcut(shortcut) {
            return Ok(ShortcutUpdate::failure(
                store.active.clone(),
                format!("That shortcut is not supported: {error}"),
            ));
        }
    }

    let panel = if requested.is_some() {
        match store.panel.as_ref() {
            Some(panel) => Some(panel.clone()),
            None => {
                return Ok(ShortcutUpdate::failure(
                    store.active.clone(),
                    "The menu bar panel is not ready yet",
                ))
            }
        }
    } else {
        None
    };

    let mut shortcut_manager = app_handle.global_shortcut_manager();
    let update = update_registered_shortcut(&mut store.active, requested, |action| match action {
        ShortcutAction::Register(shortcut) => {
            let panel = panel
                .as_ref()
                .expect("registration requires an initialized panel")
                .clone();
            shortcut_manager
                .register(shortcut, move || toggle_spotlight_panel(&panel))
                .map_err(|error| format!("Unable to register {shortcut}: {error}"))
        }
        ShortcutAction::Unregister(shortcut) => shortcut_manager
            .unregister(shortcut)
            .map_err(|error| format!("Unable to unregister {shortcut}: {error}")),
    });

    Ok(update)
}

#[tauri::command]
pub fn show_spotlight(app_handle: AppHandle<Wry>) {
    if let Some(panel) = panel!(app_handle) {
        panel.show();
    }
}

#[tauri::command]
pub fn hide_spotlight(app_handle: AppHandle<Wry>) {
    if let Some(panel) = panel!(app_handle) {
        panel.order_out(None);
    }
}

fn toggle_spotlight_panel(panel: &RawNSPanel) {
    if panel.is_visible() {
        panel.order_out(None);
        return;
    }

    if let Err(status_error) = position_panel_near_status_item(panel) {
        if let Err(fallback_error) = position_panel_on_pointer_display(panel) {
            eprintln!(
                "TimeGlyd shortcut positioning warning: {status_error}; fallback: {fallback_error}"
            );
        }
    }
    panel.show();
}

fn position_panel_near_status_item(panel: &RawNSPanel) -> Result<(), String> {
    let status_frame =
        get_status_item_frame().ok_or_else(|| "menu-bar icon frame is unavailable".to_string())?;
    let status_center = NSPoint {
        x: status_frame.origin.x + (status_frame.size.width / 2.0),
        y: status_frame.origin.y + (status_frame.size.height / 2.0),
    };
    let monitor = get_monitor_containing_point(status_center)
        .or_else(get_primary_monitor)
        .ok_or_else(|| "menu-bar display is unavailable".to_string())?;
    let panel_frame = panel.frame();
    panel.set_frame(NSRect {
        origin: status_item_panel_origin(status_frame, monitor.visible_frame, panel_frame.size),
        size: panel_frame.size,
    });
    Ok(())
}

fn position_panel_on_pointer_display(panel: &RawNSPanel) -> Result<(), String> {
    let (monitor, used_fallback) = match get_monitor_with_cursor() {
        Some(monitor) => (monitor, false),
        None => (
            get_primary_monitor().ok_or_else(|| "no macOS display is available".to_string())?,
            true,
        ),
    };
    let panel_frame = panel.frame();
    panel.set_frame(NSRect {
        origin: centered_panel_origin(monitor.visible_frame, panel_frame.size),
        size: panel_frame.size,
    });

    if used_fallback {
        Err("the pointer display was unavailable; used the primary display".into())
    } else {
        Ok(())
    }
}

fn centered_panel_origin(visible_frame: NSRect, panel_size: NSSize) -> NSPoint {
    NSPoint {
        x: visible_frame.origin.x + ((visible_frame.size.width - panel_size.width).max(0.0) / 2.0),
        y: visible_frame.origin.y
            + ((visible_frame.size.height - panel_size.height).max(0.0) / 2.0),
    }
}

pub fn position_window_near_position(
    window: &Window<Wry>,
    position: PhysicalPosition<f64>,
    size: PhysicalSize<f64>,
) {
    if let Some(monitor) = get_monitor_with_cursor() {
        let handle: id = window.ns_window().unwrap() as _;
        let win_frame: NSRect = unsafe { handle.frame() };
        let origin = panel_origin(
            position,
            size,
            monitor.scale_factor,
            monitor.visible_frame,
            win_frame.size,
        );
        let rect = NSRect {
            origin,
            size: win_frame.size,
        };
        let _: () = unsafe { msg_send![handle, setFrame: rect display: YES] };
    }
}

pub fn hide_window(window: &Window<Wry>) {
    let handle: id = window.ns_window().unwrap() as _;
    let _: () = unsafe { msg_send![handle, orderOut: nil] };
}

pub fn is_window_visible(window: &Window<Wry>) -> bool {
    let handle: id = window.ns_window().unwrap() as _;
    let visible: BOOL = unsafe { msg_send![handle, isVisible] };
    visible == YES
}

fn panel_origin(
    tray_position: PhysicalPosition<f64>,
    tray_size: PhysicalSize<f64>,
    scale_factor: f64,
    visible_frame: NSRect,
    panel_size: NSSize,
) -> NSPoint {
    let tray_position = tray_position.to_logical::<f64>(scale_factor);
    let tray_size = tray_size.to_logical::<f64>(scale_factor);
    panel_origin_below_anchor(tray_position.x, tray_size.width, visible_frame, panel_size)
}

struct Monitor {
    pub visible_frame: NSRect,
    pub scale_factor: f64,
}

fn monitor_from_screen(screen: id) -> Monitor {
    let visible_frame: NSRect = unsafe { msg_send![screen, visibleFrame] };
    let scale_factor: CGFloat = unsafe { msg_send![screen, backingScaleFactor] };

    Monitor {
        visible_frame,
        scale_factor,
    }
}

/// Gets the Monitor with cursor
fn get_monitor_with_cursor() -> Option<Monitor> {
    objc::rc::autoreleasepool(|| {
        let mouse_location: NSPoint = unsafe { msg_send![class!(NSEvent), mouseLocation] };
        let screens: id = unsafe { msg_send![class!(NSScreen), screens] };
        let screens_iter: id = unsafe { msg_send![screens, objectEnumerator] };

        let screen_with_cursor: Option<id> = loop {
            let next_screen: id = unsafe { msg_send![screens_iter, nextObject] };
            if next_screen == nil {
                break None;
            }

            let frame: NSRect = unsafe { msg_send![next_screen, frame] };
            let is_mouse_in_screen_frame: BOOL =
                unsafe { NSMouseInRect(mouse_location, frame, NO) };
            if is_mouse_in_screen_frame == YES {
                break Some(next_screen);
            }
        };

        screen_with_cursor.map(monitor_from_screen)
    })
}

fn get_primary_monitor() -> Option<Monitor> {
    objc::rc::autoreleasepool(|| {
        let screens: id = unsafe { msg_send![class!(NSScreen), screens] };
        let screen: id = unsafe { msg_send![screens, firstObject] };

        if screen == nil {
            None
        } else {
            Some(monitor_from_screen(screen))
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: f64, y: f64, width: f64, height: f64) -> NSRect {
        NSRect {
            origin: NSPoint { x, y },
            size: NSSize { width, height },
        }
    }

    #[test]
    fn positions_panel_below_menu_bar_on_retina_display() {
        let origin = panel_origin(
            PhysicalPosition::new(2200.0, 48.0),
            PhysicalSize::new(48.0, 48.0),
            2.0,
            rect(0.0, 0.0, 1512.0, 956.0),
            NSSize::new(360.0, 400.0),
        );

        assert_eq!(origin.x, 932.0);
        assert_eq!(origin.y, 556.0);
    }

    #[test]
    fn respects_secondary_display_origin() {
        let origin = panel_origin(
            PhysicalPosition::new(-1200.0, 48.0),
            PhysicalSize::new(48.0, 48.0),
            2.0,
            rect(-1440.0, -1080.0, 1440.0, 1055.0),
            NSSize::new(360.0, 400.0),
        );

        assert_eq!(origin.x, -768.0);
        assert_eq!(origin.y, -425.0);
    }

    #[test]
    fn centers_panel_in_visible_frame() {
        let origin =
            centered_panel_origin(rect(0.0, 23.0, 1512.0, 956.0), NSSize::new(360.0, 400.0));

        assert_eq!(origin.x, 576.0);
        assert_eq!(origin.y, 301.0);
    }

    #[test]
    fn centers_panel_on_negative_origin_display() {
        let origin = centered_panel_origin(
            rect(-1440.0, -1080.0, 1440.0, 1055.0),
            NSSize::new(360.0, 400.0),
        );

        assert_eq!(origin.x, -900.0);
        assert_eq!(origin.y, -752.5);
    }

    #[test]
    fn positions_shortcut_panel_below_status_item() {
        let origin = status_item_panel_origin(
            rect(800.0, 956.0, 18.0, 24.0),
            rect(0.0, 0.0, 1512.0, 956.0),
            NSSize::new(360.0, 400.0),
        );

        assert_eq!(origin.x, 629.0);
        assert_eq!(origin.y, 556.0);
    }

    #[test]
    fn anchors_oversized_panel_at_visible_frame_origin() {
        let origin =
            centered_panel_origin(rect(100.0, 200.0, 320.0, 240.0), NSSize::new(400.0, 300.0));

        assert_eq!(origin.x, 100.0);
        assert_eq!(origin.y, 200.0);
    }

    #[test]
    fn keeps_panel_inside_visible_screen_edges() {
        let visible_frame = rect(0.0, 0.0, 1512.0, 956.0);
        let panel_size = NSSize::new(360.0, 400.0);

        let left = panel_origin(
            PhysicalPosition::new(0.0, 48.0),
            PhysicalSize::new(48.0, 48.0),
            2.0,
            visible_frame,
            panel_size,
        );
        let right = panel_origin(
            PhysicalPosition::new(3000.0, 48.0),
            PhysicalSize::new(48.0, 48.0),
            2.0,
            visible_frame,
            panel_size,
        );

        assert_eq!(left.x, 0.0);
        assert_eq!(right.x, 1152.0);
    }

    #[test]
    fn observes_outside_mouse_down_events() {
        let mask = dismissal_event_mask();

        assert!(mask.contains(NSEventMask::NSLeftMouseDownMask));
        assert!(mask.contains(NSEventMask::NSRightMouseDownMask));
        assert!(mask.contains(NSEventMask::NSOtherMouseDownMask));
    }

    #[test]
    fn accepts_hyper_shortcut_accelerator() {
        assert!(validate_canonical_shortcut("Command+Control+Alt+Shift+T").is_ok());
    }

    #[test]
    fn rejects_unknown_or_noncanonical_shortcuts() {
        assert!(validate_canonical_shortcut("Command+NotAKey").is_err());
        assert!(validate_canonical_shortcut("Shift+Command+T").is_err());
        assert!(validate_canonical_shortcut("T").is_err());
    }

    #[test]
    fn shortcut_registration_is_idempotent() {
        let mut active = Some("Command+T".to_string());
        let mut actions = Vec::<String>::new();

        let update =
            update_registered_shortcut(&mut active, Some("Command+T".to_string()), |action| {
                actions.push(format!("{action:?}"));
                Ok(())
            });

        assert_eq!(update, ShortcutUpdate::success(Some("Command+T".into())));
        assert!(actions.is_empty());
    }

    #[test]
    fn changes_registered_shortcut_transactionally() {
        let mut active = Some("Command+T".to_string());
        let mut actions = Vec::<String>::new();

        let update = update_registered_shortcut(
            &mut active,
            Some("Command+Shift+T".to_string()),
            |action| {
                actions.push(format!("{action:?}"));
                Ok(())
            },
        );

        assert_eq!(
            actions,
            vec!["Unregister(\"Command+T\")", "Register(\"Command+Shift+T\")",]
        );
        assert_eq!(
            update,
            ShortcutUpdate::success(Some("Command+Shift+T".into()))
        );
        assert_eq!(active, Some("Command+Shift+T".into()));
    }

    #[test]
    fn restores_previous_shortcut_when_registration_fails() {
        let mut active = Some("Command+T".to_string());
        let mut attempt = 0;

        let update =
            update_registered_shortcut(&mut active, Some("Command+Shift+T".to_string()), |_| {
                attempt += 1;
                if attempt == 2 {
                    Err("new shortcut unavailable".into())
                } else {
                    Ok(())
                }
            });

        assert_eq!(active, Some("Command+T".into()));
        assert_eq!(update.active, active);
        assert!(update
            .error
            .unwrap()
            .contains("previous shortcut was restored"));
    }

    #[test]
    fn clears_active_shortcut_when_rollback_fails() {
        let mut active = Some("Command+T".to_string());
        let mut attempt = 0;

        let update =
            update_registered_shortcut(&mut active, Some("Command+Shift+T".to_string()), |_| {
                attempt += 1;
                match attempt {
                    1 => Ok(()),
                    2 => Err("new shortcut unavailable".into()),
                    _ => Err("previous shortcut unavailable".into()),
                }
            });

        assert_eq!(active, None);
        assert_eq!(update.active, None);
        assert!(update
            .error
            .unwrap()
            .contains("previous shortcut could not be restored"));
    }

    #[test]
    fn keeps_shortcut_active_when_unregister_fails() {
        let mut active = Some("Command+T".to_string());

        let update =
            update_registered_shortcut(&mut active, None, |_| Err("unregister failed".into()));

        assert_eq!(active, Some("Command+T".into()));
        assert_eq!(update.active, active);
        assert!(update.error.unwrap().contains("Unable to disable"));
    }
}

extern "C" {
    pub fn object_setClass(obj: id, cls: id) -> id;
}

#[allow(non_upper_case_globals, dead_code)]
const NSWindowStyleMaskNonActivatingPanel: i32 = 1 << 7;

const CLS_NAME: &str = "RawNSPanel";

pub struct AppHandleWrapper<R: Runtime> {
    app_handle: AppHandle<R>,
}

impl<R: Runtime> AppHandleWrapper<R> {
    pub fn new(app_handle: AppHandle<R>) -> Self {
        Self { app_handle }
    }

    pub fn into_raw(self) -> *mut c_void {
        Box::into_raw(Box::new(self)) as *mut c_void
    }
}

pub struct RawNSPanel;

impl RawNSPanel {
    fn get_class() -> &'static Class {
        Class::get(CLS_NAME).unwrap_or_else(Self::define_class)
    }

    fn define_class() -> &'static Class {
        let mut cls = ClassDecl::new(CLS_NAME, class!(NSPanel))
            .unwrap_or_else(|| panic!("Unable to register {} class", CLS_NAME));

        unsafe {
            cls.add_method(
                sel!(canBecomeKeyWindow),
                Self::can_become_key_window as extern "C" fn(&Object, Sel) -> BOOL,
            );
        }

        cls.register()
    }

    pub fn make_key_and_order_front(&self, sender: Option<id>) {
        let _: () = unsafe { msg_send![self, makeKeyAndOrderFront: sender.unwrap_or(nil)] };
    }

    pub fn set_content_size(&self, width: f64, height: f64) {
        let _: () = unsafe { msg_send![self, setContentSize: (width, height)] };
    }

    pub fn released_when_closed(&self, flag: bool) {
        let _: () = unsafe { msg_send![self, setReleasedWhenClosed: if flag {YES} else {NO}] };
    }

    pub fn close(&self) {
        let _: () = unsafe { msg_send![self, close] };
    }

    pub fn handle(&mut self) -> ShareId<Self> {
        unsafe { ShareId::from_ptr(self as *mut Self) }
    }

    fn set_app_handle<R: Runtime>(&self, app_handle: AppHandle<R>) {
        let handle = app_handle as _;
        let app_handle_wrapper = AppHandleWrapper::new(handle);
        let _: () = unsafe { msg_send![self, setAppHandle: app_handle_wrapper.into_raw()] };
    }

    pub fn app_handle<R: Runtime>(&self) -> Option<AppHandle<R>> {
        let wrapper_ptr: *mut c_void = unsafe { msg_send![self, appHandle] };

        if wrapper_ptr.is_null() {
            return None;
        }

        let wrapper = unsafe { &*(wrapper_ptr as *const AppHandleWrapper<R>) };
        Some(wrapper.app_handle.clone())
    }

    /// Create an NSPanel from a Tauri window
    pub fn from_window<R: Runtime>(window: Window<R>) -> Id<Self> {
        let app_handle = window.app_handle();
        let nswindow: id = window.ns_window().unwrap() as _;
        let nspanel_class: id = unsafe { msg_send![Self::class(), class] };
        let panel = unsafe {
            object_setClass(nswindow, nspanel_class);
            Id::from_retained_ptr(nswindow as *mut RawNSPanel)
        };
        panel.set_app_handle(app_handle);
        panel
    }

    /// Returns YES to ensure that RawNSPanel can become a key window
    extern "C" fn can_become_key_window(_: &Object, _: Sel) -> BOOL {
        YES
    }
}
unsafe impl Message for RawNSPanel {}

impl RawNSPanel {
    pub fn show(&self) {
        self.make_first_responder(Some(self.content_view()));
        self.order_front_regardless();
        self.make_key_window();
    }

    pub fn is_visible(&self) -> bool {
        let flag: BOOL = unsafe { msg_send![self, isVisible] };
        flag == YES
    }

    fn make_key_window(&self) {
        let _: () = unsafe { msg_send![self, makeKeyWindow] };
    }

    fn order_front_regardless(&self) {
        let _: () = unsafe { msg_send![self, orderFrontRegardless] };
    }

    pub fn order_out(&self, sender: Option<id>) {
        let _: () = unsafe { msg_send![self, orderOut: sender.unwrap_or(nil)] };
    }

    fn frame(&self) -> NSRect {
        unsafe { msg_send![self, frame] }
    }

    fn set_frame(&self, frame: NSRect) {
        let _: () = unsafe { msg_send![self, setFrame: frame display: YES] };
    }

    fn content_view(&self) -> id {
        unsafe { msg_send![self, contentView] }
    }

    fn make_first_responder(&self, sender: Option<id>) {
        if let Some(responder) = sender {
            let _: () = unsafe { msg_send![self, makeFirstResponder: responder] };
        } else {
            let _: () = unsafe { msg_send![self, makeFirstResponder: self] };
        }
    }

    fn set_level(&self, level: i32) {
        let _: () = unsafe { msg_send![self, setLevel: level] };
    }

    fn set_style_mask(&self, style_mask: i32) {
        let _: () = unsafe { msg_send![self, setStyleMask: style_mask] };
    }

    fn set_collection_behaviour(&self, behaviour: NSWindowCollectionBehavior) {
        let _: () = unsafe { msg_send![self, setCollectionBehavior: behaviour] };
    }

    /// Create an NSPanel from Tauri's NSWindow
    fn from(ns_window: id) -> Id<Self> {
        let ns_panel: id = unsafe { msg_send![Self::class(), class] };
        unsafe {
            object_setClass(ns_window, ns_panel);
            Id::from_retained_ptr(ns_window as *mut Self)
        }
    }
}

impl INSObject for RawNSPanel {
    fn class() -> &'static runtime::Class {
        RawNSPanel::get_class()
    }
}

fn dismissal_event_mask() -> NSEventMask {
    NSEventMask::NSLeftMouseDownMask
        | NSEventMask::NSRightMouseDownMask
        | NSEventMask::NSOtherMouseDownMask
}

fn install_global_click_monitor(panel: ShareId<RawNSPanel>) -> Result<(), String> {
    let handler = ConcreteBlock::new(move |_: id| {
        if panel.is_visible() {
            panel.order_out(None);
        }
    })
    .copy();

    let monitor: id = unsafe {
        msg_send![
            class!(NSEvent),
            addGlobalMonitorForEventsMatchingMask: dismissal_event_mask()
            handler: &*handler
        ]
    };

    if monitor == nil {
        return Err("failed to install global mouse monitor for panel dismissal".into());
    }

    Ok(())
}

fn create_spotlight_panel(window: &Window<Wry>) -> ShareId<RawNSPanel> {
    // Convert NSWindow Object to NSPanel
    window.set_transparent_titlebar(true, true);
    let handle: id = window.ns_window().unwrap() as _;
    let panel = RawNSPanel::from(handle);
    let panel = panel.share();

    // Set panel above the main menu window level
    panel.set_level(NSMainMenuWindowLevel + 1);

    // Ensure that the panel can display over the top of fullscreen apps
    panel.set_collection_behaviour(
        NSWindowCollectionBehavior::NSWindowCollectionBehaviorTransient
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorMoveToActiveSpace
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary,
    );

    // Ensures panel does not activate
    // panel.set_style_mask(NSWindowStyleMaskNonActivatingPanel);

    panel
}
