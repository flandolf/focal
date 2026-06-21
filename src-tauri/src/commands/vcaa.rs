use serde::Serialize;
use std::time::Duration;

const VCAA_TIMETABLE_URL: &str = "https://www.vcaa.vic.edu.au/administration/key-dates/vce-examination-timetable";
const MAX_RESPONSE_BYTES: usize = 3 * 1024 * 1024;

#[derive(Serialize)]
pub struct VcaaTimetableResponse {
    html: String,
    url: &'static str,
}

#[tauri::command]
pub async fn fetch_vcaa_exam_timetable() -> Result<VcaaTimetableResponse, String> {
    let response = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| format!("Could not prepare the VCAA request: {error}"))?
        .get(VCAA_TIMETABLE_URL)
        .send()
        .await
        .map_err(|error| format!("Could not reach the VCAA timetable: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("VCAA returned HTTP {}", response.status().as_u16()));
    }
    if response.content_length().is_some_and(|length| length as usize > MAX_RESPONSE_BYTES) {
        return Err("The VCAA timetable response was unexpectedly large".into());
    }
    let html = response
        .text()
        .await
        .map_err(|error| format!("Could not read the VCAA timetable: {error}"))?;
    if html.len() > MAX_RESPONSE_BYTES {
        return Err("The VCAA timetable response was unexpectedly large".into());
    }

    Ok(VcaaTimetableResponse { html, url: VCAA_TIMETABLE_URL })
}
