use std::{
    ffi::c_void,
    sync::{Mutex, Once},
};

use objc_id::{Id, ShareId};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, Window, Wry};

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
}

#[derive(Default)]
pub struct State(pub Mutex<Store>);

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

static INIT: Once = Once::new();
#[allow(dead_code)]
static PANEL_LABEL: &str = "main";

#[tauri::command]
pub fn init_spotlight_window(app_handle: AppHandle<Wry>, window: Window<Wry>) {
    INIT.call_once(|| {
        set_state!(app_handle, panel, Some(create_spotlight_panel(&window)));
        // register_shortcut(app_handle);
    });
}

// fn register_shortcut(app_handle: AppHandle<Wry>) {
//     let mut shortcut_manager = app_handle.global_shortcut_manager();
//     let window = app_handle.get_window(PANEL_LABEL).unwrap();

//     let panel = panel!(app_handle);
//     shortcut_manager
//         .register("Cmd+k", move || {
//             position_window_at_the_center_of_the_monitor_with_cursor(&window);

//             if panel.is_visible() {
//                 hide_spotlight(window.app_handle());
//             } else {
//                 show_spotlight(window.app_handle());
//             };
//         })
//         .unwrap();
// }

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

/// Positions a given window at the center of the monitor with cursor
// fn position_window_at_the_center_of_the_monitor_with_cursor(window: &Window<Wry>) {
//     if let Some(monitor) = get_monitor_with_cursor() {
//         let display_size = monitor.size.to_logical::<f64>(monitor.scale_factor);
//         let display_pos = monitor.position.to_logical::<f64>(monitor.scale_factor);

//         let handle: id = window.ns_window().unwrap() as _;
//         let win_frame: NSRect = unsafe { handle.frame() };
//         let rect = NSRect {
//             origin: NSPoint {
//                 x: (display_pos.x + (display_size.width / 2.0)) - (win_frame.size.width / 2.0),
//                 y: (display_pos.y + (display_size.height / 2.0)) - (win_frame.size.height / 2.0),
//             },
//             size: win_frame.size,
//         };
//         let _: () = unsafe { msg_send![handle, setFrame: rect display: YES] };
//     }
// }

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

fn panel_origin(
    tray_position: PhysicalPosition<f64>,
    tray_size: PhysicalSize<f64>,
    scale_factor: f64,
    visible_frame: NSRect,
    panel_size: NSSize,
) -> NSPoint {
    let tray_position = tray_position.to_logical::<f64>(scale_factor);
    let tray_size = tray_size.to_logical::<f64>(scale_factor);
    let desired_x = tray_position.x + (tray_size.width / 2.0) - (panel_size.width / 2.0);
    let min_x = visible_frame.origin.x;
    let max_x = (visible_frame.origin.x + visible_frame.size.width - panel_size.width).max(min_x);

    NSPoint {
        x: desired_x.clamp(min_x, max_x),
        // visibleFrame uses global Cocoa coordinates and excludes the menu bar.
        y: visible_frame.origin.y + visible_frame.size.height - panel_size.height,
    }
}

struct Monitor {
    pub visible_frame: NSRect,
    pub scale_factor: f64,
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

        if let Some(screen) = screen_with_cursor {
            let visible_frame: NSRect = unsafe { msg_send![screen, visibleFrame] };
            let scale_factor: CGFloat = unsafe { msg_send![screen, backingScaleFactor] };
            let scale_factor: f64 = scale_factor;

            return Some(Monitor {
                visible_frame,
                scale_factor,
            });
        }

        None
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
    fn panel_overrides_key_window_resignation() {
        let selector = sel!(resignKeyWindow);
        let panel_implementation = RawNSPanel::get_class()
            .instance_method(selector)
            .unwrap()
            .implementation() as usize;
        let default_implementation = class!(NSPanel)
            .instance_method(selector)
            .unwrap()
            .implementation() as usize;

        assert_ne!(panel_implementation, default_implementation);
    }

    #[test]
    fn observes_outside_mouse_down_events() {
        let mask = dismissal_event_mask();

        assert!(mask.contains(NSEventMask::NSLeftMouseDownMask));
        assert!(mask.contains(NSEventMask::NSRightMouseDownMask));
        assert!(mask.contains(NSEventMask::NSOtherMouseDownMask));
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
            cls.add_method(
                sel!(resignKeyWindow),
                Self::resign_key_window as extern "C" fn(&Object, Sel),
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

    extern "C" fn resign_key_window(this: &Object, _: Sel) {
        unsafe {
            let _: () = msg_send![super(this, class!(NSPanel)), resignKeyWindow];
            let _: () = msg_send![this, orderOut: nil];
        }
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

fn install_global_click_monitor(panel: ShareId<RawNSPanel>) {
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

    assert!(
        monitor != nil,
        "failed to install global mouse monitor for panel dismissal"
    );
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

    install_global_click_monitor(panel.clone());

    panel
}
