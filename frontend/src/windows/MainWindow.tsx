import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { SchemaTree } from "@/components/schema-tree";
import { ConnectionDialog } from "@/components/connection";
import { QueryEditor } from "@/components/query-editor";
import { ResultPanel } from "@/components/result-panel";
import { useDBStore } from "@/store";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

interface MainContentProps {
  onNewConnection: () => void;
}

function MainContent({ onNewConnection }: MainContentProps) {
  const profilesData = useDBStore((s) => s.profiles.data);
  const profiles = profilesData ?? [];
  const hasConnections = useDBStore((s) => s.activeConnections.size > 0);
  const activeProfileId = useDBStore((s) => s.activeProfileId);

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
        <ResizablePanel defaultSize={35} minSize={10} className="bg-background">
          <QueryEditor />
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-border/60" />

        <ResizablePanel defaultSize={65} minSize={10} className="bg-background">
          <ResultPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

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

  const [rootDialogOpen, setRootDialogOpen] = useState(false);

  const activeProfile = profiles?.find((p) => p.id === activeProfileId) ?? null;
  const connectionStatus: "connected" | "disconnected" =
    isActiveProfileConnected ? "connected" : "disconnected";

  const syncFromBackend = async () => {
    await loadProfiles();
    await syncActiveConnections();
    await syncLastActiveProfile();
  };

  useEffect(() => {
    void syncFromBackend();

    const handleFocus = () => {
      void syncFromBackend();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void syncFromBackend();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadProfiles, syncActiveConnections, syncLastActiveProfile]);

  useEffect(() => {
    if (activeProfileId || !activeConnectionsKey) {
      return;
    }

    const fallbackProfileID = activeConnectionsKey.split(",").find(Boolean);
    if (!fallbackProfileID) {
      return;
    }

    setActiveProfile(fallbackProfileID);
    void loadSchemaTree(fallbackProfileID);
  }, [
    activeProfileId,
    activeConnectionsKey,
    setActiveProfile,
    loadSchemaTree,
  ]);

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
