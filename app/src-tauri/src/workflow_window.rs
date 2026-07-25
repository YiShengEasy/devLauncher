use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::window_pinning;

const WORKFLOW_WINDOW_LABEL: &str = "workflow";

fn get_or_create_workflow_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(WORKFLOW_WINDOW_LABEL) {
        return Ok(window);
    }

    let window = WebviewWindowBuilder::new(
        app,
        WORKFLOW_WINDOW_LABEL,
        WebviewUrl::App("index.html?entry=workflow-window".into()),
    )
    .title("DevLauncher 工作流编排器")
    .inner_size(1180.0, 720.0)
    .min_inner_size(960.0, 620.0)
    .resizable(true)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false)
    .build()
    .map_err(|error| error.to_string())?;

    window.center().map_err(|error| error.to_string())?;
    Ok(window)
}

#[tauri::command]
pub fn show_workflow_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = get_or_create_workflow_window(&app)?;
    let _ = window_pinning::apply_window_pin_state(&app, WORKFLOW_WINDOW_LABEL);
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}
