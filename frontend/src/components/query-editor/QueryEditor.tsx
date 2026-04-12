import { useRef, useCallback, useEffect, useMemo } from "react";
import CodeMirror, { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { sql, PostgreSQL } from "@codemirror/lang-sql";
import { githubLight } from '@uiw/codemirror-theme-github';
import { androidstudio } from '@uiw/codemirror-theme-androidstudio';
import { keymap, EditorView } from "@codemirror/view";
import { Prec } from "@codemirror/state";

import { useDBStore, selectFullSchema, selectDialectInfo, selectSchemaFetching } from "@/store";
import { useThemeStore } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import type { CursorPos } from "@/store";
import { buildCompletionExtension } from "./completionSource";

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
  tabId,
  content,
  initialCursor,
  onContentChange,
  onCursorChange,
}: QueryEditorProps) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  // Stable ref for run handler — avoids recreating extensions on every render
  const handleRunRef = useRef<() => void>(() => {});

  const activeProfileId = useDBStore((s) => s.activeProfileId);
  const queryStatus = useDBStore((s) => s.queryResults[tabId]?.status ?? "idle");
  const executeQuery = useDBStore((s) => s.executeQuery);
  const schema = useDBStore(selectFullSchema(activeProfileId));
  const dialect = useDBStore(selectDialectInfo(activeProfileId));
  const theme = useThemeStore((s) => s.theme);

  // ── Run handler (Mod+Enter shortcut) ─────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (!activeProfileId || !content.trim() || queryStatus === "loading") return;
    await executeQuery(activeProfileId, content, tabId);
  }, [activeProfileId, content, queryStatus, executeQuery, tabId]);

  useEffect(() => {
    handleRunRef.current = handleRun;
  }, [handleRun]);
  // ── Cursor update listener ────────────────────────────────────────────────
  const cursorUpdateListener = useMemo(
    () =>
      EditorView.updateListener.of((update) => {
        if (update.selectionSet) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          onCursorChange({ line: line.number - 1, column: pos - line.from });
        }
      }),
    // onCursorChange is stable (store action ref)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Schema-aware completion extension — rebuilt when schema/dialect changes
  const completionExt = useMemo(
    () => buildCompletionExtension(schema, dialect),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schema, dialect]
  );

  // Extensions — static parts created once; completionExt rebuilt on schema change
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
      completionExt,
    ],
    [cursorUpdateListener, completionExt]
  );

  return (
    <div className="flex h-full flex-col bg-background">
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
            autocompletion: false,
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
