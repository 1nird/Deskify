use enigo::*;
use image::ImageEncoder;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

static STOP_FLAG: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn automation_stop() {
    STOP_FLAG.store(true, Ordering::SeqCst);
}

fn is_stopped() -> bool {
    STOP_FLAG.swap(false, Ordering::SeqCst)
}

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
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {e}"))?;
    Mouse::move_mouse(&mut enigo, x, y, Coordinate::Abs)
        .map_err(|e| format!("Failed to move mouse: {e}"))
}

#[tauri::command]
pub fn automation_mouse_click(button: String) -> Result<(), String> {
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {e}"))?;
    let btn = parse_button(&button)?;
    Mouse::button(&mut enigo, btn, Direction::Click)
        .map_err(|e| format!("Failed to click: {e}"))
}

#[tauri::command]
pub fn automation_mouse_double_click(button: String) -> Result<(), String> {
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {e}"))?;
    let btn = parse_button(&button)?;
    Mouse::button(&mut enigo, btn, Direction::Click)
        .map_err(|e| format!("Failed first click: {e}"))?;
    thread::sleep(Duration::from_millis(80));
    Mouse::button(&mut enigo, btn, Direction::Click)
        .map_err(|e| format!("Failed second click: {e}"))
}

#[tauri::command]
pub fn automation_mouse_down(button: String) -> Result<(), String> {
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {e}"))?;
    let btn = parse_button(&button)?;
    Mouse::button(&mut enigo, btn, Direction::Press)
        .map_err(|e| format!("Failed mouse down: {e}"))
}

#[tauri::command]
pub fn automation_mouse_up(button: String) -> Result<(), String> {
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {e}"))?;
    let btn = parse_button(&button)?;
    Mouse::button(&mut enigo, btn, Direction::Release)
        .map_err(|e| format!("Failed mouse up: {e}"))
}

// ─── Keyboard ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn automation_key_press(key: String) -> Result<(), String> {
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {e}"))?;
    let k = map_key(&key)?;
    Keyboard::key(&mut enigo, k, Direction::Click)
        .map_err(|e| format!("Failed to press key '{key}': {e}"))
}

#[tauri::command]
pub fn automation_key_combo(keys: String) -> Result<(), String> {
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {e}"))?;
    let parts: Vec<&str> = keys.split(',').map(|s| s.trim()).collect();
    if parts.is_empty() {
        return Err("No keys provided".to_string());
    }

    // Hold modifiers
    for part in &parts[..parts.len().saturating_sub(1)] {
        Keyboard::key(&mut enigo, map_key(part)?, Direction::Press)
            .map_err(|e| format!("Failed to hold '{part}': {e}"))?;
    }

    // Press and release the final key
    let last = parts.last().unwrap();
    Keyboard::key(&mut enigo, map_key(last)?, Direction::Click)
        .map_err(|e| format!("Failed to press '{last}': {e}"))?;

    // Release modifiers in reverse
    for part in parts[..parts.len().saturating_sub(1)].iter().rev() {
        Keyboard::key(&mut enigo, map_key(part)?, Direction::Release)
            .map_err(|e| format!("Failed to release '{part}': {e}"))?;
    }

    Ok(())
}

#[tauri::command]
pub fn automation_type_text(text: String) -> Result<(), String> {
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {e}"))?;
    Keyboard::text(&mut enigo, &text)
        .map_err(|e| format!("Failed to type text: {e}"))
}

// ─── Misc ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn automation_get_mouse_position() -> Result<(i32, i32), String> {
    let enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {e}"))?;
    Mouse::location(&enigo).map_err(|e| format!("Failed to get mouse position: {e}"))
}

#[tauri::command]
pub fn automation_scroll(amount: i32) -> Result<(), String> {
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {e}"))?;
    Mouse::scroll(&mut enigo, amount, Axis::Vertical)
        .map_err(|e| format!("Failed to scroll: {e}"))
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
            .map_err(|e| format!("Failed to open '{path}': {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open '{path}': {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open '{path}': {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn automation_run_command(cmd: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let output = std::process::Command::new("cmd")
        .args(["/C", &cmd])
        .output()
        .map_err(|e| format!("Failed to run command: {e}"))?;

    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("sh")
        .arg("-c")
        .arg(&cmd)
        .output()
        .map_err(|e| format!("Failed to run command: {e}"))?;

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
    let enigo =
        Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init enigo: {e}"))?;
    Mouse::main_display(&enigo).map_err(|e| format!("Failed to get screen size: {e}"))
}

/// Capture the primary monitor and return a base64-encoded PNG.
#[tauri::command]
pub async fn automation_capture_screen() -> Result<String, String> {
    let monitors =
        xcap::Monitor::all().map_err(|e| format!("Failed to get monitors: {e}"))?;
    let primary = monitors
        .into_iter()
        .find(|m| m.is_primary())
        .or_else(|| xcap::Monitor::all().ok().and_then(|mut m| m.pop()))
        .ok_or("No monitor found")?;

    let image = primary
        .capture_image()
        .map_err(|e| format!("Failed to capture: {e}"))?;

    let mut png = Vec::new();
    image::codecs::png::PngEncoder::new(&mut png)
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            image::ColorType::Rgba8.into(),
        )
        .map_err(|e| format!("Failed to encode PNG: {e}"))?;

    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &png,
    ))
}

// ─── Execute sequence ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn automation_execute_steps(
    steps: Vec<AutomationStep>,
    speed: Option<f64>,
) -> Result<Vec<String>, String> {
    let speed_multiplier = speed.unwrap_or(1.0).clamp(0.1, 10.0);
    let mut results: Vec<String> = Vec::new();

    for (i, step) in steps.iter().enumerate() {
        // Check stop flag
        if is_stopped() {
            results.push("⏹ Stopped by user".to_string());
            break;
        }

        let desc = step
            .description
            .clone()
            .unwrap_or_else(|| format!("Step {}", i + 1));

        let result = match step.action.as_str() {
            "mouse_move" => {
                let x = step.params["x"].as_i64().unwrap_or(0) as i32;
                let y = step.params["y"].as_i64().unwrap_or(0) as i32;
                automation_mouse_move(x, y).map(|_| format!("Moved to ({x}, {y})"))
            }
            "mouse_click" => {
                let btn = step.params["button"].as_str().unwrap_or("left").to_string();
                automation_mouse_click(btn.clone()).map(|_| format!("Clicked {btn}"))
            }
            "mouse_double_click" => {
                let btn = step.params["button"].as_str().unwrap_or("left").to_string();
                automation_mouse_double_click(btn.clone())
                    .map(|_| format!("Double-clicked {btn}"))
            }
            "mouse_down" => {
                let btn = step.params["button"].as_str().unwrap_or("left").to_string();
                automation_mouse_down(btn.clone()).map(|_| format!("Mouse down {btn}"))
            }
            "mouse_up" => {
                let btn = step.params["button"].as_str().unwrap_or("left").to_string();
                automation_mouse_up(btn.clone()).map(|_| format!("Mouse up {btn}"))
            }
            "key_press" => {
                let key = step.params["key"].as_str().unwrap_or("").to_string();
                automation_key_press(key.clone()).map(|_| format!("Pressed {key}"))
            }
            "key_combo" => {
                let keys = step.params["keys"].as_str().unwrap_or("").to_string();
                automation_key_combo(keys.clone()).map(|_| format!("Combo {keys}"))
            }
            "type_text" => {
                let _text = step.params["text"].as_str().unwrap_or("").to_string();
                automation_type_text(_text).map(|_| "Typed text".to_string())
            }
            "scroll" => {
                let amount = step.params["amount"].as_i64().unwrap_or(0) as i32;
                automation_scroll(amount).map(|_| format!("Scrolled {amount}"))
            }
            "wait" => {
                let ms = step.params["ms"].as_u64().unwrap_or(1000);
                let adjusted = (ms as f64 / speed_multiplier) as u64;
                // Check stop flag during wait in small increments
                let chunks = adjusted / 100;
                for _ in 0..chunks {
                    if is_stopped() {
                        return Ok({
                            results.push("⏹ Stopped by user".to_string());
                            results
                        });
                    }
                    thread::sleep(Duration::from_millis(100));
                }
                let rem = adjusted % 100;
                if rem > 0 {
                    thread::sleep(Duration::from_millis(rem));
                }
                Ok(format!("Waited {ms}ms (at {speed_multiplier}x)"))
            }
            "wait_raw" => {
                let ms = step.params["ms"].as_u64().unwrap_or(1000);
                let chunks = ms / 100;
                for _ in 0..chunks {
                    if is_stopped() {
                        return Ok({
                            results.push("⏹ Stopped by user".to_string());
                            results
                        });
                    }
                    thread::sleep(Duration::from_millis(100));
                }
                let rem = ms % 100;
                if rem > 0 {
                    thread::sleep(Duration::from_millis(rem));
                }
                Ok(format!("Waited {ms}ms"))
            }
            "open_app" => {
                let path = step.params["path"].as_str().unwrap_or("").to_string();
                automation_open_app(path.clone()).map(|_| format!("Opened {path}"))
            }
            "run_command" => {
                let cmd = step.params["cmd"].as_str().unwrap_or("").to_string();
                automation_run_command(cmd).map(|out| out)
            }
            _ => Err(format!("Unknown action: {}", step.action)),
        };

        match result {
            Ok(msg) => results.push(format!("OK {desc}: {msg}")),
            Err(e) => {
                results.push(format!("ERR {desc}: {e}"));
                break;
            }
        }
    }

    Ok(results)
}

// ─── Helpers ───────────────────────────────────────────────────────────────

fn parse_button(button: &str) -> Result<Button, String> {
    match button.to_lowercase().as_str() {
        "left" => Ok(Button::Left),
        "right" => Ok(Button::Right),
        "middle" => Ok(Button::Middle),
        _ => Err(format!("Unknown button: {button}")),
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
            Ok(Key::Unicode(ch))
        }
        _ => Err(format!("Unknown key: {key}")),
    }
}
