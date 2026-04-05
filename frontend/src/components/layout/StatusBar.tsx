import { cn } from "@/lib/utils";
import {
  DatabaseIcon,
  CheckmarkCircle01Icon,
  AlertCircleIcon,
  Loading02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionStatus = "connected" | "disconnected" | "connecting";

interface StatusBarProps {
  connectionStatus?: ConnectionStatus;
  activeDatabase?: string | null;
  rowCount?: number | null;
  queryDuration?: number | null; // ms
  message?: string | null;
  className?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusIndicator({ status }: { status: ConnectionStatus }) {
  if (status === "connected") {
    return (
      <span className="flex items-center gap-1.5 text-emerald-500">
        <HugeiconsIcon
          icon={CheckmarkCircle01Icon}
          size={12}
          className="shrink-0"
        />
        <span>Connected</span>
      </span>
    );
  }

  if (status === "connecting") {
    return (
      <span className="flex items-center gap-1.5 text-amber-400">
        <HugeiconsIcon
          icon={Loading02Icon}
          size={12}
          className="shrink-0 animate-spin"
        />
        <span>Connecting…</span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-muted-foreground/60">
      <HugeiconsIcon icon={AlertCircleIcon} size={12} className="shrink-0" />
      <span>Disconnected</span>
    </span>
  );
}

function Divider() {
  return <span className="h-3.5 w-px bg-border/70" aria-hidden />;
}

// ---------------------------------------------------------------------------
// StatusBar
// ---------------------------------------------------------------------------

export function StatusBar({
  connectionStatus = "disconnected",
  activeDatabase = null,
  rowCount = null,
  queryDuration = null,
  message = null,
  className,
}: StatusBarProps) {
  return (
    <footer
      id="statusbar"
      className={cn(
        "flex h-6 shrink-0 items-center justify-between px-3",
        "border-t border-border/60 bg-muted/40",
        "text-[11px] text-muted-foreground",
        "select-none",
        className,
      )}
    >
      {/* Left section */}
      <div className="flex items-center gap-2.5">
        <StatusIndicator status={connectionStatus} />

        {activeDatabase && (
          <>
            <Divider />
            <span className="flex items-center gap-1">
              <HugeiconsIcon
                icon={DatabaseIcon}
                size={11}
                className="shrink-0"
              />
              <span className="font-medium">{activeDatabase}</span>
            </span>
          </>
        )}

        {message && (
          <>
            <Divider />
            <span className="truncate max-w-xs">{message}</span>
          </>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2.5">
        {rowCount !== null && (
          <>
            <span>
              {rowCount.toLocaleString()} row{rowCount !== 1 ? "s" : ""}
            </span>
            <Divider />
          </>
        )}

        {queryDuration !== null && (
          <>
            <span>
              {queryDuration < 1000
                ? `${queryDuration} ms`
                : `${(queryDuration / 1000).toFixed(2)} s`}
            </span>
            <Divider />
          </>
        )}

        <span className="text-muted-foreground/50">TableStack v0.1</span>
      </div>
    </footer>
  );
}
