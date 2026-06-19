// ponytail: The CSP string in `src-tauri/tauri.conf.json` under
// `app.security.csp` lets the production webview reach Ollama (and any
// other localhost LLM server) on http://localhost:11434 / 127.0.0.1.
// Tauri's default `csp: null` falls back to `default-src 'self'`, which
// blocks `fetch()` outside `self`. Tauri 2.x auto-adds
// `NSAllowsLocalNetworking` to macOS Info.plist so the platform layer is
// fine -- only the webview CSP needs widening.
//
// `tauri_build::build()` rejects strict-JSON-violating comments (no
// JSONC), so the rationale lives here instead of inline above. If you
// ever see `unable to parse JSON Tauri config` from this build script,
// check tauri.conf.json for stray `//` / `/* */` or trailing commas.
fn main() {
    tauri_build::build()
}
