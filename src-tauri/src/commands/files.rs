use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

static PROJECTS_DIR_OVERRIDE: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

fn projects_dir_override() -> &'static Mutex<Option<PathBuf>> {
    PROJECTS_DIR_OVERRIDE.get_or_init(|| Mutex::new(None))
}

fn get_projects_dir() -> Result<PathBuf, String> {
    if let Ok(override_val) = projects_dir_override().lock() {
        if let Some(path) = override_val.as_ref() {
            return Ok(path.clone());
        }
    }
    get_documents_dir()
}

#[tauri::command]
pub fn set_projects_directory(path: String) -> Result<(), String> {
    let normalized = normalize_path(&path);
    let path = PathBuf::from(&normalized);
    if !path.exists() {
        return Err(format!("Directory does not exist: {}", normalized));
    }
    if let Ok(mut override_val) = projects_dir_override().lock() {
        *override_val = Some(path);
    }
    Ok(())
}

#[tauri::command]
pub fn get_projects_directory() -> Result<String, String> {
    let dir = get_projects_dir()?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn scan_projects_root() -> Result<Vec<String>, String> {
    let root = get_projects_dir()?;
    if !root.exists() {
        return Err(format!("Projects directory not found: {}", root.display()));
    }
    if !root.is_dir() {
        return Err(format!("Projects path is not a directory: {}", root.display()));
    }
    let mut names = Vec::new();
    let entries = std::fs::read_dir(&root)
        .map_err(|e| format!("Failed to read directory: {}", e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        if path.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with(".") {
                names.push(name);
            }
        }
    }
    names.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    Ok(names)
}

#[tauri::command]
pub fn get_default_documents_dir() -> Result<String, String> {
    let dir = get_documents_dir()?;
    Ok(dir.to_string_lossy().to_string())
}

const DEFAULT_CONTENT_PREVIEW_CHARS: usize = 1200;
const MAX_CONTENT_PREVIEW_CHARS: usize = 4000;
const RECENT_MOVE_TTL: Duration = Duration::from_secs(15);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: u64,
    pub extension: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subfolder: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_favorite: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileContentPreview {
    pub file_path: String,
    pub content: String,
}

fn is_text_like_extension(extension: &str) -> bool {
    let ext = extension.to_ascii_lowercase();
    matches!(
        ext.as_str(),
        "txt"
            | "md"
            | "markdown"
            | "csv"
            | "ts"
            | "tsx"
            | "js"
            | "jsx"
            | "json"
            | "html"
            | "css"
            | "xml"
            | "yaml"
            | "yml"
            | "toml"
            | "ini"
            | "log"
            | "rs"
            | "py"
            | "java"
            | "kt"
            | "swift"
            | "go"
            | "c"
            | "cpp"
            | "h"
            | "hpp"
            | "sql"
            | "sh"
            | "zsh"
            | "bat"
            | "ps1"
            | "tex"
            | "rtf"
    )
}

fn get_documents_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not find home directory".to_string())?;
    Ok(PathBuf::from(home).join("Documents").join("Projects"))
}

fn recent_moved_files() -> &'static Mutex<HashMap<String, (PathBuf, Instant)>> {
    static RECENT: OnceLock<Mutex<HashMap<String, (PathBuf, Instant)>>> = OnceLock::new();
    RECENT.get_or_init(|| Mutex::new(HashMap::new()))
}

fn remember_moved_file(src: &str, dest: &Path) {
    if let Ok(mut recent) = recent_moved_files().lock() {
        let now = Instant::now();
        recent.retain(|_, (_, moved_at)| now.duration_since(*moved_at) <= RECENT_MOVE_TTL);
        recent.insert(src.to_string(), (dest.to_path_buf(), now));
    }
}

fn recently_moved_dest(src: &str) -> Option<PathBuf> {
    let mut recent = recent_moved_files().lock().ok()?;
    let now = Instant::now();
    recent.retain(|_, (_, moved_at)| now.duration_since(*moved_at) <= RECENT_MOVE_TTL);
    recent
        .get(src)
        .map(|(dest, _)| dest)
        .filter(|dest| dest.exists())
        .cloned()
}

/// Returns true when the rename/move produced the destination despite
/// reporting an error (common on synced/network filesystems).  We only
/// check `dest.exists()` because `src` may still show as present during
/// a race window, and the important question is whether the move landed.
fn rename_landed_after_error(_src: &Path, dest: &Path) -> bool {
    dest.exists()
}

/// Normalize a path that may come from a drag-and-drop event or file picker.
/// Strips `file://`/`file:///` / `file://localhost/` prefixes and URL-decodes percent-encoded characters.
fn normalize_path(path: &str) -> String {
    let mut path = path.to_string();

    // Strip file:// prefix (handles file:///, file://, and file://localhost/)
    if let Some(stripped) = path.strip_prefix("file:///") {
        path = stripped.to_string();
    } else if let Some(stripped) = path.strip_prefix("file://localhost/") {
        path = stripped.to_string();
    } else if let Some(stripped) = path.strip_prefix("file://") {
        path = stripped.to_string();
    }

    // Percent-decode
    let mut decoded = Vec::with_capacity(path.len());
    let bytes = path.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
            if let Ok(byte) = u8::from_str_radix(hex, 16) {
                decoded.push(byte);
                i += 3;
                continue;
            }
        }
        decoded.push(bytes[i]);
        i += 1;
    }

    String::from_utf8_lossy(&decoded).to_string()
}

#[tauri::command]
pub async fn move_files_to_project(
    files: Vec<String>,
    project_name: String,
    copy: Option<bool>,
) -> Result<Vec<String>, String> {
    let copy_only = copy.unwrap_or(false);
    let projects_dir = get_projects_dir()?;
    let project_dir = projects_dir.join(&project_name);

    // ponytail: offload blocking file I/O to a dedicated thread so the
    // async runtime worker (and the UI) stays responsive.
    tokio::task::spawn_blocking(move || {
        std::fs::create_dir_all(&project_dir)
            .map_err(|e| format!("Failed to create project directory: {}", e))?;

        let mut new_paths = Vec::new();
        let mut skipped = Vec::new();

        for file_path in &files {
            let normalized = normalize_path(file_path);
            let src = PathBuf::from(&normalized);
            let filename = match src.file_name() {
                Some(name) => name.to_string_lossy().to_string(),
                None => {
                    skipped.push(format!("{} (invalid path)", normalized));
                    continue;
                }
            };
            let mut dest = project_dir.join(&filename);
            if dest.exists() {
                let stem = src
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                let ext = src
                    .extension()
                    .map(|e| format!(".{}", e.to_string_lossy()))
                    .unwrap_or_default();
                let mut counter = 1;
                while dest.exists() {
                    dest = project_dir.join(format!("{} ({}){}", stem, counter, ext));
                    counter += 1;
                }
            }

            // ponytail: skip .exists() pre-check — on Windows it can falsely return false
            // for locked files or file:// URIs. Try rename first, then copy+delete.
            let mut moved = false;
            if copy_only {
                if let Err(e) = std::fs::copy(&src, &dest) {
                    if let Some(previous_dest) = recently_moved_dest(&normalized) {
                        new_paths.push(previous_dest.to_string_lossy().to_string());
                        continue;
                    }
                    skipped.push(format!("{} (copy failed: {})", normalized, e));
                } else {
                    moved = true;
                }
            } else {
                moved = true;
                if std::fs::rename(&src, &dest).is_err()
                    && !rename_landed_after_error(&src, &dest)
                {
                    if src.exists() {
                        if let Err(e) = std::fs::copy(&src, &dest) {
                            if let Some(previous_dest) = recently_moved_dest(&normalized) {
                                new_paths.push(previous_dest.to_string_lossy().to_string());
                                continue;
                            }
                            if !dest.exists() {
                                skipped.push(format!("{} (move failed: {})", normalized, e));
                                moved = false;
                            }
                            // ponytail: dest exists — rename landed during copy attempt
                        } else {
                            let _ = std::fs::remove_file(&src);
                        }
                    }
                    // ponytail: if src no longer exists after a failed rename, the
                    // filesystem driver already moved it — treat as success.
                }
            }
            if moved {
                new_paths.push(dest.to_string_lossy().to_string());
                if !copy_only {
                    remember_moved_file(&normalized, &dest);
                }
            }
        }

        if !skipped.is_empty() {
            return Err(format!(
                "Partially moved {} of {} file(s). Skipped {}: {}",
                new_paths.len(),
                new_paths.len() + skipped.len(),
                skipped.len(),
                skipped.join(", ")
            ));
        }

        Ok(new_paths)
    })
    .await
    .map_err(|_| "Blocking task panicked".to_string())?
}

#[tauri::command]
pub fn get_project_files(
    project_name: String,
    recursive: Option<bool>,
) -> Result<Vec<FileInfo>, String> {
    let projects_dir = get_projects_dir()?;
    let project_dir = projects_dir.join(&project_name);

    get_project_files_for_path(&project_dir, recursive.unwrap_or(false))
}

fn get_project_files_for_path(
    project_dir: &Path,
    recursive: bool,
) -> Result<Vec<FileInfo>, String> {
    if !project_dir.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();

    if recursive {
        collect_project_files_recursive(project_dir, project_dir, &mut files)?;
        return Ok(files);
    }

    let mut dir_entries: Vec<_> = std::fs::read_dir(project_dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .collect();

    dir_entries.sort_by_key(|e| e.file_name());

    for entry in dir_entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name == ".DS_Store" {
            continue;
        }
        files.push(file_info_from_path(&path, name, None)?);
    }

    Ok(files)
}

fn collect_project_files_recursive(
    dir: &Path,
    root_dir: &Path,
    files: &mut Vec<FileInfo>,
) -> Result<(), String> {
    let mut entries: Vec<_> = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .filter_map(|e| e.ok())
        .collect();

    entries.sort_by_key(|e| e.path());

    for entry in entries {
        let file_type = entry
            .file_type()
            .map_err(|e| format!("Failed to read file type: {}", e))?;
        let path = entry.path();

        if file_type.is_dir() {
            collect_project_files_recursive(&path, root_dir, files)?;
        } else if file_type.is_file() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name == ".DS_Store" {
                continue;
            }
            let subfolder = path
                .parent()
                .and_then(|parent| parent.strip_prefix(root_dir).ok())
                .filter(|relative| !relative.as_os_str().is_empty())
                .map(|relative| relative.to_string_lossy().to_string().replace('\\', "/"));

            files.push(file_info_from_path(&path, name, subfolder)?);
        }
    }

    Ok(())
}

fn file_info_from_path(
    path: &Path,
    name: String,
    subfolder: Option<String>,
) -> Result<FileInfo, String> {
    let metadata =
        std::fs::metadata(path).map_err(|e| format!("Failed to read metadata: {}", e))?;
    let extension = path
        .extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_default();
    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    Ok(FileInfo {
        name,
        path: path.to_string_lossy().to_string(),
        size: metadata.len(),
        modified,
        extension,
        tags: None,
        subfolder,
        is_favorite: None,
    })
}

#[tauri::command]
pub fn get_project_file_count(project_name: String) -> Result<usize, String> {
    let projects_dir = get_projects_dir()?;
    let project_dir = projects_dir.join(&project_name);
    let files = get_project_files_for_path(&project_dir, true)?;
    Ok(files.len())
}

#[tauri::command]
pub fn create_project_folder(project_name: String) -> Result<String, String> {
    let projects_dir = get_projects_dir()?;
    let project_dir = projects_dir.join(&project_name);
    std::fs::create_dir_all(&project_dir)
        .map_err(|e| format!("Failed to create project directory: {}", e))?;
    Ok(project_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn create_project_with_subfolders(
    project_name: String,
    subfolders: Vec<String>,
) -> Result<String, String> {
    let projects_dir = get_projects_dir()?;
    let project_dir = projects_dir.join(&project_name);

    std::fs::create_dir_all(&project_dir)
        .map_err(|e| format!("Failed to create project directory: {}", e))?;

    for subfolder in subfolders {
        let subfolder_path = project_dir.join(&subfolder);
        std::fs::create_dir_all(&subfolder_path)
            .map_err(|e| format!("Failed to create subfolder {}: {}", subfolder, e))?;
    }

    Ok(project_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_subject_folder_template(_subject_id: String) -> Result<Vec<String>, String> {
    Ok(vec![
        "SACs".to_string(),
        "Notes".to_string(),
        "Past-Papers".to_string(),
        "Exam-Revision".to_string(),
        "Resources".to_string(),
    ])
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub file: FileInfo,
    pub project_folder: String,
}

#[tauri::command]
pub fn delete_files(file_paths: Vec<String>) -> Result<usize, String> {
    let projects_dir = get_projects_dir()?;
    let mut deleted = 0;
    for path in &file_paths {
        let normalized = normalize_path(path);
        let p = PathBuf::from(&normalized);
        if !p.starts_with(&projects_dir) {
            return Err(format!(
                "Refusing to delete outside projects directory: {}",
                path
            ));
        }
        if p.exists() && p.is_file() {
            if let Err(e) = std::fs::remove_file(&p) {
                if e.kind() != std::io::ErrorKind::NotFound {
                    return Err(format!("Failed to delete {}: {}", path, e));
                }
            }
            deleted += 1;
        } else if p.exists() && p.is_dir() {
            if let Err(e) = std::fs::remove_dir_all(&p) {
                if e.kind() != std::io::ErrorKind::NotFound {
                    return Err(format!("Failed to delete {}: {}", path, e));
                }
            }
            deleted += 1;
        }
    }
    Ok(deleted)
}
#[tauri::command]
pub fn rename_file(file_path: String, new_name: String) -> Result<String, String> {
    let projects_dir = get_projects_dir()?;
    let normalized = normalize_path(&file_path);
    let src = PathBuf::from(&normalized);
    if !src.starts_with(&projects_dir) {
        return Err(format!(
            "Refusing to rename outside projects directory: {}",
            file_path
        ));
    }
    let parent = src.parent().ok_or("Failed to resolve parent directory")?;
    let dest = parent.join(&new_name);
    if dest.exists() {
        return Err(format!(
            "A file named \"{}\" already exists in this directory",
            new_name
        ));
    }

    // ponytail: try rename first; if it fails (e.g. cloud placeholder), fall
    // back to copy+delete.  Both checks are re-checked after the copy because
    // synced filesystem drivers can move the file between the check and the copy.
    if std::fs::rename(&src, &dest).is_err()
        && !rename_landed_after_error(&src, &dest)
    {
        if src.exists() {
            if let Err(e) = std::fs::copy(&src, &dest) {
                if !dest.exists() {
                    return Err(format!("Failed to rename file: {}", e));
                }
                // dest exists — rename landed during the copy attempt
            } else {
                let _ = std::fs::remove_file(&src);
            }
        }
        // ponytail: if src didn't exist before the fallback, the filesystem
        // driver already moved it — treat as success.
    }

    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn move_file_to_folder(file_path: String, dest_folder: String) -> Result<String, String> {
    let projects_dir = get_projects_dir()?;
    let normalized = normalize_path(&file_path);
    let src = PathBuf::from(&normalized);
    if !src.starts_with(&projects_dir) {
        return Err(format!(
            "Refusing to move outside projects directory: {}",
            file_path
        ));
    }
    let dest_dir = PathBuf::from(normalize_path(&dest_folder));
    if !dest_dir.starts_with(&projects_dir) {
        return Err(format!(
            "Refusing to move to outside projects directory: {}",
            dest_folder
        ));
    }
    let file_name = src.file_name().ok_or("Failed to resolve file name")?;
    let dest = dest_dir.join(file_name);
    if dest.exists() {
        return Err("A file with the same name already exists in the destination".to_string());
    }
    if let Err(e) = std::fs::rename(&src, &dest) {
        if !rename_landed_after_error(&src, &dest) {
            if src.exists() {
                return Err(format!("Failed to move file: {}", e));
            }
            // ponytail: src gone after failed rename — filesystem driver already
            // moved it; treat as success.
        }
    }
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_file_content_previews(
    file_paths: Vec<String>,
    max_chars_per_file: Option<usize>,
) -> Result<Vec<FileContentPreview>, String> {
    let max_chars = max_chars_per_file
        .unwrap_or(DEFAULT_CONTENT_PREVIEW_CHARS)
        .clamp(200, MAX_CONTENT_PREVIEW_CHARS);

    let mut previews = Vec::new();

    for file_path in file_paths {
        let normalized = normalize_path(&file_path);
        let path = PathBuf::from(&normalized);
        if !path.exists() || !path.is_file() {
            continue;
        }

        let extension = path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or_default();

        if !is_text_like_extension(extension) {
            continue;
        }

        let bytes = match std::fs::read(&path) {
            Ok(contents) => contents,
            Err(_) => continue,
        };

        if bytes.iter().take(2048).any(|byte| *byte == 0) {
            continue;
        }

        let text = match String::from_utf8(bytes) {
            Ok(text) => text,
            Err(_) => continue,
        };

        let trimmed = text.trim();
        if trimmed.is_empty() {
            continue;
        }

        let mut chars = trimmed.chars();
        let mut content: String = chars.by_ref().take(max_chars).collect();
        if chars.next().is_some() {
            content.push('…');
        }

        previews.push(FileContentPreview { file_path, content });
    }

    Ok(previews)
}

#[tauri::command]
pub fn search_files_all_projects(query: String) -> Result<Vec<SearchResult>, String> {
    let projects_dir = get_projects_dir()?;
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();

    if !projects_dir.exists() {
        return Ok(results);
    }

    let project_dirs = std::fs::read_dir(&projects_dir)
        .map_err(|e| format!("Failed to read projects directory: {}", e))?;

    for project_entry in project_dirs {
        let project_entry =
            project_entry.map_err(|e| format!("Failed to read project entry: {}", e))?;
        let project_path = project_entry.path();

        if !project_path.is_dir() {
            continue;
        }

        let project_name = project_entry.file_name().to_string_lossy().to_string();

        if let Ok(files) = read_project_files_recursive(&project_path, &query_lower, &project_name)
        {
            results.extend(files);
        }
    }

    results.sort_by(|a, b| a.file.name.cmp(&b.file.name));
    Ok(results)
}

#[derive(Serialize, Clone)]
struct ImportProgress {
    completed: usize,
    total: usize,
}

fn count_files(dir: &Path) -> usize {
    let mut count = 0;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                count += count_files(&path);
            } else {
                count += 1;
            }
        }
    }
    count
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), std::io::Error> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let dest_path = dest.join(entry.file_name());
        if path.is_dir() {
            copy_dir_recursive(&path, &dest_path)?;
        } else {
            std::fs::copy(&path, &dest_path)?;
        }
    }
    Ok(())
}

fn copy_dir_recursive_with_progress(
    src: &Path,
    dest: &Path,
    completed: &mut usize,
    total: usize,
    app: &AppHandle,
) -> Result<(), std::io::Error> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let dest_path = dest.join(entry.file_name());
        if path.is_dir() {
            copy_dir_recursive_with_progress(&path, &dest_path, completed, total, app)?;
        } else {
            std::fs::copy(&path, &dest_path)?;
            *completed += 1;
            let _ = app.emit("import-progress", ImportProgress { completed: *completed, total });
        }
    }
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct FolderDropResult {
    pub folder_path: String,
    pub is_linked: bool,
}

/// Handle a folder dropped onto the sidebar. If the folder is already inside
/// the projects directory, link it in-place. Otherwise, copy it in.
#[tauri::command]
pub async fn handle_folder_drop(source_path: String) -> Result<FolderDropResult, String> {
    let normalized = normalize_path(&source_path);
    let src = PathBuf::from(&normalized);
    if !src.exists() {
        return Err(format!("Source folder not found: {}", source_path));
    }
    if !src.is_dir() {
        return Err(format!("Source path is not a directory: {}", source_path));
    }

    let projects_dir = get_projects_dir()?;

    // If already inside the projects directory, link it in-place
    if src.starts_with(&projects_dir) {
        let relative = src
            .strip_prefix(&projects_dir)
            .map_err(|_| "Could not compute relative path")?;
        let folder_path = relative.to_string_lossy().to_string().replace('\\', "/");
        return Ok(FolderDropResult {
            folder_path,
            is_linked: true,
        });
    }

    // Otherwise, import (copy) the folder into the projects directory
    let folder_name = src
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or("Could not determine folder name")?;

    let mut dest = projects_dir.join(&folder_name);
    if dest.exists() {
        let mut counter = 1;
        while dest.exists() {
            dest = projects_dir.join(format!("{} ({})", folder_name, counter));
            counter += 1;
        }
    }

    let dest_clone = dest.clone();
    tokio::task::spawn_blocking(move || copy_dir_recursive(&src, &dest_clone))
        .await
        .map_err(|_| "Blocking task panicked".to_string())?
        .map_err(|e| format!("Failed to copy folder: {}", e))?;

    let folder_path = dest
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(FolderDropResult {
        folder_path,
        is_linked: false,
    })
}

/// Link a folder in-place as a project (no copy). Returns the relative path
/// from the projects directory, or the folder name if outside.
#[tauri::command]
pub fn link_folder_as_project(source_path: String) -> Result<String, String> {
    let normalized = normalize_path(&source_path);
    let src = PathBuf::from(&normalized);
    if !src.exists() {
        return Err(format!("Source folder not found: {}", source_path));
    }
    if !src.is_dir() {
        return Err(format!("Source path is not a directory: {}", source_path));
    }

    let projects_dir = get_projects_dir()?;

    // ponytail: if the source is already inside the projects directory, preserve
    // the relative path so nested folders work correctly.
    if src.starts_with(&projects_dir) {
        let relative = src
            .strip_prefix(&projects_dir)
            .map_err(|_| "Could not compute relative path")?;
        // ponytail: normalize to forward slashes so the path works cross-platform
        return Ok(relative.to_string_lossy().to_string().replace('\\', "/"));
    }

    // ponytail: reject folders outside the projects directory — file lookups
    // expect the folder to be inside projects_dir.
    return Err(format!(
        "Please select a folder inside the projects directory ({}). \
You can change the projects directory above, or use \"Import folder\" to copy it in.",
        projects_dir.display()
    ));
}

#[tauri::command]
pub async fn import_folder_to_project(
    app: AppHandle,
    source_path: String,
) -> Result<String, String> {
    let normalized = normalize_path(&source_path);
    let src = PathBuf::from(&normalized);
    if !src.exists() {
        return Err(format!("Source folder not found: {}", source_path));
    }
    if !src.is_dir() {
        return Err(format!("Source path is not a directory: {}", source_path));
    }

    let folder_name = src
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or("Could not determine folder name")?;

    let projects_dir = get_projects_dir()?;

    // ponytail: if the source is already inside the projects directory, there is
    // nothing to copy — just return the folder name in-place.
    if src.starts_with(&projects_dir) {
        return Ok(folder_name);
    }

    let mut dest = projects_dir.join(&folder_name);

    if dest.exists() {
        let mut counter = 1;
        while dest.exists() {
            dest = projects_dir.join(format!("{} ({})", folder_name, counter));
            counter += 1;
        }
    }

    let total = count_files(&src);
    let app_for_progress = app.clone();
    let _ = app_for_progress.emit("import-progress", ImportProgress { completed: 0, total });

    // ponytail: offload blocking recursive copy to a spawn_blocking task so the
    // async runtime worker (and the UI) stays responsive.
    let dest_clone = dest.clone();
    let app_clone = app.clone();
    let copy_result = tokio::task::spawn_blocking(move || {
        let mut completed = 0;
        copy_dir_recursive_with_progress(&src, &dest_clone, &mut completed, total, &app_clone)
    })
    .await
    .map_err(|_| "Blocking task panicked".to_string())?;
    copy_result.map_err(|e| format!("Failed to copy folder: {}", e))?;

    let _ = app.emit("import-progress", ImportProgress { completed: total, total });

    Ok(dest
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default())
}

#[tauri::command]
pub async fn rename_project_folder(old_name: String, new_name: String) -> Result<(), String> {
    let projects_dir = get_projects_dir()?;
    let old_path = projects_dir.join(&old_name);
    let new_path = projects_dir.join(&new_name);

    if !old_path.exists() {
        return Err(format!("Folder not found: {}", old_name));
    }
    if !old_path.is_dir() {
        return Err(format!("Path is not a directory: {}", old_name));
    }
    if new_path.exists() {
        return Err(format!(
            "A folder named \"{}\" already exists",
            new_name
        ));
    }

    let old_clone = old_path.clone();
    let new_clone = new_path.clone();
    let name_for_error = new_name.clone();
    tokio::task::spawn_blocking(move || {
        // ponytail: try a fast atomic rename first. On the same filesystem
        // this moves all files and subdirectories instantly.
        if let Err(e) = std::fs::rename(&old_clone, &new_clone) {
            if !rename_landed_after_error(&old_clone, &new_clone) {
                if old_clone.exists() {
                    // ponytail: fallback to recursive copy + delete when the OS
                    // refuses a direct rename (e.g. locked files on Windows).
                    // This is slower but guarantees all contents move across.
                    if let Err(copy_err) = copy_dir_recursive(&old_clone, &new_clone) {
                        return Err(format!(
                            "Failed to rename folder: {}. Copy fallback also failed: {}",
                            e, copy_err
                        ));
                    }
                    if let Err(remove_err) = std::fs::remove_dir_all(&old_clone) {
                        return Err(format!(
                            "Folder copied to \"{}\" but could not remove old folder: {}. Please delete it manually.",
                            name_for_error, remove_err
                        ));
                    }
                }
                // ponytail: src gone after failed rename — filesystem driver already
                // moved it; treat as success.
            }
        }
        Ok(())
    })
    .await
    .map_err(|_| "Blocking task panicked".to_string())?
}

/// Copy an entire project folder (recursive) within the projects directory.
#[tauri::command]
pub async fn copy_project_folder(source_name: String, dest_name: String) -> Result<(), String> {
    let projects_dir = get_projects_dir()?;
    let src = projects_dir.join(&source_name);
    let dest = projects_dir.join(&dest_name);

    if !src.exists() {
        return Err(format!("Source folder not found: {}", source_name));
    }
    if !src.is_dir() {
        return Err(format!("Source path is not a directory: {}", source_name));
    }
    if dest.exists() {
        return Err(format!("A folder named \"{}\" already exists", dest_name));
    }

    let dest_clone = dest.clone();
    tokio::task::spawn_blocking(move || {
        std::fs::create_dir_all(&dest_clone)
            .map_err(|e| format!("Failed to create destination: {}", e))?;
        copy_dir_recursive(&src, &dest_clone)
            .map_err(|e| format!("Failed to copy folder contents: {}", e))
    })
    .await
    .map_err(|_| "Blocking task panicked".to_string())??;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn rename_landed_after_error_dest_exists() {
        let base = std::env::temp_dir().join(format!(
            "focal-files-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&base).unwrap();
        let src = base.join("old.txt");
        let dest = base.join("new.txt");
        std::fs::write(&dest, "moved").unwrap();

        // dest exists, src does not — typical "rename landed after error"
        assert!(rename_landed_after_error(&src, &dest));

        let _ = std::fs::remove_dir_all(base);
    }

    #[test]
    fn rename_landed_after_error_both_exist() {
        let base = std::env::temp_dir().join(format!(
            "focal-files-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&base).unwrap();
        let src = base.join("old.txt");
        let dest = base.join("new.txt");
        std::fs::write(&src, "original").unwrap();
        std::fs::write(&dest, "moved").unwrap();

        // dest exists even though src also exists — the rename landed
        assert!(rename_landed_after_error(&src, &dest));

        let _ = std::fs::remove_dir_all(base);
    }

    #[test]
    fn rename_landed_after_error_neither_exist() {
        let base = std::env::temp_dir().join(format!(
            "focal-files-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&base).unwrap();
        let src = base.join("old.txt");
        let dest = base.join("new.txt");

        // neither exists — rename did not land
        assert!(!rename_landed_after_error(&src, &dest));

        let _ = std::fs::remove_dir_all(base);
    }
}

fn read_project_files_recursive(
    dir: &Path,
    query: &str,
    project_prefix: &str,
) -> Result<Vec<SearchResult>, String> {
    let mut results = Vec::new();

    let entries = std::fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if file_name == ".DS_Store" {
            continue;
        }
        if path.is_file() && file_name.to_lowercase().contains(query) {
            let metadata = entry
                .metadata()
                .map_err(|e| format!("Failed to read metadata: {}", e))?;
            let extension = path
                .extension()
                .map(|e| e.to_string_lossy().to_string())
                .unwrap_or_default();
            let modified = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            let file_info = FileInfo {
                name: file_name,
                path: path.to_string_lossy().to_string(),
                size: metadata.len(),
                modified,
                extension,
                tags: None,
                subfolder: None,
                is_favorite: None,
            };

            results.push(SearchResult {
                file: file_info,
                project_folder: project_prefix.to_string(),
            });
        } else if path.is_dir() {
            // Recursively search subdirectories
            if let Ok(mut subresults) = read_project_files_recursive(&path, query, project_prefix) {
                results.append(&mut subresults);
            }
        }
    }

    Ok(results)
}
