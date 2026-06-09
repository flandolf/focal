import { useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { getAutoRenameUseFileContent, setAutoRenameUseFileContent } from "@/lib/settings"
import { SETTINGS_SECTION_CLASS, SETTINGS_CHECKBOX_CLASS } from "./constants"

export function AutoRenameSection() {
  const [autoRenameUseFileContent, setAutoRenameUseFileContentState] = useState(() => getAutoRenameUseFileContent())

  const handleAutoRenameUseFileContentChange = useCallback((checked: boolean) => {
    setAutoRenameUseFileContentState(checked)
    setAutoRenameUseFileContent(checked)
  }, [])

  return (
    <section className={SETTINGS_SECTION_CLASS}>
      <h2 className="text-sm font-medium">Auto Rename Context</h2>
      <label className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/70 bg-background/30 p-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 hover:border-muted-foreground/30">
        <input
          type="checkbox"
          checked={autoRenameUseFileContent}
          onChange={(e) => handleAutoRenameUseFileContentChange(e.target.checked)}
          className={cn(SETTINGS_CHECKBOX_CLASS, "mt-0.5")}
        />
        <div className="min-w-0">
          <p className="text-sm">Read file content for rename suggestions</p>
          <p className="mt-0.5 text-caption text-muted-foreground/70">
            Uses a short text preview to generate more accurate filenames.
          </p>
        </div>
      </label>
    </section>
  )
}
