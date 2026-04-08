import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { SchemaTree } from "@/components/schema-tree";
import { ConnectionDialog } from "@/components/connection";
import { QueryEditor } from "@/components/query-editor";
import { ResultPanel } from "@/components/result-panel";
import { useDBStore } from "@/store";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, DatabaseIcon } from "@hugeicons/core-free-icons";
import { Window } from "@wailsio/runtime";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

const isStartupWindowMode =
  new URLSearchParams(window.location.search).get("window") === "startup";

// ---------------------------------------------------------------------------
// Main content area logic
// ---------------------------------------------------------------------------

function MainContent({ onNewConnection }: { onNewConnection: () => void }) {
  const profilesData = useDBStore((s) => s.profiles.data);
  const profiles = profilesData ?? [];
  const hasConnections = useDBStore((s) => s.activeConnections.size > 0);
  const activeProfileId = useDBStore((s) => s.activeProfileId);

  // Still show placeholder if no connection is active
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
            <line
              x1="3"
              y1="9"
              x2="21"
              y2="9"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <line
              x1="3"
              y1="15"
              x2="21"
              y2="15"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <line
              x1="9"
              y1="9"
              x2="9"
              y2="21"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </div>
        <div className="flex flex-col items-center gap-2 text-center max-w-sm">
          <p className="text-base font-semibold text-foreground">
            Welcome to TableStack
          </p>
          <p className="text-sm text-muted-foreground/60 leading-relaxed">
            Connect to a PostgreSQL database from the sidebar or create a new
            connection profile to get started.
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
      <ResizablePanelGroup orientation="vertical">
        {/* Upper part: Query Editor */}
        <ResizablePanel defaultSize={35} minSize={10} className="bg-background">
          <QueryEditor />
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-border/60" />

        {/* Bottom part: Result Panel */}
        <ResizablePanel defaultSize={65} minSize={10} className="bg-background">
          <ResultPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------

function StartupWindow() {
  const handleClose = () => {
    void Window.Close();
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-sky-900 text-slate-100">
      <main className="relative flex h-full w-full items-center justify-center p-6">
        <div className="pointer-events-none absolute -top-20 -left-16 size-52 rounded-full bg-sky-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 size-60 rounded-full bg-cyan-200/15 blur-3xl" />

        <section className="relative w-full max-w-sm rounded-2xl border border-white/15 bg-slate-950/45 p-6 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-sky-500/20 text-sky-200 ring-1 ring-sky-300/30">
              <HugeiconsIcon icon={DatabaseIcon} size={18} />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">TableStack</h1>
              <p className="text-xs text-slate-300/80">Startup Window</p>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-slate-200/90">
            Close this window to continue and open your main workspace.
          </p>

          <div className="mt-5 flex items-center justify-end">
            <Button
              type="button"
              onClick={handleClose}
              className="gap-2 bg-sky-500 text-slate-950 hover:bg-sky-400"
            >
              <HugeiconsIcon icon={Add01Icon} size={14} className="rotate-45" />
              Close Startup
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}

function MainApp() {
  const loadProfiles = useDBStore((s) => s.loadProfiles);
  const syncActiveConnections = useDBStore((s) => s.syncActiveConnections);
  const activeProfileId = useDBStore((s) => s.activeProfileId);
  const profiles = useDBStore((s) => s.profiles.data);
  // Derive primitives — never subscribe to the Set object itself (new reference every immer update)
  const isActiveProfileConnected = useDBStore((s) =>
    Boolean(s.activeProfileId && s.activeConnections.has(s.activeProfileId)),
  );

  const [rootDialogOpen, setRootDialogOpen] = useState(false);

  const activeProfile = profiles?.find((p) => p.id === activeProfileId) ?? null;
  const connectionStatus: "connected" | "disconnected" =
    isActiveProfileConnected ? "connected" : "disconnected";

  useEffect(() => {
    loadProfiles();
    syncActiveConnections();
  }, [loadProfiles, syncActiveConnections]);

  return (
    <>
      <AppLayout
        sidebar={<SchemaTree />}
        connectionStatus={connectionStatus}
        activeDatabase={activeProfile?.database ?? null}
      >
        <MainContent onNewConnection={() => setRootDialogOpen(true)} />
      </AppLayout>

      <ConnectionDialog
        open={rootDialogOpen}
        onOpenChange={setRootDialogOpen}
      />
    </>
  );
}

function App() {
  if (isStartupWindowMode) {
    return <StartupWindow />;
  }

  return <MainApp />;
}

export default App;
