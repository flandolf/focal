#[cfg(desktop)]
use std::sync::Mutex;

use tauri::Manager;

#[cfg(desktop)]
use tauri_plugin_shell::{
    process::{CommandEvent, CommandChild},
    ShellExt,
};

#[derive(Default)]
pub struct ChatGptSidecar {
    #[cfg(desktop)]
    child: Mutex<Option<CommandChild>>,
}

const ALLOWED_ORIGINS: &str =
    "http://localhost:1420,http://tauri.localhost,https://tauri.localhost,tauri://localhost";

#[cfg(desktop)]
pub fn start(app: &tauri::AppHandle) -> Result<(), String> {
    let data_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("could not resolve ChatGPT data directory: {error}"))?;
    std::fs::create_dir_all(&data_directory)
        .map_err(|error| format!("could not create ChatGPT data directory: {error}"))?;

    let state = app
        .try_state::<ChatGptSidecar>()
        .ok_or_else(|| "ChatGPT sidecar state is unavailable".to_owned())?;
    if state.child.lock().map_err(|_| "ChatGPT sidecar state is unavailable")?.is_some() {
        return Ok(());
    }

    let (mut events, child) = app
        .shell()
        .sidecar("focal-chatgpt")
        .map_err(|error| format!("could not configure ChatGPT sidecar: {error}"))?
        .env("FOCAL_CHATGPT_DATA_DIR", data_directory)
        .env("LWC_ALLOWED_ORIGINS", ALLOWED_ORIGINS)
        .env("NODE_ENV", "production")
        .spawn()
        .map_err(|error| format!("could not start ChatGPT sidecar: {error}"))?;

    state
        .child
        .lock()
        .map_err(|_| "ChatGPT sidecar state is unavailable")?
        .replace(child);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                    eprintln!("[focal-chatgpt] {}", String::from_utf8_lossy(&line).trim())
                }
                CommandEvent::Error(error) => eprintln!("[focal-chatgpt] {error}"),
                CommandEvent::Terminated(status) => eprintln!("[focal-chatgpt] terminated: {status:?}"),
                _ => {}
            }
        }
    });

    Ok(())
}

#[cfg(not(desktop))]
pub fn start(_app: &tauri::AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg(desktop)]
pub fn stop(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app
        .try_state::<ChatGptSidecar>()
        .ok_or_else(|| "ChatGPT sidecar state is unavailable".to_owned())?;
    let child = state
        .child
        .lock()
        .map_err(|_| "ChatGPT sidecar state is unavailable".to_owned())?
        .take();
    if let Some(child) = child {
        child
            .kill()
            .map_err(|error| format!("could not stop ChatGPT sidecar: {error}"))?;
    }
    Ok(())
}

#[cfg(not(desktop))]
pub fn stop(_app: &tauri::AppHandle) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn stop_chatgpt_sidecar(app: tauri::AppHandle) -> Result<(), String> {
    stop(&app)
}
