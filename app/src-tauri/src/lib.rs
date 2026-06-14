mod actions;
mod builtins;
mod config;
mod entries;
mod types;
mod utils;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_single_instance::Builder::new()
                .callback(|app, _argv, _cwd| {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.unminimize();
                        let _ = win.set_focus();
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            config::load_config,
            config::save_config,
            config::get_config_path,
            actions::execute_action,
            actions::save_ssh_password,
            actions::delete_ssh_password,
            actions::save_web_password,
            actions::delete_web_password,
            builtins::clipboard::get_clipboard_history,
            builtins::clipboard::get_clipboard_text,
            builtins::clipboard::set_clipboard_text,
            builtins::clipboard::set_clipboard_image,
            builtins::clipboard::clear_clipboard_history,
            builtins::clipboard::toggle_clipboard_window,
            builtins::clipboard::get_clipboard_favorites,
            builtins::clipboard::add_favorite,
            builtins::clipboard::remove_favorite,
            builtins::clipboard::clear_favorites,
            builtins::json::toggle_json_helper_window,
            builtins::totp::toggle_totp_window,
            builtins::totp::load_totp_tokens,
            builtins::totp::save_totp_tokens,
            builtins::screenshotai::toggle_screenshotai_window,
            builtins::screenshotai::show_screenshotai_window,
            builtins::remotedesk::toggle_remotedesk_window,
            builtins::remotedesk::load_remotedesk_profiles,
            builtins::remotedesk::save_remotedesk_profiles,
            builtins::remotedesk::save_remotedesk_password,
            builtins::remotedesk::delete_remotedesk_password,
            builtins::remotedesk::launch_rdp,
            builtins::remotedesk::start_remotedesk_host,
            builtins::remotedesk::stop_remotedesk_host,
            builtins::remotedesk::get_remotedesk_host_status,
            builtins::remotedesk::start_frp,
            builtins::remotedesk::stop_frp,
            builtins::remotedesk::get_frp_status,
            builtins::remotedesk::start_ngrok,
            builtins::remotedesk::stop_ngrok,
            builtins::remotedesk::get_ngrok_status,
            builtins::terminal::terminal_spawn,
            builtins::terminal::terminal_write,
            builtins::terminal::terminal_resize,
            builtins::terminal::terminal_kill,
            builtins::terminal::terminal_run,
            builtins::terminal::terminal_take_pending_cmd,
            builtins::terminal::toggle_terminal_window,
            builtins::screenshot::toggle_screenshot_window,
            builtins::screenshot::show_screenshot_editor_window,
            builtins::screenshot::get_pending_screenshot,
            builtins::screenshot::screenshot_write_file,
            builtins::webaccounts::toggle_webaccounts_window,
            builtins::quickmemory::toggle_quickmemory_window,
            entries::toggle_search_window,
            entries::show_search_window,
            entries::toggle_ocr_window,
            entries::toggle_pet_window,
            utils::icon::extract_app_icons,
            utils::favicon::get_cached_favicons,
            utils::favicon::refresh_favicons,
            utils::favicon::get_favicons,
        ])
        .setup(|app| {
            utils::icon::setup(app);
            builtins::remotedesk::setup(app);
            builtins::terminal::setup(app);
            builtins::screenshot::setup(app);
            builtins::clipboard::setup(app);

            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &settings_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("DevLauncher")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.unminimize();
                            let _ = win.set_focus();
                        }
                    }
                    "settings" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.unminimize();
                            let _ = win.set_focus();
                            let _ = app.emit("open-settings", ());
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
