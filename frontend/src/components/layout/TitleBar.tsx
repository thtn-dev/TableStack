import { DatabaseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TitleBarProps {
  className?: string;
}

// ---------------------------------------------------------------------------
// App branding
// ---------------------------------------------------------------------------

function AppBrand() {
  return (
    <div className="flex items-center gap-2 select-none">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
        <HugeiconsIcon
          icon={DatabaseIcon}
          size={13}
          className="text-primary-foreground"
        />
      </div>
      <span className="text-[13px] font-semibold tracking-tight text-foreground/90">
        TableStack
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TitleBar
// ---------------------------------------------------------------------------

export function TitleBar({ className }: TitleBarProps) {
  return (
    <header
      id="titlebar"
      // `style={{ "--wails-draggable": "drag" } as React.CSSProperties}` makes the
      // entire bar a drag-handle in Wails. Non-interactive children should set
      // `style={{ "--wails-draggable": "no-drag" }}` if they need click events.
      style={{ "--wails-draggable": "drag" } as React.CSSProperties}
      className={cn(
        "flex h-10 shrink-0 items-center justify-between px-3",
        "border-b border-border/60 bg-background/95 backdrop-blur-sm",
        "select-none",
        className,
      )}
    >
      {/* Left: branding */}
      <div style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}>
        <AppBrand />
      </div>

      {/* Centre: draggable spacer */}
      <div className="flex-1" />
    </header>
  );
}
