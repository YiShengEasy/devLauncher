mod actions;
pub mod builtins;
mod cloud_sync;
pub mod config;
mod entries;
mod keyboard_control_tap;
mod main_window_control;
mod ocr;
mod platform;
mod plugin_manager;
mod plugin_manifest;
mod translation;
pub mod types;
mod utils;
mod video_tools;
mod widget_sync;
mod window_pinning;
pub mod workflow;
pub mod workflow_capabilities;
mod workflow_window;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

#[cfg(target_os = "macos")]
const KEYBOARD_GLOBAL_SHORTCUT: &str = "Option+J";
#[cfg(not(target_os = "macos"))]
const KEYBOARD_GLOBAL_SHORTCUT: &str = "CommandOrControl+Option+J";
#[cfg(target_os = "macos")]
const PET_GLOBAL_SHORTCUT: &str = "Option+P";
#[cfg(not(target_os = "macos"))]
const PET_GLOBAL_SHORTCUT: &str = "CommandOrControl+Option+P";

#[derive(Debug, PartialEq, Eq)]
enum WidgetDeepLinkAction {
    Clipboard,
    Binding { page: usize, key: String },
}

fn parse_widget_deep_link(value: &str) -> Option<WidgetDeepLinkAction> {
    let url = tauri::Url::parse(value).ok()?;
    if url.scheme() != "devlauncher" {
        return None;
    }

    match url.host_str()? {
        "run" => url
            .query_pairs()
            .any(|(name, value)| name == "feature" && value == "clipboard")
            .then_some(WidgetDeepLinkAction::Clipboard),
        "run-binding" => {
            let mut page = None;
            let mut key = None;
            for (name, value) in url.query_pairs() {
                match name.as_ref() {
                    "page" => page = value.parse::<usize>().ok(),
                    "key" => key = Some(value.to_ascii_uppercase()),
                    _ => {}
                }
            }
            Some(WidgetDeepLinkAction::Binding {
                page: page?,
                key: key?.to_string(),
            })
        }
        _ => None,
    }
}

fn handle_widget_deep_link(app: &tauri::AppHandle, value: &str) -> bool {
    let Some(action) = parse_widget_deep_link(value) else {
        return false;
    };

    let _ = entries::hide_primary_entry_windows(app);
    let result = match action {
        WidgetDeepLinkAction::Clipboard => builtins::clipboard::show_clipboard_window(app.clone()),
        WidgetDeepLinkAction::Binding { page, key } => config::load_config(app.clone())
            .and_then(|config| {
                let page = config
                    .pages
                    .get(page)
                    .ok_or_else(|| "widget binding page not found".to_string())?;
                page.keys
                    .get(&key)
                    .ok_or_else(|| "widget binding key not found".to_string())
                    .cloned()
            })
            .and_then(|action| workflow::execute_bound_action(app, &action)),
    };

    if let Err(error) = result {
        eprintln!("failed to execute widget action: {error}");
    }
    true
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(workflow::WorkflowEngineState::default())
        .plugin(
            tauri_plugin_single_instance::Builder::new()
                .callback(|app, argv, _cwd| {
                    let widget_action = argv.iter().any(|arg| handle_widget_deep_link(app, arg));

                    if !widget_action {
                        let _ = main_window_control::dispatch(
                            app,
                            main_window_control::MainWindowAction::Show,
                        );
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_deep_link::init())
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
            cloud_sync::sync_get_local_status,
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
            workflow::validate_workflow,
            workflow::set_workflow_workspace_mode,
            workflow::set_binding_workspace_mode,
            workflow::run_workflow,
            workflow::run_workflow_step,
            workflow::get_workflow_run,
            workflow::list_workflow_runs,
            workflow::clear_workflow_run_history,
            workflow::cancel_workflow_run,
            workflow::confirm_workflow_step,
            workflow_capabilities::list_workflow_capabilities,
            workflow_window::show_workflow_window,
            main_window_control::control_main_window,
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
            builtins::remotedesk_rdp::get_rdp_capabilities,
            builtins::remotedesk_rdp::start_rdp_host,
            builtins::remotedesk_rdp::stop_rdp_host,
            builtins::remotedesk_rdp::get_rdp_host_status,
            builtins::terminal::terminal_spawn,
            builtins::terminal::terminal_snapshot,
            builtins::terminal::terminal_write,
            builtins::terminal::terminal_resize,
            builtins::terminal::terminal_kill,
            builtins::terminal::terminal_run,
            builtins::terminal::terminal_take_pending_cmd,
            builtins::terminal::toggle_terminal_window,
            builtins::screenshot::toggle_screenshot_window,
            builtins::screenshot::show_screenshot_window,
            builtins::screenshot::show_screenshot_editor_window,
            builtins::screenshot::get_pending_screenshot,
            builtins::screenshot::screenshot_write_file,
            builtins::screenshot::create_pinned_screenshot_window,
            builtins::screenshot::get_pinned_screenshot,
            builtins::webaccounts::toggle_webaccounts_window,
            builtins::quickmemory::load_quickmemory_data,
            builtins::quickmemory::save_quickmemory_data,
            builtins::quickmemory::toggle_quickmemory_window,
            builtins::projecttasks::discover_runme_tasks,
            builtins::projecttasks::discover_project_tasks,
            builtins::projecttasks::runme_task_command,
            builtins::projecttasks::project_task_command,
            builtins::projecttasks::toggle_projecttasks_window,
            builtins::projecttasks::load_projecttasks_data,
            builtins::projecttasks::save_projecttasks_data,
            builtins::projecttasks::list_project_profiles,
            builtins::projecttasks::relocate_project_profile,
            builtins::projecttasks::remove_project_profile,
            builtins::projectconfigs::discover_project_configs,
            builtins::projectconfigs::read_project_config,
            builtins::projectconfigs::validate_project_config,
            builtins::projectconfigs::save_project_config,
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
            builtins::remotedesk_rdp::setup(app);
            builtins::terminal::setup(app);
            builtins::screenshot::setup(app);
            builtins::clipboard::setup(app);
            video_tools::setup(app);
            keyboard_control_tap::setup(app.handle());
            workflow::setup_run_history(app.handle());
            workflow::setup_scheduler(app.handle().clone());
            window_pinning::apply_all_startup_pin_states(app.handle());
            if let Ok(config) = config::load_config(app.handle().clone()) {
                if let Err(error) = widget_sync::sync_widget_snapshot(app.handle(), &config) {
                    eprintln!("failed to sync widget shortcuts at startup: {error}");
                }
            }
            let _ = entries::show_pet_window(app.handle().clone(), None);

            if let Some(urls) = app.deep_link().get_current()? {
                urls.iter().for_each(|url| {
                    handle_widget_deep_link(app.handle(), url.as_str());
                });
            }

            let deep_link_app = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                event.urls().iter().for_each(|url| {
                    handle_widget_deep_link(&deep_link_app, url.as_str());
                });
            });

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
                        let _ = main_window_control::dispatch(
                            app,
                            main_window_control::MainWindowAction::Show,
                        );
                    }
                    "settings" => {
                        if main_window_control::dispatch(
                            app,
                            main_window_control::MainWindowAction::Show,
                        )
                        .is_ok()
                        {
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
                        let _ = main_window_control::dispatch(
                            app,
                            main_window_control::MainWindowAction::Toggle,
                        );
                    }
                })
                .build(app)?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                let _ =
                    main_window_control::dispatch(app, main_window_control::MainWindowAction::Show);
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::{parse_widget_deep_link, WidgetDeepLinkAction};

    #[test]
    fn parses_widget_deep_links() {
        assert_eq!(
            parse_widget_deep_link("devlauncher://run?feature=clipboard"),
            Some(WidgetDeepLinkAction::Clipboard)
        );
        assert_eq!(
            parse_widget_deep_link("devlauncher://run-binding?page=1&key=q"),
            Some(WidgetDeepLinkAction::Binding {
                page: 1,
                key: "Q".into(),
            })
        );
        assert_eq!(
            parse_widget_deep_link("devlauncher://run?feature=keyboard"),
            None
        );
    }
}
