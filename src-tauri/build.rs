// ponytail: The packaged Windows webview has origin `http://tauri.localhost`,
// which Ollama's default CORS policy rejects. Ollama calls therefore use the
// small native bridge in `src-tauri/src/commands/ollama.rs`; browser-only
// development still uses fetch. The CSP keeps loopback fetch available where
// CORS permits.
//
// `tauri_build::build()` rejects strict-JSON-violating comments (no
// JSONC), so the rationale lives here instead of inline above. If you
// ever see `unable to parse JSON Tauri config` from this build script,
// check tauri.conf.json for stray `//` / `/* */` or trailing commas.
fn main() {
    tauri_build::build()
}
