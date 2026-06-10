const fs = require("fs")

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"))
const tauri = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"))

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
tauri.version = newVersion

fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n")
fs.writeFileSync("src-tauri/tauri.conf.json", JSON.stringify(tauri, null, 2) + "\n")

console.log(newVersion)
