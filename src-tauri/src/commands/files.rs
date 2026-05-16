use std::path::PathBuf;
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: u64,
    pub extension: String,
}

fn get_documents_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not find home directory".to_string())?;
    Ok(PathBuf::from(home).join("Documents").join("Projects"))
}

#[tauri::command]
pub fn move_files_to_project(
    files: Vec<String>,
    project_name: String,
) -> Result<Vec<String>, String> {
    let projects_dir = get_documents_dir()?;
    let project_dir = projects_dir.join(&project_name);

    std::fs::create_dir_all(&project_dir).map_err(|e| format!("Failed to create project directory: {}", e))?;

    let mut new_paths = Vec::new();

    for file_path in &files {
        let src = PathBuf::from(file_path);
        if !src.exists() {
            return Err(format!("File not found: {}", file_path));
        }

        let filename = match src.file_name() {
            Some(name) => name.to_string_lossy().to_string(),
            None => return Err(format!("Invalid file path: {}", file_path)),
        };

        let mut dest = project_dir.join(&filename);

        if dest.exists() {
            let stem = src.file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let ext = src.extension()
                .map(|e| format!(".{}", e.to_string_lossy()))
                .unwrap_or_default();
            let mut counter = 1;
            while dest.exists() {
                dest = project_dir.join(format!("{} ({}){}", stem, counter, ext));
                counter += 1;
            }
        }

        match std::fs::rename(&src, &dest) {
            Ok(_) => new_paths.push(dest.to_string_lossy().to_string()),
            Err(_) => {
                std::fs::copy(&src, &dest).map_err(|e| format!("Failed to copy file: {}", e))?;
                std::fs::remove_file(&src).map_err(|e| format!("Failed to remove source file: {}", e))?;
                new_paths.push(dest.to_string_lossy().to_string());
            }
        }
    }

    Ok(new_paths)
}

#[tauri::command]
pub fn get_project_files(project_name: String) -> Result<Vec<FileInfo>, String> {
    let projects_dir = get_documents_dir()?;
    let project_dir = projects_dir.join(&project_name);

    if !project_dir.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    let mut dir_entries: Vec<_> = std::fs::read_dir(&project_dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .collect();

    dir_entries.sort_by_key(|e| e.file_name());

    for entry in dir_entries {
        let metadata = entry.metadata().map_err(|e| format!("Failed to read metadata: {}", e))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let extension = path.extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_default();
        let modified = metadata.modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        files.push(FileInfo {
            name,
            path: path.to_string_lossy().to_string(),
            size: metadata.len(),
            modified,
            extension,
        });
    }

    Ok(files)
}

#[tauri::command]
pub fn get_project_file_count(project_name: String) -> Result<usize, String> {
    let files = get_project_files(project_name)?;
    Ok(files.len())
}

#[tauri::command]
pub fn create_project_folder(project_name: String) -> Result<String, String> {
    let projects_dir = get_documents_dir()?;
    let project_dir = projects_dir.join(&project_name);
    std::fs::create_dir_all(&project_dir)
        .map_err(|e| format!("Failed to create project directory: {}", e))?;
    Ok(project_dir.to_string_lossy().to_string())
}
