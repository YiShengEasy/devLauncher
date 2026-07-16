mod actions;
mod builtins;
mod cloud_sync;
mod config;
mod entries;
mod keyboard_control_tap;
mod ocr;
mod platform;
mod plugin_manager;
mod plugin_manifest;
mod translation;
mod types;
mod utils;
mod video_tools;
mod window_pinning;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

const KEYBOARD_GLOBAL_SHORTCUT: &str = "CommandOrControl+Option+J";
const PET_GLOBAL_SHORTCUT: &str = "CommandOrControl+Option+P";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_single_instance::Builder::new()
                .callback(|app, _argv, _cwd| {
                    let _ = entries::restore_main_window(app);
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts([KEYBOARD_GLOBAL_SHORTCUT, PET_GLOBAL_SHORTCUT])
                .expect("failed to parse built-in global shortcuts")
                .with_handler(|app, _shortcut, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }

                    let keyboard_shortcut = KEYBOARD_GLOBAL_SHORTCUT.parse::<Shortcut>();
                    let pet_shortcut = PET_GLOBAL_SHORTCUT.parse::<Shortcut>();

                    if keyboard_shortcut
                        .as_ref()
                        .map(|shortcut| shortcut.id() == event.id)
                        .unwrap_or(false)
                    {
                        let _ = entries::toggle_keyboard_window(app.clone());
                        return;
                    }

                    if pet_shortcut
                        .as_ref()
                        .map(|shortcut| shortcut.id() == event.id)
                        .unwrap_or(false)
                    {
                        let _ = entries::toggle_pet_window(app.clone());
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            config::load_config,
            config::save_config,
            config::get_config_path,
            cloud_sync::sync_get_status,
            cloud_sync::sync_generate_key,
            cloud_sync::sync_save_key,
            cloud_sync::sync_upload_snapshot,
            cloud_sync::sync_restore_latest_snapshot,
            platform::get_platform_capabilities,
            platform::get_default_shell,
            platform::get_macos_permission_status,
            platform::open_macos_permission_settings,
            plugin_manager::list_installed_plugins,
            plugin_manager::install_plugin_from_zip,
            plugin_manager::fetch_marketplace_index,
            plugin_manager::install_plugin_from_market,
            plugin_manager::set_plugin_enabled,
            plugin_manager::uninstall_plugin,
            plugin_manager::get_plugin_entry_url,
            plugin_manager::get_plugin_entry_content,
            plugin_manager::open_plugin_window,
            video_tools::probe_video,
            video_tools::sample_video_frames,
            video_tools::cancel_video_frame_sampler,
            video_tools::open_video_tool_path,
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
            builtins::clipboard::show_clipboard_window,
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
            builtins::screenshot::create_pinned_screenshot_window,
            builtins::screenshot::get_pinned_screenshot,
            builtins::webaccounts::toggle_webaccounts_window,
            builtins::quickmemory::load_quickmemory_data,
            builtins::quickmemory::save_quickmemory_data,
            builtins::quickmemory::toggle_quickmemory_window,
            entries::toggle_search_window,
            entries::show_search_window,
            entries::show_pet_window,
            entries::show_keyboard_window,
            entries::switch_to_pet_mode,
            entries::switch_to_keyboard_mode,
            entries::toggle_pet_window,
            entries::set_pet_codex_status,
            entries::take_pet_mcp_events,
            ocr::ocr_recognize_image,
            ocr::ocr_recognize_image_layout,
            translation::translate_text,
            utils::icon::extract_app_icons,
            utils::favicon::get_cached_favicons,
            utils::favicon::refresh_favicons,
            utils::favicon::get_favicons,
            window_pinning::get_window_pin_state,
            window_pinning::set_window_pin_state,
            window_pinning::list_window_pin_states,
        ])
        .setup(|app| {
            utils::icon::setup(app);
            builtins::remotedesk::setup(app);
            builtins::terminal::setup(app);
            builtins::screenshot::setup(app);
            builtins::clipboard::setup(app);
            video_tools::setup(app);
            keyboard_control_tap::setup(app.handle());
            window_pinning::apply_all_startup_pin_states(app.handle());
            let _ = entries::show_pet_window(app.handle().clone(), None);

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
                        let _ = entries::restore_main_window(app);
                    }
                    "settings" => {
                        if entries::restore_main_window(app).is_ok() {
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
                                let _ = entries::restore_main_window(app);
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| match event {
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                let _ = entries::restore_main_window(_app);
            }
            _ => {}
        });
}
