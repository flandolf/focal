use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

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

fn error_response(code: &str, message: &str) -> NotionQueryResponse {
    NotionQueryResponse {
        data: None,
        error: Some(NotionError {
            code: code.to_string(),
            message: message.to_string(),
        }),
    }
}

fn page_error_response(code: &str, message: &str) -> NotionPageResponse {
    NotionPageResponse {
        data: None,
        error: Some(NotionError {
            code: code.to_string(),
            message: message.to_string(),
        }),
    }
}

fn post_notion_query(
    client: &reqwest::blocking::Client,
    token: &str,
    url: &str,
    notion_version: &str,
    cursor: Option<&str>,
) -> Result<reqwest::blocking::Response, reqwest::Error> {
    let body = match cursor {
        Some(cursor) => json!({ "start_cursor": cursor }),
        None => json!({}),
    };

    client
        .post(url)
        .bearer_auth(token)
        .header("Notion-Version", notion_version)
        .json(&body)
        .send()
}

fn parse_notion_page_response(response: reqwest::blocking::Response) -> NotionPageResponse {
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return page_error_response("NOTION_UNAUTHORIZED", "Notion rejected the integration token");
    }

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        let message = if body.is_empty() {
            format!("Notion returned {}", status)
        } else {
            format!("Notion returned {}: {}", status, body)
        };
        return page_error_response("NOTION_ERROR", &message);
    }

    let json: Value = match response.json() {
        Ok(json) => json,
        Err(e) => return page_error_response("NOTION_ERROR", &format!("Invalid response: {}", e)),
    };

    NotionPageResponse {
        data: Some(json),
        error: None,
    }
}

#[tauri::command]
pub fn query_notion_calendar(token: String, data_source_id: String) -> NotionQueryResponse {
    let token = token.trim();
    let data_source_id = data_source_id.trim();
    if token.is_empty() {
        return error_response("VALIDATION_ERROR", "Notion integration token is required");
    }
    if data_source_id.is_empty() {
        return error_response("VALIDATION_ERROR", "Notion data source or database id is required");
    }

    let client = reqwest::blocking::Client::new();
    let data_source_url = format!("https://api.notion.com/v1/data_sources/{}/query", data_source_id);
    let database_url = format!("https://api.notion.com/v1/databases/{}/query", data_source_id);
    let mut use_database_endpoint = false;
    let mut cursor: Option<String> = None;
    let mut pages: Vec<Value> = Vec::new();

    loop {
        let url = if use_database_endpoint {
            &database_url
        } else {
            &data_source_url
        };
        let notion_version = if use_database_endpoint {
            "2022-06-28"
        } else {
            "2025-09-03"
        };
        let response = post_notion_query(&client, token, url, notion_version, cursor.as_deref());
        let response = match response {
            Ok(response) => response,
            Err(e) => return error_response("NETWORK_ERROR", &format!("Network error: {}", e)),
        };

        if !use_database_endpoint
            && matches!(
                response.status(),
                reqwest::StatusCode::NOT_FOUND | reqwest::StatusCode::BAD_REQUEST
            )
        {
            use_database_endpoint = true;
            cursor = None;
            pages.clear();
            continue;
        }

        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            return error_response("NOTION_UNAUTHORIZED", "Notion rejected the integration token");
        }

        if !response.status().is_success() {
            return error_response(
                "NOTION_ERROR",
                &format!("Notion returned {}", response.status()),
            );
        }

        let json: Value = match response.json() {
            Ok(json) => json,
            Err(e) => return error_response("NOTION_ERROR", &format!("Invalid response: {}", e)),
        };

        if let Some(results) = json.get("results").and_then(|value| value.as_array()) {
            pages.extend(results.iter().cloned());
        }

        cursor = json
            .get("next_cursor")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string());
        if cursor.is_none() {
            break;
        }
    }

    NotionQueryResponse {
        data: Some(pages),
        error: None,
    }
}

#[tauri::command]
pub fn create_notion_calendar_page(
    token: String,
    data_source_id: String,
    properties: Value,
) -> NotionPageResponse {
    let token = token.trim();
    let data_source_id = data_source_id.trim();
    if token.is_empty() {
        return page_error_response("VALIDATION_ERROR", "Notion integration token is required");
    }
    if data_source_id.is_empty() {
        return page_error_response("VALIDATION_ERROR", "Notion data source or database id is required");
    }

    let client = reqwest::blocking::Client::new();
    let data_source_body = json!({
        "parent": { "type": "data_source_id", "data_source_id": data_source_id },
        "properties": properties,
    });
    let response = client
        .post("https://api.notion.com/v1/pages")
        .bearer_auth(token)
        .header("Notion-Version", "2025-09-03")
        .json(&data_source_body)
        .send();

    let response = match response {
        Ok(response) => response,
        Err(e) => return page_error_response("NETWORK_ERROR", &format!("Network error: {}", e)),
    };

    if matches!(
        response.status(),
        reqwest::StatusCode::NOT_FOUND | reqwest::StatusCode::BAD_REQUEST
    ) {
        let database_body = json!({
            "parent": { "type": "database_id", "database_id": data_source_id },
            "properties": data_source_body["properties"].clone(),
        });
        let fallback = client
            .post("https://api.notion.com/v1/pages")
            .bearer_auth(token)
            .header("Notion-Version", "2022-06-28")
            .json(&database_body)
            .send();

        return match fallback {
            Ok(response) => parse_notion_page_response(response),
            Err(e) => page_error_response("NETWORK_ERROR", &format!("Network error: {}", e)),
        };
    }

    parse_notion_page_response(response)
}

#[tauri::command]
pub fn update_notion_calendar_page(
    token: String,
    page_id: String,
    properties: Value,
) -> NotionPageResponse {
    let token = token.trim();
    let page_id = page_id.trim();
    if token.is_empty() {
        return page_error_response("VALIDATION_ERROR", "Notion integration token is required");
    }
    if page_id.is_empty() {
        return page_error_response("VALIDATION_ERROR", "Notion page id is required");
    }

    let client = reqwest::blocking::Client::new();
    let body = json!({ "properties": properties });
    let response = client
        .patch(format!("https://api.notion.com/v1/pages/{}", page_id))
        .bearer_auth(token)
        .header("Notion-Version", "2025-09-03")
        .json(&body)
        .send();

    match response {
        Ok(response) => parse_notion_page_response(response),
        Err(e) => page_error_response("NETWORK_ERROR", &format!("Network error: {}", e)),
    }
}
