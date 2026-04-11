import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import CodeMirror, { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { sql, PostgreSQL } from "@codemirror/lang-sql";
import { githubLight } from '@uiw/codemirror-theme-github';
import { androidstudio } from '@uiw/codemirror-theme-androidstudio';
import { keymap, EditorView } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlayIcon,
  EraserIcon,
  Copy01Icon,
  Tick01Icon,
  InformationCircleIcon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons";

import { useDBStore } from "@/store";
import { useThemeStore } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CursorPos } from "@/store";

// =============================================================================
// Helpers
// =============================================================================

function formatSQL(input: string): string {
  const clauses = [
    "SELECT", "FROM", "WHERE", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN",
    "FULL JOIN", "CROSS JOIN", "JOIN", "GROUP BY", "ORDER BY", "HAVING",
    "LIMIT", "OFFSET", "UNION ALL", "UNION", "INSERT INTO", "VALUES",
    "UPDATE", "SET", "DELETE FROM", "WITH",
  ];
  let result = input;
  clauses.forEach((kw) => {
    result = result.replace(new RegExp(`\\b${kw}\\b`, "gi"), `\n${kw}`);
  });
  return result
    .split("\n")
    .map((line) => line.trimStart())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

// =============================================================================
// Static theme — defined at module level, NEVER recreated
// =============================================================================
const staticTheme = EditorView.theme({
  "&": {
    fontSize: "13px",
    fontFamily: 'var(--font-mono, "JetBrains Mono", "Fira Code", monospace)',
    height: "100%",
  },
  ".cm-scroller": {
    overflow: "auto",
    lineHeight: "1.6",
    fontFamily: "inherit",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "1px solid hsl(var(--border) / 0.4)",
    color: "hsl(var(--muted-foreground) / 0.4)",
    minWidth: "40px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "hsl(var(--muted) / 0.5)",
  },
  ".cm-activeLine": {
    backgroundColor: "hsl(var(--muted) / 0.25)",
  },
  ".cm-focused .cm-cursor": {
    borderLeftColor: "hsl(var(--foreground))",
  },
  ".cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "rgba(59, 130, 246, 0.3) !important",
  },
  ".cm-tooltip-autocomplete": {
    border: "1px solid hsl(var(--border))",
    borderRadius: "6px",
    backgroundColor: "hsl(var(--popover))",
    color: "hsl(var(--popover-foreground))",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "hsl(var(--accent))",
    color: "hsl(var(--accent-foreground))",
  },
  ".cm-editor.cm-focused": {
    outline: "none",
  },
});

// =============================================================================
// QueryEditor Component — controlled by parent via props
// =============================================================================

interface QueryEditorProps {
  /** ID of the active tab — used as React key to remount editor on tab switch. */
  tabId: string;
  /** Current SQL content driven by the parent (EditorStore). */
  content: string;
  /** Initial cursor position restored when the tab is activated. */
  initialCursor?: CursorPos;
  onContentChange: (content: string) => void;
  onCursorChange: (cursor: CursorPos) => void;
}

export function QueryEditor({
  tabId: _tabId,
  content,
  initialCursor,
  onContentChange,
  onCursorChange,
}: QueryEditorProps) {
  const [copied, setCopied] = useState(false);
  const [cursorLine, setCursorLine] = useState((initialCursor?.line ?? 0) + 1);
  const [cursorCol, setCursorCol] = useState((initialCursor?.column ?? 0) + 1);

  const editorRef = useRef<ReactCodeMirrorRef>(null);

  // Stable ref for run handler — avoids recreating extensions on every render
  const handleRunRef = useRef<() => void>(() => {});

  const activeProfileId = useDBStore((s) => s.activeProfileId);
  const selectedTable = useDBStore((s) => s.selectedTable);
  const queryStatus = useDBStore((s) => s.queryResult.status);
  const executeQuery = useDBStore((s) => s.executeQuery);
  const theme = useThemeStore((s) => s.theme);

  // ── Auto-generate SELECT when a table node is clicked ─────────────────────
  useEffect(() => {
    if (!selectedTable) return;
    const newSql = `SELECT *\nFROM "${selectedTable.schema}"."${selectedTable.table}"\nLIMIT 100;`;
    onContentChange(newSql);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable]);

  // ── Run handler ───────────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (!activeProfileId || !content.trim() || queryStatus === "loading") return;
    await executeQuery(activeProfileId, content);
  }, [activeProfileId, content, queryStatus, executeQuery]);

  useEffect(() => {
    handleRunRef.current = handleRun;
  }, [handleRun]);

  // ── Toolbar actions ───────────────────────────────────────────────────────
  const handleClear = useCallback(() => onContentChange(""), [onContentChange]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const handleFormat = useCallback(() => {
    onContentChange(formatSQL(content));
  }, [content, onContentChange]);

  // ── Cursor update listener ────────────────────────────────────────────────
  const cursorUpdateListener = useMemo(
    () =>
      EditorView.updateListener.of((update) => {
        if (update.selectionSet) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          const newLine = line.number;
          const newCol = pos - line.from + 1;
          setCursorLine(newLine);
          setCursorCol(newCol);
          onCursorChange({ line: newLine - 1, column: newCol - 1 });
        }
      }),
    // onCursorChange is stable (store action ref)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Extensions created once per tab mount (tabId used as key in parent)
  const extensions = useMemo(
    () => [
      sql({ dialect: PostgreSQL }),
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              handleRunRef.current();
              return true;
            },
          },
        ])
      ),
      cursorUpdateListener,
      staticTheme,
    ],
    [cursorUpdateListener]
  );

  return (
    <div className="flex h-full flex-col bg-background">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex h-10 shrink-0 items-center justify-between px-3 border-b border-border/40 bg-muted/20">
        <div className="flex items-center gap-1.5">
          {/* Run */}
          <Button
            size="sm"
            onClick={handleRun}
            disabled={!activeProfileId || !content.trim() || queryStatus === "loading"}
            className="h-7 gap-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs"
          >
            {queryStatus === "loading" ? (
              <Spinner className="size-3 border-white/30" />
            ) : (
              <HugeiconsIcon icon={PlayIcon} size={13} fill="currentColor" />
            )}
            Run
          </Button>

          <div className="h-4 w-px bg-border/60 mx-0.5" />

          {/* Clear */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClear}
                disabled={!content}
                className="size-7 text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <HugeiconsIcon icon={EraserIcon} size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Clear</TooltipContent>
          </Tooltip>

          {/* Copy */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopy}
                disabled={!content}
                className="size-7 text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <HugeiconsIcon icon={copied ? Tick01Icon : Copy01Icon} size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {copied ? "Copied!" : "Copy SQL"}
            </TooltipContent>
          </Tooltip>

          {/* Format */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleFormat}
                disabled={!content.trim()}
                className="size-7 text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <HugeiconsIcon icon={SourceCodeIcon} size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Format SQL</TooltipContent>
          </Tooltip>
        </div>

        {/* Right: status indicators */}
        <div className="flex items-center gap-2">
          {!activeProfileId && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[11px] text-amber-600 dark:text-amber-500">
              <HugeiconsIcon icon={InformationCircleIcon} size={11} />
              Connect to run queries
            </div>
          )}

          <span className="text-[11px] font-mono text-muted-foreground/50 tabular-nums">
            Ln {cursorLine}, Col {cursorCol}
          </span>

          <div className="h-3 w-px bg-border/60" />

          <span className="text-[11px] text-muted-foreground/50 font-mono">
            Ctrl+Enter
          </span>
        </div>
      </div>

      {/* ── CodeMirror editor ─────────────────────────────────────────────── */}
      <div
        className={cn(
          "relative flex-1 overflow-hidden",
          !activeProfileId && "opacity-60 pointer-events-none"
        )}
      >
        <CodeMirror
          ref={editorRef}
          value={content}
          height="100%"
          extensions={extensions}
          onChange={onContentChange}
          theme={theme === "dark" ? androidstudio : githubLight}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            autocompletion: true,
            foldGutter: false,
            indentOnInput: true,
            bracketMatching: true,
            closeBrackets: true,
            searchKeymap: false,
          }}
          className="h-full"
        />
      </div>
    </div>
  );
}
