use std::path::PathBuf;
use serde::{Serialize, Deserialize};

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
            tags: None,
            subfolder: None,
            is_favorite: None,
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

#[tauri::command]
pub fn create_project_with_subfolders(project_name: String, subfolders: Vec<String>) -> Result<String, String> {
    let projects_dir = get_documents_dir()?;
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
pub fn get_subject_folder_template(subject_id: String) -> Result<Vec<String>, String> {
    let templates: std::collections::HashMap<&str, Vec<&str>> = [
        ("eng", vec!["Essays", "Texts", "Writing Practice", "SACs", "Notes", "Past-Papers", "Exam-Revision"]),
        ("eng-lang", vec!["Language Analysis", "Written & Spoken", "SACs", "Notes", "Vocabulary", "Past-Papers", "Exam-Revision"]),
        ("lit", vec!["Primary Texts", "Critical Analysis", "Essay Plans", "SACs", "Notes", "Past-Papers", "Exam-Revision"]),
        ("mm", vec!["Unit 1 Notes", "Unit 2 Notes", "Formulas", "Practice Problems", "SACs", "Past-Papers", "Exam-Revision"]),
        ("sm", vec!["Unit 3 Notes", "Unit 4 Notes", "Proofs", "Challenge Problems", "SACs", "Past-Papers", "Exam-Revision"]),
        ("fm", vec!["Statistics", "Financial Math", "Practice Sets", "SACs", "Notes", "Past-Papers", "Exam-Revision"]),
        ("chem", vec!["Experiment Reports", "Equations", "Electron Configurations", "SACs", "Notes", "Past-Papers", "Exam-Revision"]),
        ("phys", vec!["Experiment Reports", "Formulas", "Problem Sets", "SACs", "Notes", "Past-Papers", "Exam-Revision"]),
        ("bio", vec!["Practicals", "Diagrams", "Key Concepts", "SACs", "Notes", "Past-Papers", "Exam-Revision"]),
        ("psych", vec!["Research Studies", "Theories", "Case Studies", "SACs", "Notes", "Past-Papers", "Exam-Revision"]),
        ("hist", vec!["Primary Sources", "Essay Plans", "Timelines", "SACs", "Notes", "Past-Papers", "Exam-Revision"]),
        ("geo", vec!["Case Studies", "Fieldwork", "Maps & Diagrams", "SACs", "Notes", "Past-Papers", "Exam-Revision"]),
        ("econ", vec!["Case Studies", "Data & Graphs", "Models", "SACs", "Notes", "Past-Papers", "Exam-Revision"]),
        ("bm", vec!["Reports", "Case Studies", "Strategies", "SACs", "Notes", "Past-Papers", "Exam-Revision"]),
    ].iter().cloned().collect();

    let default = vec!["SACs".to_string(), "Notes".to_string(), "Past-Papers".to_string(), "Exam-Revision".to_string(), "Resources".to_string()];

    Ok(templates
        .get(subject_id.as_str())
        .map(|folders| folders.iter().map(|s| s.to_string()).collect::<Vec<_>>())
        .unwrap_or(default))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub file: FileInfo,
    pub project_folder: String,
}

#[tauri::command]
pub fn delete_files(file_paths: Vec<String>) -> Result<usize, String> {
    let mut deleted = 0;
    for path in &file_paths {
        let p = PathBuf::from(path);
        if p.exists() && p.is_file() {
            std::fs::remove_file(&p)
                .map_err(|e| format!("Failed to delete {}: {}", path, e))?;
            deleted += 1;
        } else if p.exists() && p.is_dir() {
            std::fs::remove_dir_all(&p)
                .map_err(|e| format!("Failed to delete {}: {}", path, e))?;
            deleted += 1;
        }
    }
    Ok(deleted)
}

#[tauri::command]
pub fn search_files_all_projects(query: String) -> Result<Vec<SearchResult>, String> {
    let projects_dir = get_documents_dir()?;
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();

    if !projects_dir.exists() {
        return Ok(results);
    }

    let project_dirs = std::fs::read_dir(&projects_dir)
        .map_err(|e| format!("Failed to read projects directory: {}", e))?;

    for project_entry in project_dirs {
        let project_entry = project_entry.map_err(|e| format!("Failed to read project entry: {}", e))?;
        let project_path = project_entry.path();
        
        if !project_path.is_dir() {
            continue;
        }

        let project_name = project_entry.file_name().to_string_lossy().to_string();
        
        if let Ok(files) = read_project_files_recursive(&project_path, &query_lower, &project_name) {
            results.extend(files);
        }
    }

    results.sort_by(|a, b| a.file.name.cmp(&b.file.name));
    Ok(results)
}

fn read_project_files_recursive(dir: &PathBuf, query: &str, project_prefix: &str) -> Result<Vec<SearchResult>, String> {
    let mut results = Vec::new();

    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if path.is_file() && file_name.to_lowercase().contains(query) {
            let metadata = entry.metadata().map_err(|e| format!("Failed to read metadata: {}", e))?;
            let extension = path.extension()
                .map(|e| e.to_string_lossy().to_string())
                .unwrap_or_default();
            let modified = metadata.modified()
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
