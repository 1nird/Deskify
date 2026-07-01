use base64::Engine;
use enigo::*;
use image::ImageEncoder;
use serde::{Deserialize, Serialize};
use std::thread;
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AutomationStep {
    pub action: String,
    pub params: serde_json::Value,
    #[serde(default)]
    pub description: Option<String>,
}

// ─── Mouse ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn automation_mouse_move(x: i32, y: i32) -> Result<(), String> {
    let mut enigo = Enigo::new();
    enigo.mouse_move_to(x, y);
    Ok(())
}

#[tauri::command]
pub fn automation_mouse_click(button: String) -> Result<(), String> {
    let mut enigo = Enigo::new();
    let btn = parse_button(&button)?;
    enigo.mouse_click(btn);
    Ok(())
}

#[tauri::command]
pub fn automation_mouse_double_click(button: String) -> Result<(), String> {
    let mut enigo = Enigo::new();
    let btn = parse_button(&button)?;
    enigo.mouse_click(btn);
    thread::sleep(Duration::from_millis(80));
    enigo.mouse_click(btn);
    Ok(())
}

#[tauri::command]
pub fn automation_mouse_down(button: String) -> Result<(), String> {
    let mut enigo = Enigo::new();
    let btn = parse_button(&button)?;
    enigo.mouse_down(btn);
    Ok(())
}

#[tauri::command]
pub fn automation_mouse_up(button: String) -> Result<(), String> {
    let mut enigo = Enigo::new();
    let btn = parse_button(&button)?;
    enigo.mouse_up(btn);
    Ok(())
}

// ─── Keyboard ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn automation_key_press(key: String) -> Result<(), String> {
    let mut enigo = Enigo::new();
    let k = map_key(&key)?;
    enigo.key_click(k);
    Ok(())
}

#[tauri::command]
pub fn automation_key_combo(keys: String) -> Result<(), String> {
    let mut enigo = Enigo::new();
    let parts: Vec<&str> = keys.split(',').map(|s| s.trim()).collect();
    if parts.is_empty() {
        return Err("No keys provided".to_string());
    }

    // Hold modifiers
    for part in &parts[..parts.len().saturating_sub(1)] {
        enigo.key_down(map_key(part)?);
    }

    // Press and release the final key
    let last = parts.last().unwrap();
    enigo.key_click(map_key(last)?);

    // Release modifiers in reverse
    for part in parts[..parts.len().saturating_sub(1)].iter().rev() {
        enigo.key_up(map_key(part)?);
    }

    Ok(())
}

#[tauri::command]
pub fn automation_type_text(text: String) -> Result<(), String> {
    let mut enigo = Enigo::new();
    enigo.text(&text);
    Ok(())
}

// ─── Misc ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn automation_get_mouse_position() -> Result<(i32, i32), String> {
    let enigo = Enigo::new();
    Ok(enigo.mouse_location())
}

#[tauri::command]
pub fn automation_scroll(amount: i32) -> Result<(), String> {
    let mut enigo = Enigo::new();
    enigo.scroll(amount, MouseAxis::Vertical);
    Ok(())
}

#[tauri::command]
pub fn automation_wait(ms: u64) -> Result<(), String> {
    thread::sleep(Duration::from_millis(ms));
    Ok(())
}

#[tauri::command]
pub fn automation_open_app(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| format!("Failed to open '{}': {}", path, e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open '{}': {}", path, e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open '{}': {}", path, e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn automation_run_command(cmd: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let output = std::process::Command::new("cmd")
        .args(["/C", &cmd])
        .output()
        .map_err(|e| format!("Failed to run command: {}", e))?;

    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("sh")
        .arg("-c")
        .arg(&cmd)
        .output()
        .map_err(|e| format!("Failed to run command: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() && !stderr.is_empty() {
        Err(format!("Command failed: {}", stderr.trim()))
    } else {
        Ok(stdout.trim().to_string())
    }
}

#[tauri::command]
pub fn automation_get_screen_size() -> Result<(i32, i32), String> {
    let enigo = Enigo::new();
    Ok(enigo.main_display())
}

/// Capture the primary monitor and return a base64-encoded PNG.
/// This is a standalone command that doesn't need a WebviewWindow parameter,
/// so it can be called directly from the frontend.
#[tauri::command]
pub async fn automation_capture_screen() -> Result<String, String> {
    let monitors = xcap::Monitor::all()
        .map_err(|e| format!("Failed to get monitors: {}", e))?;
    let primary = monitors
        .into_iter()
        .find(|m| m.is_primary())
        .or_else(|| {
            // Fallback: use first available monitor
            xcap::Monitor::all().ok().and_then(|mut m| m.pop())
        })
        .ok_or("No monitor found")?;

    let image = primary
        .capture_image()
        .map_err(|e| format!("Failed to capture: {}", e))?;

    let mut png = Vec::new();
    image::codecs::png::PngEncoder::new(&mut png)
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            image::ColorType::Rgba8.into(),
        )
        .map_err(|e| format!("Failed to encode PNG: {}", e))?;

    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &png,
    ))
}

// ─── Execute sequence ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn automation_execute_steps(
    steps: Vec<AutomationStep>,
) -> Result<Vec<String>, String> {
    let mut results: Vec<String> = Vec::new();

    for (i, step) in steps.iter().enumerate() {
        let desc = step
            .description
            .clone()
            .unwrap_or_else(|| format!("Step {}", i + 1));

        let result = match step.action.as_str() {
            "mouse_move" => {
                let x = step.params["x"].as_i64().unwrap_or(0) as i32;
                let y = step.params["y"].as_i64().unwrap_or(0) as i32;
                automation_mouse_move(x, y)
                    .map(|_| format!("Moved to ({}, {})", x, y))
            }
            "mouse_click" => {
                let btn = step.params["button"].as_str().unwrap_or("left").to_string();
                automation_mouse_click(btn.clone())
                    .map(|_| format!("Clicked {}", btn))
            }
            "mouse_double_click" => {
                let btn = step.params["button"].as_str().unwrap_or("left").to_string();
                automation_mouse_double_click(btn.clone())
                    .map(|_| format!("Double-clicked {}", btn))
            }
            "mouse_down" => {
                let btn = step.params["button"].as_str().unwrap_or("left").to_string();
                automation_mouse_down(btn.clone()).map(|_| format!("Mouse down {}", btn))
            }
            "mouse_up" => {
                let btn = step.params["button"].as_str().unwrap_or("left").to_string();
                automation_mouse_up(btn.clone()).map(|_| format!("Mouse up {}", btn))
            }
            "key_press" => {
                let key = step.params["key"].as_str().unwrap_or("").to_string();
                automation_key_press(key.clone())
                    .map(|_| format!("Pressed {}", key))
            }
            "key_combo" => {
                let keys = step.params["keys"].as_str().unwrap_or("").to_string();
                automation_key_combo(keys.clone())
                    .map(|_| format!("Combo {}", keys))
            }
            "type_text" => {
                let text = step.params["text"].as_str().unwrap_or("").to_string();
                automation_type_text(text.clone())
                    .map(|_| format!("Typed text"))
            }
            "scroll" => {
                let amount = step.params["amount"].as_i64().unwrap_or(0) as i32;
                automation_scroll(amount)
                    .map(|_| format!("Scrolled {}", amount))
            }
            "wait" => {
                let ms = step.params["ms"].as_u64().unwrap_or(1000);
                automation_wait(ms).map(|_| format!("Waited {}ms", ms))
            }
            "open_app" => {
                let path = step.params["path"].as_str().unwrap_or("").to_string();
                automation_open_app(path.clone())
                    .map(|_| format!("Opened {}", path))
            }
            "run_command" => {
                let cmd = step.params["cmd"].as_str().unwrap_or("").to_string();
                automation_run_command(cmd).map(|out| format!("{}", out))
            }
            _ => Err(format!("Unknown action: {}", step.action)),
        };

        match result {
            Ok(msg) => results.push(format!("OK {}: {}", desc, msg)),
            Err(e) => {
                results.push(format!("ERR {}: {}", desc, e));
                break;
            }
        }
    }

    Ok(results)
}

// ─── Helpers ───────────────────────────────────────────────────────────────

fn parse_button(button: &str) -> Result<MouseButton, String> {
    match button.to_lowercase().as_str() {
        "left" => Ok(MouseButton::Left),
        "right" => Ok(MouseButton::Right),
        "middle" => Ok(MouseButton::Middle),
        _ => Err(format!("Unknown button: {}", button)),
    }
}

fn map_key(key: &str) -> Result<Key, String> {
    match key.to_lowercase().as_str() {
        "alt" | "lalt" => Ok(Key::Alt),
        "backspace" => Ok(Key::Backspace),
        "capslock" | "caps_lock" => Ok(Key::CapsLock),
        "ctrl" | "control" | "lctrl" => Ok(Key::Control),
        "delete" | "del" => Ok(Key::Delete),
        "downarrow" | "down_arrow" | "down" => Ok(Key::DownArrow),
        "end" => Ok(Key::End),
        "escape" | "esc" => Ok(Key::Escape),
        "f1" => Ok(Key::F1),
        "f2" => Ok(Key::F2),
        "f3" => Ok(Key::F3),
        "f4" => Ok(Key::F4),
        "f5" => Ok(Key::F5),
        "f6" => Ok(Key::F6),
        "f7" => Ok(Key::F7),
        "f8" => Ok(Key::F8),
        "f9" => Ok(Key::F9),
        "f10" => Ok(Key::F10),
        "f11" => Ok(Key::F11),
        "f12" => Ok(Key::F12),
        "home" => Ok(Key::Home),
        "leftarrow" | "left_arrow" | "left" => Ok(Key::LeftArrow),
        "meta" | "win" | "windows" | "command" | "cmd" | "super" => Ok(Key::Meta),
        "pagedown" | "page_down" => Ok(Key::PageDown),
        "pageup" | "page_up" => Ok(Key::PageUp),
        "return" | "enter" => Ok(Key::Return),
        "rightarrow" | "right_arrow" | "right" => Ok(Key::RightArrow),
        "shift" | "lshift" => Ok(Key::Shift),
        "space" => Ok(Key::Space),
        "tab" => Ok(Key::Tab),
        "uparrow" | "up_arrow" | "up" => Ok(Key::UpArrow),
        c if c.len() == 1 => {
            let ch = c.chars().next().unwrap();
            if ch.is_ascii_alphabetic() {
                Ok(Key::Layout(ch.to_ascii_lowercase()))
            } else {
                Ok(Key::Layout(ch))
            }
        }
        _ => Err(format!("Unknown key: {}", key)),
    }
}
