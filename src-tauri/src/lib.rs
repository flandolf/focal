mod commands;

use tauri_plugin_sql::{Migration, MigrationKind};

fn database_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initialize_local_database",
            // Migration 1 shipped inline with this exact trailing indentation.
            // Keep its checksum immutable; all schema changes start at version 2.
            sql: concat!(
                include_str!("../migrations/0001_local_database.sql"),
                "        "
            ),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "rebuild_sync_outbox",
            sql: include_str!("../migrations/0002_rebuild_sync_outbox.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:focal.db", database_migrations())
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(commands::ollama::OllamaRequests::default())
        .invoke_handler(tauri::generate_handler![
            commands::files::move_files_to_project,
            commands::files::get_project_files,
            commands::files::get_project_file_count,
            commands::files::create_project_folder,
            commands::files::create_project_with_subfolders,
            commands::files::search_files_all_projects,
            commands::files::delete_files,
            commands::files::rename_file,
            commands::files::get_file_content_previews,
            commands::files::move_file_to_folder,
            commands::files::import_folder_to_project,
            commands::files::link_folder_as_project,
            commands::files::handle_folder_drop,
            commands::files::set_projects_directory,
            commands::files::get_projects_directory,
            commands::files::get_default_documents_dir,
            commands::files::rename_project_folder,
            commands::files::copy_project_folder,
            commands::files::scan_projects_root,
            commands::credits::get_credits,
            commands::notion::query_notion_calendar,
            commands::notion::fetch_notion_schema,
            commands::notion::ensure_notion_sync_properties,
            commands::notion::create_notion_calendar_page,
            commands::notion::delete_notion_page,
            commands::notion::update_notion_calendar_page,
            commands::ollama::ollama_request,
            commands::ollama::cancel_ollama_request,
            commands::secrets::get_secret,
            commands::secrets::set_secret,
            commands::window::window_set_zoom,
            commands::vcaa::fetch_vcaa_exam_timetable,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
