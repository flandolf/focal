use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::LazyLock;
use std::time::Duration;

const NOTION_API_VERSION: &str = "2022-06-28";
const NOTION_BASE_URL: &str = "https://api.notion.com/v1";
const REQUEST_TIMEOUT_SECS: u64 = 30;

static HTTP_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .expect("failed to build reqwest HTTP client")
});

#[derive(Debug, Serialize, Deserialize)]
pub struct NotionError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NotionQueryResponse {
    pub data: Option<Vec<Value>>,
    pub error: Option<NotionError>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NotionPageResponse {
    pub data: Option<Value>,
    pub error: Option<NotionError>,
}

fn query_error(code: &str, message: &str) -> NotionQueryResponse {
    NotionQueryResponse {
        data: None,
        error: Some(NotionError {
            code: code.to_string(),
            message: message.to_string(),
        }),
    }
}

fn page_error(code: &str, message: &str) -> NotionPageResponse {
    NotionPageResponse {
        data: None,
        error: Some(NotionError {
            code: code.to_string(),
            message: message.to_string(),
        }),
    }
}

async fn parse_notion_response(response: reqwest::Response) -> NotionPageResponse {
    let status = response.status();

    if status == reqwest::StatusCode::UNAUTHORIZED {
        let body = response.text().await.unwrap_or_default();
        let message = if body.is_empty() {
            "Notion rejected the integration token".to_string()
        } else {
            format!("Notion rejected the integration token: {}", body)
        };
        return page_error("NOTION_UNAUTHORIZED", &message);
    }

    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        // Try to extract Notion's error code from the JSON body.
        // Notion error shape: {"object":"error","status":404,"code":"object_not_found","message":"..."}
        let notion_code = serde_json::from_str::<Value>(&body)
            .ok()
            .and_then(|v| v.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()))
            .unwrap_or_else(|| "NOTION_ERROR".to_string());
        let message = if body.is_empty() {
            format!("Notion returned {}", status)
        } else {
            format!("Notion returned {}: {}", status, body)
        };
        return page_error(&notion_code, &message);
    }

    match response.json::<Value>().await {
        Ok(json) => NotionPageResponse {
            data: Some(json),
            error: None,
        },
        Err(e) => page_error("NOTION_ERROR", &format!("Invalid response: {}", e)),
    }
}

// -- Fetch schema (lightweight single page) --

#[tauri::command]
pub async fn fetch_notion_schema(token: String, data_source_id: String) -> NotionPageResponse {
    let token = token.trim();
    let data_source_id = data_source_id.trim();
    if token.is_empty() {
        return page_error("VALIDATION_ERROR", "Notion integration token is required");
    }
    if data_source_id.is_empty() {
        return page_error("VALIDATION_ERROR", "Notion database id is required");
    }

    // Retrieve a single page (or empty results) from the database to get the schema.
    // Notion's POST /databases/{id}/query returns property schema in the response even
    // with no results, so we page_size=1 and stop immediately after the first batch.
    let body = json!({ "page_size": 1 });

    let response = match HTTP_CLIENT
        .post(&format!("{}/databases/{}/query", NOTION_BASE_URL, data_source_id))
        .bearer_auth(token)
        .header("Notion-Version", NOTION_API_VERSION)
        .json(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return page_error("NETWORK_ERROR", &format!("Network error: {}", e)),
    };

    parse_notion_response(response).await
}

// -- Query --

#[tauri::command]
pub async fn query_notion_calendar(token: String, data_source_id: String) -> NotionQueryResponse {
    let token = token.trim();
    let data_source_id = data_source_id.trim();
    if token.is_empty() {
        return query_error("VALIDATION_ERROR", "Notion integration token is required");
    }
    if data_source_id.is_empty() {
        return query_error("VALIDATION_ERROR", "Notion database id is required");
    }

    let url = format!("{}/databases/{}/query", NOTION_BASE_URL, data_source_id);
    let mut cursor: Option<String> = None;
    let mut pages: Vec<Value> = Vec::new();

    loop {
        let body = match &cursor {
            Some(c) => json!({ "start_cursor": c }),
            None => json!({}),
        };

        let response = match HTTP_CLIENT
            .post(&url)
            .bearer_auth(token)
            .header("Notion-Version", NOTION_API_VERSION)
            .json(&body)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => return query_error("NETWORK_ERROR", &format!("Network error: {}", e)),
        };

        let status = response.status();
        if status == reqwest::StatusCode::UNAUTHORIZED {
            let body = response.text().await.unwrap_or_default();
            let message = if body.is_empty() {
                "Notion rejected the integration token".to_string()
            } else {
                format!("Notion rejected the integration token: {}", body)
            };
            return query_error("NOTION_UNAUTHORIZED", &message);
        }

        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            let notion_code = serde_json::from_str::<Value>(&body)
                .ok()
                .and_then(|v| v.get("code").and_then(|c| c.as_str()).map(|s| s.to_string()))
                .unwrap_or_else(|| "NOTION_ERROR".to_string());
            let message = if body.is_empty() {
                format!("Notion returned {}", status)
            } else {
                format!("Notion returned {}: {}", status, body)
            };
            return query_error(&notion_code, &message);
        }

        let json: Value = match response.json().await {
            Ok(v) => v,
            Err(e) => return query_error("NOTION_ERROR", &format!("Invalid response: {}", e)),
        };

        if let Some(results) = json.get("results").and_then(|v| v.as_array()) {
            pages.extend(results.iter().cloned());
        }

        cursor = json
            .get("next_cursor")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());

        if cursor.is_none() {
            break;
        }
    }

    NotionQueryResponse {
        data: Some(pages),
        error: None,
    }
}

// -- Create --

#[tauri::command]
pub async fn create_notion_calendar_page(
    token: String,
    data_source_id: String,
    properties: Value,
    children: Option<Value>,
) -> NotionPageResponse {
    let token = token.trim();
    let data_source_id = data_source_id.trim();
    if token.is_empty() {
        return page_error("VALIDATION_ERROR", "Notion integration token is required");
    }
    if data_source_id.is_empty() {
        return page_error("VALIDATION_ERROR", "Notion database id is required");
    }

    let mut body = json!({
        "parent": { "type": "database_id", "database_id": data_source_id },
        "properties": properties,
    });
    if let Some(children_val) = children {
        body["children"] = children_val;
    }

    let response = match HTTP_CLIENT
        .post(format!("{}/pages", NOTION_BASE_URL))
        .bearer_auth(token)
        .header("Notion-Version", NOTION_API_VERSION)
        .json(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return page_error("NETWORK_ERROR", &format!("Network error: {}", e)),
    };

    parse_notion_response(response).await
}

// -- Update --

#[tauri::command]
pub async fn update_notion_calendar_page(
    token: String,
    page_id: String,
    properties: Value,
    children: Option<Value>,
) -> NotionPageResponse {
    let token = token.trim();
    let page_id = page_id.trim();
    if token.is_empty() {
        return page_error("VALIDATION_ERROR", "Notion integration token is required");
    }
    if page_id.is_empty() {
        return page_error("VALIDATION_ERROR", "Notion page id is required");
    }

    let patch_body = json!({ "properties": properties });
    let response = match HTTP_CLIENT
        .patch(format!("{}/pages/{}", NOTION_BASE_URL, page_id))
        .bearer_auth(token)
        .header("Notion-Version", NOTION_API_VERSION)
        .json(&patch_body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return page_error("NETWORK_ERROR", &format!("Network error: {}", e)),
    };

    let page_response = parse_notion_response(response).await;
    if page_response.error.is_some() {
        return page_response;
    }

    // Replace page children if new children were provided
    if let Some(children_val) = children {
        replace_page_children(token, page_id, children_val).await;
    }

    page_response
}

async fn replace_page_children(token: &str, page_id: &str, new_children: Value) {
    let children_url = format!("{}/blocks/{}/children", NOTION_BASE_URL, page_id);

    // Delete existing children in parallel
    if let Ok(response) = HTTP_CLIENT
        .get(&children_url)
        .bearer_auth(token)
        .header("Notion-Version", NOTION_API_VERSION)
        .send()
        .await
    {
        if let Ok(json) = response.json::<Value>().await {
            if let Some(results) = json.get("results").and_then(|v| v.as_array()) {
                let block_ids: Vec<String> = results
                    .iter()
                    .filter_map(|block| block.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
                    .collect();

                // Delete all blocks concurrently
                let delete_futures = block_ids.iter().map(|block_id| {
                    HTTP_CLIENT
                        .delete(format!("{}/blocks/{}", NOTION_BASE_URL, block_id))
                        .bearer_auth(token)
                        .header("Notion-Version", NOTION_API_VERSION)
                        .send()
                });
                let _ = futures_util::future::join_all(delete_futures).await;
            }
        }
    }

    // Append new children
    let _ = HTTP_CLIENT
        .patch(&children_url)
        .bearer_auth(token)
        .header("Notion-Version", NOTION_API_VERSION)
        .json(&json!({ "children": new_children }))
        .send()
        .await;
}

// -- Delete (archive) --

#[tauri::command]
pub async fn delete_notion_page(token: String, page_id: String) -> NotionPageResponse {
    let token = token.trim();
    let page_id = page_id.trim();
    if token.is_empty() {
        return page_error("VALIDATION_ERROR", "Notion integration token is required");
    }
    if page_id.is_empty() {
        return page_error("VALIDATION_ERROR", "Notion page id is required");
    }

    let response = match HTTP_CLIENT
        .patch(format!("{}/pages/{}", NOTION_BASE_URL, page_id))
        .bearer_auth(token)
        .header("Notion-Version", NOTION_API_VERSION)
        .json(&json!({ "archived": true }))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return page_error("NETWORK_ERROR", &format!("Network error: {}", e)),
    };

    parse_notion_response(response).await
}
