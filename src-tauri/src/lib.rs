mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::files::move_files_to_project,
            commands::files::get_project_files,
            commands::files::get_project_file_count,
            commands::files::create_project_folder,
            commands::files::create_project_with_subfolders,
            commands::files::get_subject_folder_template,
            commands::files::search_files_all_projects,
            commands::files::delete_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
