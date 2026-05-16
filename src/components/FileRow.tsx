import { Badge } from "@/components/ui/badge"
import { formatFileSize, formatDate } from "@/lib/utils"
import type { FileInfo } from "@/lib/types"

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  jpg: { label: "img", color: "text-blue-600 dark:text-blue-400" },
  jpeg: { label: "img", color: "text-blue-600 dark:text-blue-400" },
  png: { label: "img", color: "text-blue-600 dark:text-blue-400" },
  gif: { label: "img", color: "text-blue-600 dark:text-blue-400" },
  svg: { label: "img", color: "text-blue-600 dark:text-blue-400" },
  webp: { label: "img", color: "text-blue-600 dark:text-blue-400" },
  ico: { label: "img", color: "text-blue-600 dark:text-blue-400" },
  bmp: { label: "img", color: "text-blue-600 dark:text-blue-400" },
  pdf: { label: "doc", color: "text-amber-600 dark:text-amber-400" },
  doc: { label: "doc", color: "text-amber-600 dark:text-amber-400" },
  docx: { label: "doc", color: "text-amber-600 dark:text-amber-400" },
  pptx: { label: "ppt", color: "text-red-600 dark:text-red-400" },
  txt: { label: "doc", color: "text-amber-600 dark:text-amber-400" },
  md: { label: "doc", color: "text-amber-600 dark:text-amber-400" },
  rtf: { label: "doc", color: "text-amber-600 dark:text-amber-400" },
  js: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  ts: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  jsx: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  tsx: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  py: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  rs: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  go: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  java: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  css: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  html: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  zip: { label: "arc", color: "text-orange-600 dark:text-orange-400" },
  tar: { label: "arc", color: "text-orange-600 dark:text-orange-400" },
  gz: { label: "arc", color: "text-orange-600 dark:text-orange-400" },
  rar: { label: "arc", color: "text-orange-600 dark:text-orange-400" },
  "7z": { label: "arc", color: "text-orange-600 dark:text-orange-400" },
  mp4: { label: "vid", color: "text-violet-600 dark:text-violet-400" },
  avi: { label: "vid", color: "text-violet-600 dark:text-violet-400" },
  mov: { label: "vid", color: "text-violet-600 dark:text-violet-400" },
  mkv: { label: "vid", color: "text-violet-600 dark:text-violet-400" },
  webm: { label: "vid", color: "text-violet-600 dark:text-violet-400" },
  mp3: { label: "aud", color: "text-pink-600 dark:text-pink-400" },
  wav: { label: "aud", color: "text-pink-600 dark:text-pink-400" },
  flac: { label: "aud", color: "text-pink-600 dark:text-pink-400" },
  aac: { label: "aud", color: "text-pink-600 dark:text-pink-400" },
  ogg: { label: "aud", color: "text-pink-600 dark:text-pink-400" },
}

function getFileTypeLabel(extension: string): { label: string; color: string } {
  const ext = extension.toLowerCase()
  return TYPE_LABELS[ext] || { label: "fl", color: "text-muted-foreground" }
}

interface FileRowProps {
  file: FileInfo
  onOpen?: (file: FileInfo) => void
}

export function FileRow({ file, onOpen }: FileRowProps) {
  const { label, color } = getFileTypeLabel(file.extension)

  return (
    <div
      className="flex items-center gap-3 px-8 py-2.5 hover:bg-accent/30 transition-colors group"
      onDoubleClick={() => onOpen?.(file)}
    >
      <span className={`text-[11px] font-semibold tracking-wide w-4 text-center leading-none ${color}`}>
        {label}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground/70 leading-tight mt-0.5">
          {formatDate(file.modified)}
        </p>
      </div>
      <Badge variant="secondary" className="text-[11px] font-normal tabular-nums h-5">
        {formatFileSize(file.size)}
      </Badge>
      <span className="text-[11px] text-muted-foreground font-mono uppercase w-12 text-right tabular-nums">
        .{file.extension || "?"}
      </span>
    </div>
  )
}
