import { appDataDir } from "@tauri-apps/api/path"
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs"

const DEVICE_FILE = "sync-device.json"
const DEVICE_STORAGE_KEY = "focal-sync-device-id"

function createDeviceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function appDataPath(fileName: string): Promise<string> {
  const baseDir = await appDataDir()
  if (!(await exists(baseDir))) {
    await mkdir(baseDir, { recursive: true })
  }
  return `${baseDir}/${fileName}`
}

export async function getDeviceId(): Promise<string> {
  const cached = typeof localStorage === "undefined" ? null : localStorage.getItem(DEVICE_STORAGE_KEY)
  if (cached) return cached

  try {
    const path = await appDataPath(DEVICE_FILE)
    if (await exists(path)) {
      const raw = JSON.parse(await readTextFile(path)) as { deviceId?: unknown }
      if (typeof raw.deviceId === "string" && raw.deviceId.length > 0) {
        localStorage.setItem(DEVICE_STORAGE_KEY, raw.deviceId)
        return raw.deviceId
      }
    }

    const deviceId = createDeviceId()
    await writeTextFile(path, JSON.stringify({ deviceId }, null, 2))
    localStorage.setItem(DEVICE_STORAGE_KEY, deviceId)
    return deviceId
  } catch {
    const fallback = createDeviceId()
    localStorage.setItem(DEVICE_STORAGE_KEY, fallback)
    return fallback
  }
}

