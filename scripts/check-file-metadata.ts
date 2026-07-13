import {
  copyFileMetadataPrefixEntries,
  relocateFileMetadata,
  relocateFileMetadataPrefix,
} from "../src/lib/fileMetadata"

const original = {
  "old/notes.txt": { tags: ["notes" as const], isFavorite: true },
  "other.txt": { tags: ["resource" as const] },
}
const moved = relocateFileMetadata(original, "old/notes.txt", "new/notes.txt")

if (moved["old/notes.txt"] || !moved["new/notes.txt"]?.isFavorite) {
  throw new Error(`Metadata path was not migrated: ${JSON.stringify(moved)}`)
}
if (!original["old/notes.txt"] || moved["other.txt"] !== original["other.txt"]) {
  throw new Error("Metadata migration mutated the original map or unrelated entries")
}

const folderMoved = relocateFileMetadataPrefix(
  {
    "C:\\Projects\\Chemistry\\notes.txt": { tags: ["notes"] },
    "C:\\Projects\\Chemistry 2\\keep.txt": { isFavorite: true },
  },
  "C:\\Projects\\Chemistry",
  "C:\\Projects\\Chemistry SAC",
)
if (!folderMoved["C:\\Projects\\Chemistry SAC\\notes.txt"] || !folderMoved["C:\\Projects\\Chemistry 2\\keep.txt"]) {
  throw new Error(`Folder metadata prefix was migrated incorrectly: ${JSON.stringify(folderMoved)}`)
}

const folderCopied = copyFileMetadataPrefixEntries(
  { "C:\\Projects\\Chemistry\\notes.txt": { tags: ["notes"] } },
  "C:\\Projects\\Chemistry",
  "C:\\Projects\\Chemistry Copy",
)
if (!folderCopied["C:\\Projects\\Chemistry\\notes.txt"] || !folderCopied["C:\\Projects\\Chemistry Copy\\notes.txt"]) {
  throw new Error(`Folder metadata prefix was not copied: ${JSON.stringify(folderCopied)}`)
}

console.warn("file metadata check passed")
