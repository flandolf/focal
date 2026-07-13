import { parseBackup } from "../src/lib/backup"

const project = { id: "p1", name: "Chemistry", folder_path: "Chemistry" }
for (const key of ["assessments", "projects"]) {
  const parsed = parseBackup(JSON.stringify({ [key]: [project] }))
  if (JSON.stringify(parsed.projects) !== JSON.stringify([project])) {
    throw new Error(`Failed to parse ${key} backup`)
  }
}

for (const invalid of ["[]", "{}", '{"events":"bad"}', '{"sessions":[{}]}']) {
  try {
    parseBackup(invalid)
    throw new Error(`Accepted invalid backup: ${invalid}`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Accepted invalid backup:")) throw error
  }
}

console.warn("backup import check passed")
