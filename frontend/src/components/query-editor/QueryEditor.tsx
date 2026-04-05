import { useState, useRef, useCallback, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlayIcon,
  EraserIcon,
  Copy01Icon,
  Tick01Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";

import { useDBStore } from "@/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// =============================================================================
// QueryEditor Component
// =============================================================================

export function QueryEditor() {
  const [sql, setSql] = useState("SELECT * FROM pg_catalog.pg_tables LIMIT 10;");
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeProfileId = useDBStore((s) => s.activeProfileId);
  const selectedTable = useDBStore((s) => s.selectedTable);
  const queryStatus = useDBStore((s) => s.queryResult.status);
  const executeQuery = useDBStore((s) => s.executeQuery);

  // Auto-generate SQL when a table is selected
  useEffect(() => {
    if (selectedTable) {
      setSql(`SELECT * FROM "${selectedTable.schema}"."${selectedTable.table}" LIMIT 100;`);
    }
  }, [selectedTable]);

  const handleRun = useCallback(async () => {
    if (!activeProfileId || !sql.trim() || queryStatus === "loading") return;
    await executeQuery(activeProfileId, sql);
  }, [activeProfileId, sql, queryStatus, executeQuery]);

  const handleClear = () => setSql("");

  const handleCopy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Handlers ───────────────────────────────────────────────────────────────

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 1. Tab Indentation
    if (e.key === "Tab") {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const value = e.currentTarget.value;

      setSql(value.substring(0, start) + "\t" + value.substring(end));

      // Reset cursor position after state update
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 1;
        }
      }, 0);
    }

    // 2. Ctrl + Enter to Run
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleRun();
    }
  };

  return (
    <div className="flex h-full flex-col bg-background border-b border-border/40">
      {/* ── Toolbar ── */}
      <div className="flex h-10 shrink-0 items-center justify-between px-3 border-b border-border/40 bg-muted/20">
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            onClick={handleRun}
            disabled={!activeProfileId || !sql.trim() || queryStatus === "loading"}
            className="h-7.5 gap-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          >
            {queryStatus === "loading" ? (
              <Spinner className="size-3.5 border-white/30" />
            ) : (
              <HugeiconsIcon icon={PlayIcon} size={14} fill="currentColor" />
            )}
            Run
          </Button>

          <div className="h-4 w-px bg-border/60 mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClear}
                className="size-7.5 text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <HugeiconsIcon icon={EraserIcon} size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Clear Editor</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopy}
                className="size-7.5 text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <HugeiconsIcon icon={copied ? Tick01Icon : Copy01Icon} size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{copied ? "Copied!" : "Copy SQL"}</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-2">
          {!activeProfileId && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-[11px] text-amber-600 dark:text-amber-500">
              <HugeiconsIcon icon={InformationCircleIcon} size={12} />
              Connect to run queries
            </div>
          )}
          <span className="text-[11px] text-muted-foreground/60 font-mono">
            Ctrl + Enter
          </span>
        </div>
      </div>

      {/* ── Editor ── */}
      <div className="relative flex-1 group">
        <textarea
          ref={textareaRef}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoFocus
          className={cn(
            "h-full w-full resize-none bg-transparent p-4 outline-none",
            "font-mono text-[13px] leading-relaxed subpixel-antialiased",
            "placeholder:text-muted-foreground/30",
            !activeProfileId && "opacity-50"
          )}
          placeholder="-- Write your SQL here...
SELECT * FROM users;"
        />

        {/* Gutter / UI elements could go here in future */}
      </div>
    </div>
  );
}
