// ponytail: `tauri.conf.json` carries `// ponytail:` annotations in
// `app.security.csp` — strict `JSON.parse` rejects `//`, and round-tripping
// through `JSON.stringify` would strip them. Mirror the Cargo.toml pattern:
// read as text and regex-replace the top-level `"version"` field.
const fs = require("fs")

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"))
const tauriPath = "src-tauri/tauri.conf.json"
const tauriText = fs.readFileSync(tauriPath, "utf8")
const cargoTomlPath = "src-tauri/Cargo.toml"
const cargoToml = fs.readFileSync(cargoTomlPath, "utf8")

let [major, minor, patch] = pkg.version.split(".").map(Number)

patch += 1
if (patch >= 10) {
  patch = 0
  minor += 1
}
if (minor >= 10) {
  minor = 0
  major += 1
}

const newVersion = major + "." + minor + "." + patch

pkg.version = newVersion

fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n")
fs.writeFileSync(
  tauriPath,
  // Match the first `"version"` key (top-level in tauri.conf.json).
  tauriText.replace(/("version"\s*:\s*")[^"]+(")/, `$1${newVersion}$2`),
)
fs.writeFileSync(
  cargoTomlPath,
  cargoToml.replace(/^(version\s*=\s*")[^\"]+("\s*)$/m, `$1${newVersion}$2`),
)

console.log(newVersion)
