import { platform } from "@tauri-apps/plugin-os"

export const isMacOS = (() => {
  try {
    return platform() === "macos"
  } catch {
    return false
  }
})()
