import { readFileSync } from "node:fs"
import { strict as assert } from "node:assert"

const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version
const tauriVersion = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version
const cargoVersion = readFileSync("src-tauri/Cargo.toml", "utf8").match(/^version\s*=\s*"([^"]+)"/m)?.[1]

assert.equal(tauriVersion, packageVersion, "Tauri and package versions must match")
assert.equal(cargoVersion, packageVersion, "Cargo and package versions must match")

const releaseTag = process.env.GITHUB_REF_NAME
if (releaseTag?.startsWith("app-v")) {
  assert.equal(releaseTag, `app-v${packageVersion}`, "Release tag must match the app version")
}
