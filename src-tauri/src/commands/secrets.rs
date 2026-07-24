use keyring::{Entry, Error};
use std::collections::HashMap;
use std::sync::Mutex as StdMutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex as TokioMutex;

const SERVICE_NAME: &str = "com.andy.focal";
const ALLOWED_KEYS: [&str; 3] = [
    "openrouter_api_key",
    "notion_token",
    "supabase_auth_session",
];
const CHUNK_MANIFEST_PREFIX: &str = "focal-keyring-chunks:v1:";
// Windows Credential Manager caps the encoded blob at 2560 bytes. UTF-16 uses
// two bytes per code unit, so stay below 1280 units with a little headroom.
const MAX_CHUNK_UTF16_UNITS: usize = 1200;
const MAX_CHUNK_COUNT: usize = 128;

// Per-key locks to serialize get_secret and set_secret operations
static KEY_LOCKS: std::sync::OnceLock<StdMutex<HashMap<String, std::sync::Arc<TokioMutex<()>>>>> =
    std::sync::OnceLock::new();

fn get_key_lock(key: &str) -> std::sync::Arc<TokioMutex<()>> {
    let locks = KEY_LOCKS.get_or_init(|| StdMutex::new(HashMap::new()));
    let mut map = locks.lock().unwrap();
    map.entry(key.to_string())
        .or_insert_with(|| std::sync::Arc::new(TokioMutex::new(())))
        .clone()
}

fn validate_key(key: &str) -> Result<(), String> {
    if ALLOWED_KEYS.contains(&key) {
        Ok(())
    } else {
        Err("Unsupported secret key".to_string())
    }
}

fn unchecked_entry(username: &str) -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, username).map_err(|error| error.to_string())
}

fn entry(key: &str) -> Result<Entry, String> {
    validate_key(key)?;
    unchecked_entry(key)
}

fn chunk_username(key: &str, generation: &str, index: usize) -> String {
    format!("{key}:chunk:{generation}:{index}")
}

fn chunk_secret_for_windows(value: &str) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();
    let mut current_units = 0;
    for character in value.chars() {
        let units = character.len_utf16();
        if current_units + units > MAX_CHUNK_UTF16_UNITS && !current.is_empty() {
            chunks.push(current);
            current = String::new();
            current_units = 0;
        }
        current.push(character);
        current_units += units;
    }
    if !current.is_empty() {
        chunks.push(current);
    }
    chunks
}

fn chunk_secret(value: &str) -> Vec<String> {
    if cfg!(target_os = "windows") {
        chunk_secret_for_windows(value)
    } else {
        vec![value.to_string()]
    }
}

fn parse_manifest(value: &str) -> Result<Option<(String, usize)>, String> {
    let Some(encoded) = value.strip_prefix(CHUNK_MANIFEST_PREFIX) else {
        return Ok(None);
    };
    let (generation, count) = encoded
        .rsplit_once(':')
        .ok_or_else(|| "Invalid credential chunk manifest".to_string())?;
    let count = count
        .parse::<usize>()
        .map_err(|_| "Invalid credential chunk count".to_string())?;
    let valid_generation = !generation.is_empty()
        && generation.len() <= 64
        && generation
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-');
    if !valid_generation || count == 0 || count > MAX_CHUNK_COUNT {
        return Err("Invalid credential chunk manifest".to_string());
    }
    Ok(Some((generation.to_string(), count)))
}

fn read_chunked_secret(key: &str, stored: &str) -> Result<Option<String>, String> {
    let Some((generation, count)) = parse_manifest(stored)? else {
        return Ok(Some(stored.to_string()));
    };
    let mut value = String::new();
    for index in 0..count {
        let chunk = unchecked_entry(&chunk_username(key, &generation, index))?
            .get_password()
            .map_err(|error| format!("Credential chunk {index} could not be read: {error}"))?;
        value.push_str(&chunk);
    }
    Ok(Some(value))
}

fn delete_if_present(entry: &Entry) -> Result<(), String> {
    match entry.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn delete_chunks(key: &str, manifest: &str) {
    let Ok(Some((generation, count))) = parse_manifest(manifest) else {
        return;
    };
    for index in 0..count {
        if let Ok(entry) = unchecked_entry(&chunk_username(key, &generation, index)) {
            let _ = delete_if_present(&entry);
        }
    }
}

fn write_chunks(key: &str, generation: &str, chunks: &[String]) -> Result<(), String> {
    for (index, chunk) in chunks.iter().enumerate() {
        let result = unchecked_entry(&chunk_username(key, generation, index))
            .and_then(|entry| entry.set_password(chunk).map_err(|error| error.to_string()));
        if let Err(error) = result {
            for cleanup_index in 0..index {
                if let Ok(entry) = unchecked_entry(&chunk_username(key, generation, cleanup_index))
                {
                    let _ = delete_if_present(&entry);
                }
            }
            return Err(error);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn get_secret(key: String) -> Result<Option<String>, String> {
    validate_key(&key)?;
    let lock = get_key_lock(&key);
    let _guard = lock.lock().await;
    tokio::task::spawn_blocking(move || {
        let primary = entry(&key)?;
        match primary.get_password() {
            Ok(stored) => {
                let value = read_chunked_secret(&key, &stored)?;
                if !cfg!(target_os = "windows") && parse_manifest(&stored)?.is_some() {
                    if let Some(value) = value.as_deref() {
                        if primary.set_password(value).is_ok() {
                            delete_chunks(&key, &stored);
                        }
                    }
                }
                Ok(value)
            }
            Err(Error::NoEntry) => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn set_secret(key: String, value: String) -> Result<(), String> {
    validate_key(&key)?;
    let lock = get_key_lock(&key);
    let _guard = lock.lock().await;
    tokio::task::spawn_blocking(move || {
        let primary = entry(&key)?;
        let previous = primary.get_password().ok();
        if value.is_empty() {
            delete_if_present(&primary)?;
            if let Some(manifest) = previous.as_deref() {
                delete_chunks(&key, manifest);
            }
            return Ok(());
        }

        let chunks = chunk_secret(&value);
        if chunks.len() <= 1 {
            primary
                .set_password(&value)
                .map_err(|error| error.to_string())?;
        } else {
            if chunks.len() > MAX_CHUNK_COUNT {
                return Err("Secret is too large for secure credential storage".to_string());
            }
            let generation = format!(
                "{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map_err(|error| error.to_string())?
                    .as_nanos()
            );
            write_chunks(&key, &generation, &chunks)?;
            let manifest = format!("{CHUNK_MANIFEST_PREFIX}{generation}:{}", chunks.len());
            if let Err(error) = primary.set_password(&manifest) {
                delete_chunks(&key, &manifest);
                return Err(error.to_string());
            }
        }

        if let Some(manifest) = previous.as_deref() {
            delete_chunks(&key, manifest);
        }
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{
        chunk_secret, chunk_secret_for_windows, parse_manifest, validate_key,
        MAX_CHUNK_UTF16_UNITS,
    };

    #[test]
    fn only_known_secret_keys_cross_the_ipc_boundary() {
        assert!(validate_key("openrouter_api_key").is_ok());
        assert!(validate_key("notion_token").is_ok());
        assert!(validate_key("supabase_auth_session").is_ok());
        assert!(validate_key("../../credential").is_err());
        assert!(validate_key("supabase_service_role").is_err());
    }

    #[test]
    fn long_secrets_round_trip_through_bounded_utf16_chunks() {
        let value = format!("{}{}", "a".repeat(4_000), "🧠".repeat(500));
        let chunks = chunk_secret_for_windows(&value);
        assert!(chunks.len() > 1);
        assert!(chunks
            .iter()
            .all(|chunk| chunk.encode_utf16().count() <= MAX_CHUNK_UTF16_UNITS));
        assert!(chunks
            .iter()
            .all(|chunk| chunk.encode_utf16().count() * 2 < 2560));
        assert_eq!(chunks.concat(), value);
    }

    #[test]
    fn non_windows_stores_do_not_split_long_secrets() {
        if cfg!(target_os = "windows") {
            return;
        }
        let value = "a".repeat(10_000);
        assert_eq!(chunk_secret(&value), vec![value]);
    }

    #[test]
    fn chunk_manifests_are_strictly_validated() {
        assert_eq!(
            parse_manifest("focal-keyring-chunks:v1:generation:3").unwrap(),
            Some(("generation".to_string(), 3))
        );
        assert!(parse_manifest("focal-keyring-chunks:v1:generation:0").is_err());
        assert!(parse_manifest("focal-keyring-chunks:v1:generation:999").is_err());
        assert_eq!(parse_manifest("ordinary-token").unwrap(), None);
    }
}
