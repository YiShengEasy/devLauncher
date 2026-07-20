use tauri::Manager;

#[derive(Clone, Copy, Debug)]
pub enum MainWindowAction {
    Toggle,
    Show,
    Hide,
    Minimize,
}

impl MainWindowAction {
    fn from_command(action: &str) -> Result<Self, String> {
        match action {
            "show" => Ok(Self::Show),
            "hide" => Ok(Self::Hide),
            "minimize" => Ok(Self::Minimize),
            _ => Err(format!("unsupported main window action: {action}")),
        }
    }
}

pub fn dispatch(app: &tauri::AppHandle, action: MainWindowAction) -> Result<(), String> {
    let queued_app = app.clone();
    app.run_on_main_thread(move || {
        if let Err(error) = execute(&queued_app, action) {
            eprintln!("main window action {action:?} failed: {error}");
        }
    })
    .map_err(|error| error.to_string())
}

pub async fn run_serialized<T, F>(app: &tauri::AppHandle, operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let _ = sender.send(operation());
    })
    .map_err(|error| error.to_string())?;
    receiver
        .await
        .map_err(|_| "serialized window action was cancelled".to_string())?
}

#[cfg(target_os = "windows")]
fn execute(app: &tauri::AppHandle, action: MainWindowAction) -> Result<(), String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindow, SW_HIDE,
        SW_MINIMIZE, SW_RESTORE, SW_SHOW,
    };

    if matches!(action, MainWindowAction::Toggle) {
        crate::entries::set_pet_action(app, "cozy");
    }

    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "window not found: main".to_string())?;
    let hwnd = win.hwnd().map_err(|error| error.to_string())?.0;
    // Use Win32 IsWindowVisible/IsIconic directly – Tauri's is_visible() would
    // return stale state here because we also show/hide via raw Win32, bypassing
    // Tauri's internal cache.
    let visible = unsafe { IsWindowVisible(hwnd) != 0 };
    let minimized = unsafe { IsIconic(hwnd) != 0 };
    eprintln!(
        "[DBG] execute({:?}) visible={} minimized={}",
        action, visible, minimized
    );
    let show_pet_before_main =
        matches!(action, MainWindowAction::Toggle) && (!visible || minimized);

    let resolved = match action {
        MainWindowAction::Toggle if visible && !minimized => MainWindowAction::Hide,
        MainWindowAction::Toggle => MainWindowAction::Show,
        other => other,
    };

    match resolved {
        MainWindowAction::Show => {
            if show_pet_before_main {
                crate::entries::show_pet_for_keyboard(app)?;
            }
            crate::window_pinning::apply_window_pin_state(app, "main")?;
            unsafe {
                use windows_sys::Win32::System::Threading::{
                    AttachThreadInput, GetCurrentThreadId,
                };
                use windows_sys::Win32::UI::WindowsAndMessaging::{
                    GetForegroundWindow, GetWindowThreadProcessId,
                };
                // AttachThreadInput: temporarily join our thread's input queue to the
                // current foreground thread's queue.  This grants us the foreground
                // permission needed for SetForegroundWindow, even when we are a
                // background process (i.e. no prior user interaction with our window).
                let fg_hwnd = GetForegroundWindow();
                let fg_tid = GetWindowThreadProcessId(fg_hwnd, std::ptr::null_mut());
                let our_tid = GetCurrentThreadId();
                let attached = fg_tid != 0 && fg_tid != our_tid;
                if attached {
                    AttachThreadInput(our_tid, fg_tid, 1);
                }
                ShowWindow(hwnd, if minimized { SW_RESTORE } else { SW_SHOW });
                BringWindowToTop(hwnd);
                SetForegroundWindow(hwnd);
                if attached {
                    AttachThreadInput(our_tid, fg_tid, 0);
                }
            }
        }
        MainWindowAction::Hide => unsafe {
            ShowWindow(hwnd, SW_HIDE);
        },
        MainWindowAction::Minimize => unsafe {
            ShowWindow(hwnd, SW_MINIMIZE);
        },
        MainWindowAction::Toggle => unreachable!("toggle is resolved before execution"),
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn execute(app: &tauri::AppHandle, action: MainWindowAction) -> Result<(), String> {
    if matches!(action, MainWindowAction::Toggle) {
        crate::entries::set_pet_action(app, "cozy");
    }

    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "window not found: main".to_string())?;
    let visible = win.is_visible().map_err(|error| error.to_string())?;
    let minimized = win.is_minimized().map_err(|error| error.to_string())?;
    match action {
        MainWindowAction::Toggle if visible && !minimized => {
            win.hide().map_err(|error| error.to_string())
        }
        MainWindowAction::Toggle => crate::entries::show_keyboard_window(app.clone(), None),
        MainWindowAction::Show => crate::entries::restore_main_window(app),
        MainWindowAction::Hide => win.hide().map_err(|error| error.to_string()),
        MainWindowAction::Minimize => win.minimize().map_err(|error| error.to_string()),
    }
}

#[tauri::command]
pub fn control_main_window(app: tauri::AppHandle, action: String) -> Result<(), String> {
    dispatch(&app, MainWindowAction::from_command(&action)?)
}
