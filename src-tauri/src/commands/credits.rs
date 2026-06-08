use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct CreditsInfo {
    pub total_credits: f64,
    pub total_usage: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreditsError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreditsResponse {
    pub data: Option<CreditsInfo>,
    pub error: Option<CreditsError>,
}

fn error_response(code: &str, message: &str) -> CreditsResponse {
    CreditsResponse {
        data: None,
        error: Some(CreditsError {
            code: code.to_string(),
            message: message.to_string(),
        }),
    }
}

#[tauri::command]
pub async fn get_credits(api_key: String) -> CreditsResponse {
    if api_key.trim().is_empty() {
        return error_response("VALIDATION_ERROR", "API key is required");
    }

    let client = reqwest::Client::new();
    let resp = match client
        .get("https://openrouter.ai/api/v1/credits")
        .bearer_auth(api_key)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return error_response("NETWORK_ERROR", &format!("Network error: {}", e)),
    };

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return error_response(
            "OPENROUTER_UNAUTHORIZED",
            "A Management key is required to view credits",
        );
    }

    if !resp.status().is_success() {
        return error_response(
            "OPENROUTER_ERROR",
            &format!("OpenRouter returned {}", resp.status()),
        );
    }

    let json: serde_json::Value = match resp.json().await {
        Ok(j) => j,
        Err(e) => return error_response("OPENROUTER_ERROR", &format!("Invalid response: {}", e)),
    };

    let data = match json.get("data") {
        Some(d) => d,
        None => return error_response("OPENROUTER_ERROR", "Invalid response"),
    };

    let total_credits = data
        .get("total_credits")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let total_usage = data
        .get("total_usage")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    CreditsResponse {
        data: Some(CreditsInfo {
            total_credits,
            total_usage,
        }),
        error: None,
    }
}
