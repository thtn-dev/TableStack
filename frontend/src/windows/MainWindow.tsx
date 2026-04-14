import { useEffect, useRef, useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { SchemaTree } from "@/components/schema-tree";
import { ProfileSidebar } from "@/components/profile-sidebar/ProfileSidebar";
import { ConnectionDialog } from "@/components/connection";
import { QueryEditor } from "@/components/query-editor";
import { ResultPanel } from "@/components/result-panel";
import { TabBar } from "@/components/tab-bar";
import { useDBStore } from "@/store";
import { useEditorStore, selectActiveTab, useAutoSave } from "@/store";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  PlayIcon,
  EraserIcon,
  Copy01Icon,
  Tick01Icon,
  SourceCodeIcon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  GetLastConnection,
  LoadSession,
  SaveLastConnection,
} from "../../bindings/github.com/thtn-dev/table_stack/app";

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
  return result.split("\n").map((l) => l.trimStart()).filter(Boolean).join("\n").trim();
}

// =============================================================================
// QueryToolbar — Run / Clear / Copy / Format bar rendered above the tab strip
// =============================================================================

function QueryToolbar() {
  const activeTab = useEditorStore(selectActiveTab);
  const updateContent = useEditorStore((s) => s.updateContent);
  const activeProfileId = useDBStore((s) => s.activeProfileId);
  const queryStatus = useDBStore((s) =>
    activeTab ? (s.queryResults[activeTab.id]?.status ?? "idle") : "idle"
  );
  const executeQuery = useDBStore((s) => s.executeQuery);

  const [copied, setCopied] = useState(false);

  const content = activeTab?.content ?? "";
  const tabId = activeTab?.id ?? "";

  const handleRun = useCallback(async () => {
    if (!activeProfileId || queryStatus === "loading") return;

    const { activeTabId, tabs } = useEditorStore.getState();
    if (!activeTabId) return;

    const latestTab = tabs.find((t) => t.id === activeTabId);
    const latestContent = latestTab?.content ?? "";
    if (!latestContent.trim()) return;

    await executeQuery(activeProfileId, latestContent, activeTabId);
  }, [activeProfileId, queryStatus, executeQuery]);

  const handleClear = useCallback(() => {
    if (tabId) updateContent(tabId, "");
  }, [tabId, updateContent]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const handleFormat = useCallback(() => {
    if (tabId) updateContent(tabId, formatSQL(content));
  }, [tabId, content, updateContent]);

  const cursorLine = (activeTab?.cursorPos?.line ?? 0) + 1;
  const cursorCol = (activeTab?.cursorPos?.column ?? 0) + 1;

  return (
    <div className="flex h-10 shrink-0 items-center justify-between px-3 border-b border-border/40 bg-muted/20">
      <div className="flex items-center gap-1.5">
        {/* Run */}
        <Button
          size="sm"
          onClick={handleRun}
          disabled={!activeProfileId || !content.trim() || queryStatus === "loading" || !tabId}
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
              type="button"
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
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              disabled={!content}
              className="size-7 text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <HugeiconsIcon icon={copied ? Tick01Icon : Copy01Icon} size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{copied ? "Copied!" : "Copy SQL"}</TooltipContent>
        </Tooltip>

        {/* Format */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
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

      {/* Right: cursor + shortcut hint */}
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
  );
}

// =============================================================================
// MainContent — editor + tab bar area
// =============================================================================

interface MainContentProps {
  onNewConnection: () => void;
}

function MainContent({ onNewConnection }: MainContentProps) {
  const profilesData = useDBStore((s) => s.profiles.data);
  const profiles = profilesData ?? [];
  const hasConnections = useDBStore((s) => s.activeConnections.size > 0);
  const activeProfileId = useDBStore((s) => s.activeProfileId);

  const activeTab = useEditorStore(selectActiveTab);
  const updateContent = useEditorStore((s) => s.updateContent);
  const updateCursor = useEditorStore((s) => s.updateCursor);

  if (!activeProfileId && !hasConnections) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground p-8 animate-in fade-in duration-500">
        <div className="relative">
          <div className="absolute inset-0 blur-3xl bg-primary/10 rounded-full" />
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            className="relative opacity-20 text-primary"
          >
            <rect
              x="3"
              y="3"
              width="18"
              height="18"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="1.5" />
            <line x1="3" y1="15" x2="21" y2="15" stroke="currentColor" strokeWidth="1.5" />
            <line x1="9" y1="9" x2="9" y2="21" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
        <div className="flex flex-col items-center gap-2 text-center max-w-sm">
          <p className="text-base font-semibold text-foreground">
            Welcome to TableStack
          </p>
          <p className="text-sm text-muted-foreground/60 leading-relaxed">
            Connect to a database from the sidebar or create a new connection profile to get started.
          </p>
          {profiles.length === 0 && (
            <Button
              onClick={onNewConnection}
              className="mt-4 gap-2 px-6"
              id="btn-new-connection-main"
            >
              <HugeiconsIcon icon={Add01Icon} size={16} />
              New Connection
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-muted/10 animate-in fade-in slide-in-from-right-4 duration-500">
      {/* Toolbar: Run / Clear / Copy / Format */}
      <QueryToolbar />
      {/* Tab strip */}
      <TabBar />

      <ResizablePanelGroup orientation="vertical" className="flex-1 overflow-hidden">
        <ResizablePanel defaultSize={35} minSize={10} className="bg-background">
          {activeTab ? (
            <QueryEditor
              key={activeTab.id}
              tabId={activeTab.id}
              content={activeTab.content}
              initialCursor={activeTab.cursorPos}
              onContentChange={(c) => updateContent(activeTab.id, c)}
              onCursorChange={(cur) => updateCursor(activeTab.id, cur)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground/50">
              No tabs open — press Ctrl+N to create one
            </div>
          )}
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-border/60" />

        <ResizablePanel defaultSize={65} minSize={10} className="bg-background">
          <ResultPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

// =============================================================================
// MainWindow — lifecycle, keyboard shortcuts, session management
// =============================================================================

export function MainWindow() {
  const loadProfiles = useDBStore((s) => s.loadProfiles);
  const syncActiveConnections = useDBStore((s) => s.syncActiveConnections);
  const syncLastActiveProfile = useDBStore((s) => s.syncLastActiveProfile);
  const loadSchemaTree = useDBStore((s) => s.loadSchemaTree);
  const setActiveProfile = useDBStore((s) => s.setActiveProfile);
  const activeProfileId = useDBStore((s) => s.activeProfileId);
  const activeConnectionsKey = useDBStore((s) =>
    [...s.activeConnections].sort().join(","),
  );
  const profiles = useDBStore((s) => s.profiles.data);
  const isActiveProfileConnected = useDBStore((s) =>
    Boolean(s.activeProfileId && s.activeConnections.has(s.activeProfileId)),
  );

  const loadSession = useEditorStore((s) => s.loadSession);
  const addTab = useEditorStore((s) => s.addTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const openFileTab = useEditorStore((s) => s.openFileTab);
  const saveActiveTab = useEditorStore((s) => s.saveActiveTab);
  const flushSession = useEditorStore((s) => s.flushSession);
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);

  const [rootDialogOpen, setRootDialogOpen] = useState(false);

  const activeProfile = profiles?.find((p) => p.id === activeProfileId) ?? null;
  const connectionStatus: "connected" | "disconnected" = isActiveProfileConnected
    ? "connected"
    : "disconnected";

  // ── Auto-save (debounced 2s) ──────────────────────────────────────────────
  useAutoSave(2000);

  // ── Initial sync from backend ─────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      await loadProfiles();
      await syncActiveConnections();
      await syncLastActiveProfile();
      // Load last session
      const connID = await GetLastConnection();
      if (connID) {
        const sess = await LoadSession(connID);
        if (sess) loadSession(sess);
      }
    }
    void init();
  // Run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fallback: set active profile if none selected ─────────────────────────
  useEffect(() => {
    if (activeProfileId || !activeConnectionsKey) return;
    const fallbackProfileID = activeConnectionsKey.split(",").find(Boolean);
    if (!fallbackProfileID) return;
    setActiveProfile(fallbackProfileID);
    void loadSchemaTree(fallbackProfileID);
  }, [activeProfileId, activeConnectionsKey, setActiveProfile, loadSchemaTree]);

  // ── Load session when active profile changes ──────────────────────────────
  const prevProfileIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeProfileId) return;
    if (activeProfileId === prevProfileIdRef.current) return;
    prevProfileIdRef.current = activeProfileId;

    async function switchSession() {
      // Flush current session before switching
      await flushSession();
      const sess = await LoadSession(activeProfileId!);
      if (sess) loadSession(sess);
      await SaveLastConnection(activeProfileId!);
    }
    void switchSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfileId]);

  // ── Flush session on page unload ──────────────────────────────────────────
  useEffect(() => {
    function handleBeforeUnload() {
      void flushSession();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [flushSession]);

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      switch (true) {
        case e.key === "n" && !e.shiftKey: {
          e.preventDefault();
          addTab();
          break;
        }
        case e.key === "o" && !e.shiftKey: {
          e.preventDefault();
          void openFileTab();
          break;
        }
        case e.key === "s" && !e.shiftKey: {
          e.preventDefault();
          void saveActiveTab(false);
          break;
        }
        case e.key === "S" && e.shiftKey: {
          e.preventDefault();
          void saveActiveTab(true);
          break;
        }
        case e.key === "w" && !e.shiftKey: {
          e.preventDefault();
          if (activeTabId) closeTab(activeTabId);
          break;
        }
        case e.key === "Tab" && !e.shiftKey: {
          e.preventDefault();
          if (tabs.length < 2) break;
          const idx = tabs.findIndex((t) => t.id === activeTabId);
          setActiveTab(tabs[(idx + 1) % tabs.length].id);
          break;
        }
        case e.key === "Tab" && e.shiftKey: {
          e.preventDefault();
          if (tabs.length < 2) break;
          const idx = tabs.findIndex((t) => t.id === activeTabId);
          setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length].id);
          break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addTab, openFileTab, saveActiveTab, closeTab, setActiveTab, tabs, activeTabId]);

  return (
    <>
      <AppLayout
        profileSidebar={<ProfileSidebar />}
        sidebar={<SchemaTree />}
        connectionStatus={connectionStatus}
        activeDatabase={activeProfile?.database ?? null}
      >
        <MainContent onNewConnection={() => setRootDialogOpen(true)} />
      </AppLayout>

      <ConnectionDialog open={rootDialogOpen} onOpenChange={setRootDialogOpen} />
    </>
  );
}
