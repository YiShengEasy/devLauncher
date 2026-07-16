#[cfg(target_os = "macos")]
mod macos {
    use crate::entries;
    use block2::RcBlock;
    use objc2_app_kit::{NSEvent, NSEventMask, NSEventModifierFlags, NSEventType};
    use std::ptr::NonNull;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};

    const DOUBLE_CONTROL_WINDOW_SECONDS: f64 = 0.35;
    const LEFT_CONTROL_KEY_CODE: u16 = 59;
    const RIGHT_CONTROL_KEY_CODE: u16 = 62;

    struct ControlTapState {
        last_tap_timestamp: Option<f64>,
        control_down: bool,
    }

    impl ControlTapState {
        fn register_control_press(&mut self, timestamp: f64) -> bool {
            if self.control_down {
                return false;
            }

            self.control_down = true;
            let is_double_tap = self
                .last_tap_timestamp
                .map(|last| timestamp - last <= DOUBLE_CONTROL_WINDOW_SECONDS)
                .unwrap_or(false);

            self.last_tap_timestamp = if is_double_tap { None } else { Some(timestamp) };
            is_double_tap
        }

        fn register_control_release(&mut self) {
            self.control_down = false;
        }
    }

    static EVENT_MONITORS_INSTALLED: AtomicBool = AtomicBool::new(false);

    fn is_control_key_code(key_code: u16) -> bool {
        key_code == LEFT_CONTROL_KEY_CODE || key_code == RIGHT_CONTROL_KEY_CODE
    }

    fn control_without_other_shortcut_modifiers(flags: NSEventModifierFlags) -> bool {
        flags.contains(NSEventModifierFlags::Control)
            && !flags.intersects(
                NSEventModifierFlags::Shift
                    | NSEventModifierFlags::Option
                    | NSEventModifierFlags::Command,
            )
    }

    fn handle_control_event(
        event: NonNull<NSEvent>,
        app: &tauri::AppHandle,
        state: &Arc<Mutex<ControlTapState>>,
    ) {
        let event = unsafe { event.as_ref() };
        if !is_control_key_code(event.keyCode()) {
            return;
        }

        let flags = event.modifierFlags();
        let is_control_press = control_without_other_shortcut_modifiers(flags);
        let should_toggle = {
            let Ok(mut state) = state.lock() else {
                return;
            };
            if is_control_press {
                state.register_control_press(event.timestamp())
            } else {
                state.register_control_release();
                false
            }
        };

        if should_toggle {
            let _ = entries::toggle_keyboard_window(app.clone());
        }
    }

    pub fn setup(app: &tauri::AppHandle) {
        if EVENT_MONITORS_INSTALLED.load(Ordering::Relaxed) {
            return;
        }

        let state = Arc::new(Mutex::new(ControlTapState {
            last_tap_timestamp: None,
            control_down: false,
        }));

        let global_app = app.clone();
        let global_state = Arc::clone(&state);
        let global_block = RcBlock::new(move |event: NonNull<NSEvent>| {
            handle_control_event(event, &global_app, &global_state);
        });

        let global_monitor = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(
            NSEventMask::from_type(NSEventType::FlagsChanged),
            &global_block,
        );

        let local_app = app.clone();
        let local_state = Arc::clone(&state);
        let local_block = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
            handle_control_event(event, &local_app, &local_state);
            event.as_ptr()
        });

        let local_monitor = unsafe {
            NSEvent::addLocalMonitorForEventsMatchingMask_handler(
                NSEventMask::from_type(NSEventType::FlagsChanged),
                &local_block,
            )
        };

        if let Some(monitor) = global_monitor {
            std::mem::forget(monitor);
        }
        if let Some(monitor) = local_monitor {
            std::mem::forget(monitor);
        }
        EVENT_MONITORS_INSTALLED.store(true, Ordering::Relaxed);
    }
}

#[cfg(target_os = "macos")]
pub use macos::setup;

#[cfg(target_os = "windows")]
mod windows {
    use crate::entries;
    use std::ptr::null_mut;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Mutex, OnceLock};
    use std::time::{Duration, Instant};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, SetWindowsHookExW, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL,
        WM_KEYDOWN, WM_KEYUP,
    };

    const DOUBLE_CONTROL_WINDOW: Duration = Duration::from_millis(350);
    const VK_LCONTROL: u32 = 0xA2;
    const VK_RCONTROL: u32 = 0xA3;

    #[derive(Default)]
    struct ControlTapState {
        last_tap: Option<Instant>,
        control_down: bool,
    }

    impl ControlTapState {
        fn register_control_press(&mut self, now: Instant) -> bool {
            if self.control_down {
                return false;
            }

            self.control_down = true;
            let is_double_tap = self
                .last_tap
                .map(|last| now.duration_since(last) <= DOUBLE_CONTROL_WINDOW)
                .unwrap_or(false);
            self.last_tap = if is_double_tap { None } else { Some(now) };
            is_double_tap
        }

        fn register_control_release(&mut self) {
            self.control_down = false;
        }

        fn cancel_pending_tap(&mut self) {
            self.last_tap = None;
        }
    }

    static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
    static CONTROL_TAP_STATE: OnceLock<Mutex<ControlTapState>> = OnceLock::new();
    static HOOK_INSTALL_STARTED: AtomicBool = AtomicBool::new(false);

    fn is_control_key(vk_code: u32) -> bool {
        vk_code == VK_LCONTROL || vk_code == VK_RCONTROL
    }

    unsafe extern "system" fn keyboard_hook(code: i32, w_param: usize, l_param: isize) -> isize {
        if code >= 0 {
            let event = unsafe { &*(l_param as *const KBDLLHOOKSTRUCT) };
            let state = CONTROL_TAP_STATE.get_or_init(|| Mutex::new(ControlTapState::default()));

            if let Ok(mut state) = state.lock() {
                if is_control_key(event.vkCode) {
                    if w_param as u32 == WM_KEYDOWN {
                        if state.register_control_press(Instant::now()) {
                            if let Some(app) = APP_HANDLE.get() {
                                let _ = entries::toggle_keyboard_window(app.clone());
                            }
                        }
                    } else if w_param as u32 == WM_KEYUP {
                        state.register_control_release();
                    }
                } else if w_param as u32 == WM_KEYDOWN {
                    state.cancel_pending_tap();
                }
            }
        }

        unsafe { CallNextHookEx(null_mut(), code, w_param, l_param) }
    }

    pub fn setup(app: &tauri::AppHandle) {
        let _ = APP_HANDLE.set(app.clone());
        if HOOK_INSTALL_STARTED.swap(true, Ordering::Relaxed) {
            return;
        }

        std::thread::spawn(|| unsafe {
            let module = GetModuleHandleW(null_mut());
            let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook), module, 0);
            if hook.is_null() {
                HOOK_INSTALL_STARTED.store(false, Ordering::Relaxed);
                return;
            }

            let mut message: MSG = std::mem::zeroed();
            while GetMessageW(&mut message, null_mut(), 0, 0) > 0 {}
        });
    }
}

#[cfg(target_os = "windows")]
pub use windows::setup;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn setup(_app: &tauri::AppHandle) {}
