import {
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileJson,
  FileQuestion,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Presentation,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface FileTypeMeta {
  label: string
  Icon: LucideIcon
  className: string
  surfaceClassName: string
}

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "svg", "webp", "ico", "bmp", "heic"]
const DOCUMENT_EXTENSIONS = ["pdf", "doc", "docx", "rtf", "pages"]
const TEXT_EXTENSIONS = ["txt", "md", "markdown"]
const PRESENTATION_EXTENSIONS = ["ppt", "pptx", "key"]
const SPREADSHEET_EXTENSIONS = ["csv", "tsv", "xls", "xlsx", "numbers"]
const CODE_EXTENSIONS = [
  "js",
  "ts",
  "jsx",
  "tsx",
  "py",
  "rs",
  "go",
  "java",
  "css",
  "html",
  "swift",
  "kt",
  "c",
  "cpp",
  "h",
  "sh",
]
const JSON_EXTENSIONS = ["json", "jsonl", "lock"]
const ARCHIVE_EXTENSIONS = ["zip", "tar", "gz", "rar", "7z", "dmg"]
const VIDEO_EXTENSIONS = ["mp4", "avi", "mov", "mkv", "webm"]
const AUDIO_EXTENSIONS = ["mp3", "wav", "flac", "aac", "ogg", "m4a"]

function hasExtension(extension: string, group: string[]) {
  return group.includes(extension.toLowerCase())
}

function getFileTypeMeta(extension: string): FileTypeMeta {
  const ext = extension.toLowerCase()

  if (hasExtension(ext, IMAGE_EXTENSIONS)) {
    return {
      label: "Image file",
      Icon: FileImage,
      className: "text-sky-600 dark:text-sky-400",
      surfaceClassName: "bg-sky-500/10 ring-sky-500/15",
    }
  }
  if (hasExtension(ext, DOCUMENT_EXTENSIONS)) {
    return {
      label: ext === "pdf" ? "PDF document" : "Document file",
      Icon: FileText,
      className: ext === "pdf" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400",
      surfaceClassName: ext === "pdf" ? "bg-red-500/10 ring-red-500/15" : "bg-amber-500/10 ring-amber-500/15",
    }
  }
  if (hasExtension(ext, TEXT_EXTENSIONS)) {
    return {
      label: "Text file",
      Icon: FileType,
      className: "text-stone-600 dark:text-stone-300",
      surfaceClassName: "bg-stone-500/10 ring-stone-500/15",
    }
  }
  if (hasExtension(ext, PRESENTATION_EXTENSIONS)) {
    return {
      label: "Presentation file",
      Icon: Presentation,
      className: "text-orange-600 dark:text-orange-400",
      surfaceClassName: "bg-orange-500/10 ring-orange-500/15",
    }
  }
  if (hasExtension(ext, SPREADSHEET_EXTENSIONS)) {
    return {
      label: "Spreadsheet file",
      Icon: FileSpreadsheet,
      className: "text-emerald-600 dark:text-emerald-400",
      surfaceClassName: "bg-emerald-500/10 ring-emerald-500/15",
    }
  }
  if (hasExtension(ext, JSON_EXTENSIONS)) {
    return {
      label: "Data file",
      Icon: FileJson,
      className: "text-teal-600 dark:text-teal-400",
      surfaceClassName: "bg-teal-500/10 ring-teal-500/15",
    }
  }
  if (hasExtension(ext, CODE_EXTENSIONS)) {
    return {
      label: "Code file",
      Icon: FileCode2,
      className: "text-cyan-700 dark:text-cyan-300",
      surfaceClassName: "bg-cyan-500/10 ring-cyan-500/15",
    }
  }
  if (hasExtension(ext, ARCHIVE_EXTENSIONS)) {
    return {
      label: "Archive file",
      Icon: FileArchive,
      className: "text-orange-700 dark:text-orange-300",
      surfaceClassName: "bg-orange-500/10 ring-orange-500/15",
    }
  }
  if (hasExtension(ext, VIDEO_EXTENSIONS)) {
    return {
      label: "Video file",
      Icon: FileVideo,
      className: "text-violet-600 dark:text-violet-400",
      surfaceClassName: "bg-violet-500/10 ring-violet-500/15",
    }
  }
  if (hasExtension(ext, AUDIO_EXTENSIONS)) {
    return {
      label: "Audio file",
      Icon: FileAudio,
      className: "text-pink-600 dark:text-pink-400",
      surfaceClassName: "bg-pink-500/10 ring-pink-500/15",
    }
  }
  if (!ext) {
    return {
      label: "Unknown file",
      Icon: FileQuestion,
      className: "text-muted-foreground",
      surfaceClassName: "bg-muted/55 ring-border",
    }
  }

  return {
    label: "File",
    Icon: File,
    className: "text-muted-foreground",
    surfaceClassName: "bg-muted/55 ring-border",
  }
}

interface FileTypeIconProps {
  extension: string
  className?: string
  iconClassName?: string
}

export function FileTypeIcon({ extension, className, iconClassName }: FileTypeIconProps) {
  const { Icon, label, className: colorClassName, surfaceClassName } = getFileTypeMeta(extension)
  const normalizedExtension = extension ? extension.toUpperCase() : "?"

  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg ring-1",
        surfaceClassName,
        className,
      )}
      aria-label={`${label}: ${normalizedExtension}`}
      title={`${label}: .${extension || "unknown"}`}
    >
      <Icon className={cn("size-4", colorClassName, iconClassName)} aria-hidden="true" />
    </span>
  )
}
