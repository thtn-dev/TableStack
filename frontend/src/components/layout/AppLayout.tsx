import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TitleBar } from "./TitleBar";
import { StatusBar, type ConnectionStatus } from "./StatusBar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppLayoutProps {
  /** Left sidebar — pass <SchemaTree /> here */
  sidebar: ReactNode;
  /** Main content area — TabBar + QueryEditor + ResultPanel */
  children: ReactNode;

  // StatusBar props forwarded from global state
  connectionStatus?: ConnectionStatus;
  activeDatabase?: string | null;
  rowCount?: number | null;
  queryDuration?: number | null;
  statusMessage?: string | null;

  className?: string;
}

// ---------------------------------------------------------------------------
// AppLayout
//
// Grid:
//   [TitleBar]          ← spans full width (col 1-2)
//   [Sidebar | Main]    ← sidebar fixed 260px, main flexible
//   [StatusBar]         ← spans full width (col 1-2)
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
  return (
    <div
      id="app-layout"
      className={cn(
        // Full viewport, no overflow leak
        "h-screen w-screen overflow-hidden",
        // Three-row grid: title / content / status
        "grid grid-rows-[auto_1fr_auto]",
        "bg-background text-foreground",
        className
      )}
    >
      {/* ── Row 1: Title bar ── */}
      <TitleBar className="col-span-full" />

      {/* ── Row 2: Sidebar + Main ── */}
      <div
        id="app-body"
        className="grid min-h-0 overflow-hidden"
        style={{
          gridTemplateColumns: "260px 1fr",
        }}
      >
        {/* Sidebar */}
        <aside
          id="app-sidebar"
          className={cn(
            "flex flex-col min-h-0 overflow-y-auto overflow-x-hidden",
            "border-r border-border/60",
            "bg-sidebar text-sidebar-foreground"
          )}
        >
          {sidebar}
        </aside>

        {/* Main content */}
        <main
          id="app-main"
          className="flex flex-col min-h-0 overflow-hidden bg-background"
        >
          {children}
        </main>
      </div>

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
