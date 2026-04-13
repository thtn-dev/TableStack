import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  usePanelRef,
  type PanelSize,
} from "react-resizable-panels";
import { cn } from "@/lib/utils";
import { TitleBar } from "./TitleBar";
import { StatusBar, type ConnectionStatus } from "./StatusBar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppLayoutProps {
  /** Left sidebar — pass <SchemaTree /> here */
  sidebar: ReactNode;
  /** Main content area — TabBar + QueryEditor + ResultPanel */
  children: ReactNode;

  connectionStatus?: ConnectionStatus;
  activeDatabase?: string | null;
  rowCount?: number | null;
  queryDuration?: number | null;
  statusMessage?: string | null;

  className?: string;
}

// ---------------------------------------------------------------------------
// Right sidebar placeholder
// ---------------------------------------------------------------------------

function RightSidebarPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 overflow-hidden">
      <p className="text-[12px] text-muted-foreground">Coming soon</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppLayout
// ---------------------------------------------------------------------------

export function AppLayout({
  sidebar,
  children,
  connectionStatus,
  activeDatabase,
  rowCount,
  queryDuration,
  statusMessage,
  className,
}: AppLayoutProps) {
  const leftPanelRef = usePanelRef();
  const rightPanelRef = usePanelRef();

  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);

  const toggleLeftSidebar = useCallback(() => {
    const panel = leftPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [leftPanelRef]);

  const rightPanelEverOpened = useRef(false);

  const toggleRightSidebar = useCallback(() => {
    const panel = rightPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      if (!rightPanelEverOpened.current) {
        rightPanelEverOpened.current = true;
        panel.resize(200);
      } else {
        panel.expand();
      }
    } else {
      panel.collapse();
    }
  }, [rightPanelRef]);

  const handleLeftResize = useCallback((size: PanelSize) => {
    setLeftSidebarOpen(size.asPercentage > 0);
  }, []);

  const handleRightResize = useCallback((size: PanelSize) => {
    setRightSidebarOpen(size.asPercentage > 0);
  }, []);

  return (
    <div
      id="app-layout"
      className={cn(
        "h-screen w-screen overflow-hidden",
        "grid grid-rows-[auto_1fr_auto]",
        "bg-background text-foreground",
        className,
      )}
    >
      {/* ── Row 1: Title bar ── */}
      <TitleBar
        className="col-span-full"
        leftSidebarOpen={leftSidebarOpen}
        onToggleLeftSidebar={toggleLeftSidebar}
        rightSidebarOpen={rightSidebarOpen}
        onToggleRightSidebar={toggleRightSidebar}
      />

      {/* ── Row 2: Resizable panels ── */}
      <ResizablePanelGroup
        id="app-body"
        orientation="horizontal"
        className="min-h-0"
      >
        {/* Left sidebar */}
        <ResizablePanel
          panelRef={leftPanelRef}
          id="left-sidebar"
          defaultSize={240}
          minSize={32}
          maxSize={380}
          collapsible
          collapsedSize={0}
          groupResizeBehavior="preserve-pixel-size"
          onResize={handleLeftResize}
          className="bg-sidebar text-sidebar-foreground"
        >
          <aside className="flex flex-col h-full overflow-y-auto overflow-x-hidden border-r border-border/60">
            {sidebar}
          </aside>
        </ResizablePanel>

        <ResizableHandle
          className={cn(
            "w-px bg-border/60 hover:bg-primary/40 transition-colors",
            !leftSidebarOpen && "hidden",
          )}
        />

        {/* Main content */}
        <ResizablePanel
          id="main-content"
          minSize={200}
          groupResizeBehavior="preserve-pixel-size"
        >
          <main className="flex flex-col h-full overflow-hidden bg-background">
            {children}
          </main>
        </ResizablePanel>

        <ResizableHandle
          className={cn(
            "w-px bg-border/60 hover:bg-primary/40 transition-colors",
            !rightSidebarOpen && "hidden",
          )}
        />

        {/* Right sidebar */}
        <ResizablePanel
          panelRef={rightPanelRef}
          id="right-sidebar"
          defaultSize={0}
          minSize={32}
          maxSize={480}
          collapsible
          collapsedSize={0}
          groupResizeBehavior="preserve-pixel-size"
          onResize={handleRightResize}
          className="bg-sidebar text-sidebar-foreground border-l border-border/60"
        >
          <RightSidebarPlaceholder />
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* ── Row 3: Status bar ── */}
      <StatusBar
        connectionStatus={connectionStatus}
        activeDatabase={activeDatabase}
        rowCount={rowCount}
        queryDuration={queryDuration}
        message={statusMessage}
        className="col-span-full"
      />
    </div>
  );
}
