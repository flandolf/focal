use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn window_set_zoom(app: AppHandle, scale: f64) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_zoom(scale).map_err(|e| e.to_string())?;
    }
    Ok(())
}
