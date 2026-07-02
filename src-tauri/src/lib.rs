// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod activate;
mod api;
mod automation;
mod capture;
mod db;
mod shortcuts;
mod window;

/// Tray / small UI icon from `icons/tray.png` (transparent D mark).
fn tray_icon_image() -> Result<tauri::image::Image<'static>, String> {
    let bytes = include_bytes!("../icons/tray.png");
    let img = image::load_from_memory(bytes).map_err(|e| e.to_string())?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let raw = rgba.into_raw();
    Ok(tauri::image::Image::new_owned(raw, w, h))
}
use std::sync::Mutex;
use tauri::Manager;
#[cfg(target_os = "macos")]
use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_posthog::{init as posthog_init, PostHogConfig, PostHogOptions};
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use capture::CaptureState;


#[cfg(target_os = "macos")]
#[allow(deprecated)]
use tauri_nspanel::{cocoa::appkit::NSWindowCollectionBehavior, panel_delegate, WebviewWindowExt};



#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Walk up from the current executable to find the containing .app bundle path.
#[cfg(target_os = "macos")]
fn find_running_app_bundle(app_name: &str) -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let mut path: &std::path::Path = &exe;

    // Walk up looking for the .app directory (e.g. /Applications/Deskify.app/Contents/MacOS/deskify)
    while let Some(parent) = path.parent() {
        if let Some(name) = parent.file_name() {
            let name_str = name.to_string_lossy();
            if name_str.ends_with(".app") && name_str == app_name {
                return Some(parent.to_path_buf());
            }
        }
        path = parent;
    }

    None
}

/// Attempt to replace an existing .app bundle with the new one.
/// Uses rename-then-copy-then-delete to avoid data loss if the copy fails.
/// Returns true if the copy succeeded, false if it failed (e.g. TCC permission prompt).
#[cfg(target_os = "macos")]
fn try_replace_app_bundle(src: &std::path::Path, dst: &std::path::Path) -> bool {
    // Move the old bundle out of the way first (rename, don't delete).
    // This way if the copy fails, we can restore the old version.
    let backup_path = if dst.exists() {
        let backup = dst.with_extension("app.old");
        // Remove any previous .old backup
        if backup.exists() {
            let _ = std::fs::remove_dir_all(&backup);
        }
        if let Err(e) = std::fs::rename(dst, &backup) {
            println!("[Updater:Rust] Could not rename old bundle: {}", e);
            // Try to remove it instead (last resort — no backup to restore)
            if let Err(e2) = std::fs::remove_dir_all(dst) {
                println!("[Updater:Rust] Could not remove old bundle: {}", e2);
                return false;
            }
            None // Rename failed (removed instead), nothing to restore
        } else {
            Some(backup) // Rename succeeded, can restore from here
        }
    } else {
        None
    };

    // Use ditto for macOS bundle copy (preserves permissions, resource forks)
    let mut copy_ok = match std::process::Command::new("ditto")
        .args([&src.to_string_lossy(), &dst.to_string_lossy()])
        .status()
    {
        Ok(status) if status.success() => true,
        Ok(status) => {
            println!(
                "[Updater:Rust] ditto exited with code {:?}, trying cp fallback...",
                status.code()
            );
            false
        }
        Err(e) => {
            println!("[Updater:Rust] ditto failed: {}, trying cp fallback...", e);
            false
        }
    };

    if !copy_ok {
        // Fall back to cp -R
        copy_ok = match std::process::Command::new("cp")
            .args(["-R", &src.to_string_lossy(), &dst.to_string_lossy()])
            .status()
        {
            Ok(status) if status.success() => true,
            Ok(status) => {
                println!(
                    "[Updater:Rust] cp -R exited with code {:?}",
                    status.code()
                );
                false
            }
            Err(e) => {
                println!("[Updater:Rust] cp -R failed: {}", e);
                false
            }
        };
    }

    if copy_ok {
        // Copy succeeded — clean up the backup
        if let Some(backup) = backup_path {
            let _ = std::fs::remove_dir_all(&backup);
        }
        true
    } else {
        // Copy failed — restore the old version from backup
        if let Some(backup) = backup_path {
            let _ = std::fs::rename(&backup, dst);
        }
        false
    }
}

/// Download an installer from a URL and run it.
/// Used as a fallback when the updater plugin's signature verification fails.
#[tauri::command]
async fn download_and_run_installer(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    println!("[Updater:Rust] Downloading installer from: {}", url);
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download returned HTTP {}: {}",
            response.status().as_u16(),
            response.status().canonical_reason().unwrap_or("Unknown")
        ));
    }

    let total = response.content_length().unwrap_or(0);
    println!("[Updater:Rust] Content-Length: {} bytes", total);

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    println!("[Updater:Rust] Downloaded {} bytes", bytes.len());

    let temp_dir = std::env::temp_dir();
    let file_name = url
        .split('/')
        .last()
        .unwrap_or("Deskify_Update.exe");
    let file_path = temp_dir.join(file_name);

    std::fs::write(&file_path, &bytes)
        .map_err(|e| format!("Failed to write installer to {}: {}", file_path.display(), e))?;

    println!("[Updater:Rust] Installer saved to: {}", file_path.display());

    let file_name_lower = file_name.to_lowercase();

    // ── Windows: .exe / .msi ──
    #[cfg(target_os = "windows")]
    {
        if file_name_lower.ends_with(".msi") {
            // msiexec runs the MSI installer detached
            std::process::Command::new("msiexec")
                .args(["/i", &file_path.to_string_lossy(), "/passive"])
                .spawn()
                .map_err(|e| format!("Failed to launch MSI installer: {}", e))?;
        } else {
            // .exe (NSIS) — use cmd /C start to properly detach
            std::process::Command::new("cmd")
                .args(["/C", "start", "", &file_path.to_string_lossy().to_string()])
                .spawn()
                .map_err(|e| format!("Failed to launch installer: {}", e))?;
        }
    }

    // ── macOS: .app.tar.gz ──
    #[cfg(target_os = "macos")]
    {
        if file_name_lower.ends_with(".tar.gz") || file_name_lower.ends_with(".tgz") {
            // Extract to a temp staging directory
            let extract_dir = temp_dir.join("deskify-update");
            if extract_dir.exists() {
                std::fs::remove_dir_all(&extract_dir)
                    .map_err(|e| format!("Failed to clean extract dir: {}", e))?;
            }
            std::fs::create_dir_all(&extract_dir)
                .map_err(|e| format!("Failed to create extract dir: {}", e))?;

            println!(
                "[Updater:Rust] Extracting tar.gz to: {}",
                extract_dir.display()
            );

            let status = std::process::Command::new("tar")
                .args(["-xzf", &file_path.to_string_lossy(), "-C", &extract_dir.to_string_lossy()])
                .status()
                .map_err(|e| format!("Failed to run tar: {}", e))?;

            if !status.success() {
                return Err(format!("tar extraction failed with exit code: {:?}", status.code()));
            }

            // Find the .app bundle in the extracted directory
            let app_path = std::fs::read_dir(&extract_dir)
                .map_err(|e| format!("Failed to read extract dir: {}", e))?
                .filter_map(|entry| entry.ok())
                .find(|entry| {
                    entry
                        .file_name()
                        .to_string_lossy()
                        .ends_with(".app")
                })
                .map(|entry| entry.path());

            let app_path = app_path.ok_or("No .app bundle found after extraction".to_string())?;
            println!("[Updater:Rust] Found .app bundle: {}", app_path.display());

            // Resolve the running app's bundle location instead of assuming /Applications.
            // Walk up from current_exe() until we find the .app directory.
            let app_name = app_path
                .file_name()
                .ok_or("Invalid .app path".to_string())?
                .to_string_lossy()
                .to_string();

            let target_path = find_running_app_bundle(&app_name)
                .unwrap_or_else(|| std::path::PathBuf::from("/Applications").join(&app_name));

            println!("[Updater:Rust] Target bundle path: {}", target_path.display());

            // Try to copy the new bundle over the existing one.
            // On macOS Catalina+ this may trigger a TCC permission prompt or fail;
            // if it does, we fall back to launching the extracted app directly.
            let copy_succeeded = try_replace_app_bundle(&app_path, &target_path);

            if copy_succeeded {
                println!("[Updater:Rust] Launching updated app from {}", target_path.display());
                std::process::Command::new("open")
                    .arg(&target_path)
                    .spawn()
                    .map_err(|e| format!("Failed to launch app: {}", e))?;
            } else {
                // Copy failed (likely permission issue) — launch directly from temp.
                // The user gets the new version but it won't persist after reboot.
                println!("[Updater:Rust] Copy failed, launching directly from temp...");
                std::process::Command::new("open")
                    .arg(&app_path)
                    .spawn()
                    .map_err(|e| format!("Failed to launch app from temp: {}", e))?;
            }
        } else {
            // Other macOS formats (e.g. .dmg) — use open
            std::process::Command::new("open")
                .arg(&file_path)
                .spawn()
                .map_err(|e| format!("Failed to open file: {}", e))?;
        }
    }

    // ── Linux: .AppImage / .deb / .rpm ──
    #[cfg(target_os = "linux")]
    {
        if file_name_lower.ends_with(".appimage") {
            // Make executable and run directly
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&file_path)
                .map_err(|e| format!("Failed to get file metadata: {}", e))?
                .permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&file_path, perms)
                .map_err(|e| format!("Failed to chmod +x: {}", e))?;

            println!("[Updater:Rust] Launching AppImage...");
            std::process::Command::new(&file_path)
                .spawn()
                .map_err(|e| format!("Failed to launch AppImage: {}", e))?;
        } else if file_name_lower.ends_with(".deb") || file_name_lower.ends_with(".rpm") {
            // Open with system package manager GUI (prompts user for password)
            println!("[Updater:Rust] Opening package with system handler...");
            std::process::Command::new("xdg-open")
                .arg(&file_path)
                .spawn()
                .map_err(|e| format!("Failed to open package: {}", e))?;
        } else {
            // Unknown format — try xdg-open as generic fallback
            std::process::Command::new("xdg-open")
                .arg(&file_path)
                .spawn()
                .map_err(|e| format!("Failed to open file: {}", e))?;
        }
    }

    println!("[Updater:Rust] Installer launched successfully");
    Ok("Installer launched".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Get PostHog API key
    let posthog_api_key = option_env!("POSTHOG_API_KEY").unwrap_or("").to_string();
    let builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:deskify.db", db::migrations())
                .build(),
        )

        .manage(CaptureState::default())
        .manage(shortcuts::WindowVisibility {
            is_hidden: Mutex::new(true),
        })
        .manage(shortcuts::RegisteredShortcuts::default())
        .manage(shortcuts::LicenseState::default())
        .manage(shortcuts::MoveWindowState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_keychain::init())
        .plugin(tauri_plugin_shell::init()) // Add shell plugin
        .plugin(tauri_plugin_oauth::init())
        .plugin(posthog_init(PostHogConfig {
            api_key: posthog_api_key,
            options: Some(PostHogOptions {
                // disable session recording
                disable_session_recording: Some(true),
                // disable pageview
                capture_pageview: Some(false),
                // disable pageleave
                capture_pageleave: Some(false),
                ..Default::default()
            }),
            ..Default::default()
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_machine_uid::init());
    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }
    let builder = builder
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            download_and_run_installer,
            window::set_window_height,
            window::open_dashboard,
            window::close_dashboard,
            window::toggle_dashboard,
            window::move_window,
            capture::capture_to_base64,
            capture::start_screen_capture,
            capture::capture_selected_area,
            capture::close_overlay_window,
            shortcuts::check_shortcuts_registered,
            shortcuts::get_registered_shortcuts,
            shortcuts::update_shortcuts,
            shortcuts::validate_shortcut_key,
            shortcuts::set_license_status,
            shortcuts::set_app_icon_visibility,
            shortcuts::set_always_on_top,
            shortcuts::exit_app,
            activate::activate_license_api,
            activate::deactivate_license_api,
            activate::validate_license_api,
            activate::mask_license_key_cmd,
            activate::get_checkout_url,
            activate::secure_storage_save,
            activate::secure_storage_get,
            activate::secure_storage_remove,
            api::chat_stream_response,
            api::fetch_models,
            api::fetch_prompts,
            api::create_system_prompt,
            api::check_license_status,
            api::get_activity,
            shortcuts::toggle_main_window,
            automation::automation_mouse_move,
            automation::automation_mouse_click,
            automation::automation_mouse_double_click,
            automation::automation_mouse_down,
            automation::automation_mouse_up,
            automation::automation_key_press,
            automation::automation_key_combo,
            automation::automation_type_text,
            automation::automation_get_mouse_position,
            automation::automation_scroll,
            automation::automation_wait,
            automation::automation_open_app,
            automation::automation_run_command,
            automation::automation_get_screen_size,
            automation::automation_capture_screen,
            automation::automation_execute_steps,
            automation::automation_stop,
            window::set_content_protected,
            window::set_ignore_cursor_events,
        ])
        .setup(|app| {
            // Setup main window positioning
            window::setup_main_window(app).expect("Failed to setup main window");
            #[cfg(target_os = "macos")]
            init(app.app_handle());
            let app_handle = app.handle();
            if app_handle.get_webview_window("dashboard").is_none() {
                if let Err(e) = window::create_dashboard_window(&app_handle) {
                    eprintln!("Failed to pre-create dashboard window on startup: {}", e);
                }
            }

            let quit_i = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let dashboard_i = MenuItemBuilder::with_id("dashboard", "Dashboard").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&dashboard_i, &quit_i]).build()?;

            let tray_image = tray_icon_image().unwrap_or_else(|e| {
                eprintln!("deskify: tray icon load failed ({e}), using default window icon");
                app
                    .default_window_icon()
                    .cloned()
                    .expect("default window icon missing")
            });

            let _tray = TrayIconBuilder::new()
                .icon(tray_image)
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "dashboard" => {
                        if let Some(window) = app.get_webview_window("dashboard") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button, button_state, .. } = event {
                        if button == MouseButton::Left && button_state == MouseButtonState::Up {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("dashboard") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            #[cfg(desktop)]
            {
                use tauri_plugin_autostart::MacosLauncher;

                #[allow(deprecated, unexpected_cfgs)]
                if let Err(e) = app.handle().plugin(tauri_plugin_autostart::init(
                    MacosLauncher::LaunchAgent,
                    Some(vec![]),
                )) {
                    eprintln!("Failed to initialize autostart plugin: {}", e);
                }

                // Single instance plugin
                if let Err(e) = app.handle().plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                    if let Some(window) = app.get_webview_window("dashboard") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                })) {
                    eprintln!("Failed to initialize single-instance plugin: {}", e);
                }
            }

            // Always show dashboard on initial launch (unless it's an autostart, but we handle that in frontend)
            if let Some(window) = app.get_webview_window("dashboard") {
                let _ = window.show();
                let _ = window.set_focus();
            }

            // Initialize global shortcut plugin with centralized handler
            app.handle()
                .plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, shortcut, event| {
                            use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

                            let action_id = {
                                let state = app.state::<shortcuts::RegisteredShortcuts>();
                                let registered = match state.shortcuts.lock() {
                                    Ok(guard) => guard,
                                    Err(poisoned) => {
                                        eprintln!("Mutex poisoned in handler, recovering...");
                                        poisoned.into_inner()
                                    }
                                };

                                registered.iter().find_map(|(action_id, shortcut_str)| {
                                    if let Ok(s) = shortcut_str.parse::<Shortcut>() {
                                        if &s == shortcut {
                                            return Some(action_id.clone());
                                        }
                                    }
                                    None
                                })
                            };

                            if let Some(action_id) = action_id {
                                match event.state() {
                                    ShortcutState::Pressed => {
                                        if let Some(direction) =
                                            action_id.strip_prefix("move_window_")
                                        {
                                            shortcuts::start_move_window(app, direction);
                                        } else {
                                            eprintln!("Shortcut triggered: {}", action_id);
                                            shortcuts::handle_shortcut_action(app, &action_id);
                                        }
                                    }
                                    ShortcutState::Released => {
                                        if let Some(direction) =
                                            action_id.strip_prefix("move_window_")
                                        {
                                            shortcuts::stop_move_window(app, direction);
                                        }
                                    }
                                }
                            }
                        })
                        .build(),
                )
                .expect("Failed to initialize global shortcut plugin");
            if let Err(e) = shortcuts::setup_global_shortcuts(app.handle()) {
                eprintln!("Failed to setup global shortcuts: {}", e);
            }
            Ok(())
        });

    // Add macOS-specific permissions plugin
    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_plugin_macos_permissions::init());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(target_os = "macos")]
#[allow(deprecated, unexpected_cfgs)]
fn init(app_handle: &AppHandle) {
    let window: WebviewWindow = app_handle.get_webview_window("main").unwrap();

    let panel = window.to_panel().unwrap();

    let delegate = panel_delegate!(MyPanelDelegate {
        window_did_become_key,
        window_did_resign_key
    });

    let handle = app_handle.to_owned();

    delegate.set_listener(Box::new(move |delegate_name: String| {
        match delegate_name.as_str() {
            "window_did_become_key" => {
                let app_name = handle.package_info().name.to_owned();

                println!("[info]: {:?} panel becomes key window!", app_name);
            }
            "window_did_resign_key" => {
                println!("[info]: panel resigned from key window!");
            }
            _ => (),
        }
    }));

    // Set the window to float level
    #[allow(non_upper_case_globals)]
    const NSFloatWindowLevel: i32 = 4;
    panel.set_level(NSFloatWindowLevel);

    #[allow(non_upper_case_globals)]
    const NSWindowStyleMaskNonActivatingPanel: i32 = 1 << 7;
    panel.set_style_mask(NSWindowStyleMaskNonActivatingPanel);

    #[allow(deprecated)]
    panel.set_collection_behaviour(
        NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces,
    );

    panel.set_delegate(delegate);
}
