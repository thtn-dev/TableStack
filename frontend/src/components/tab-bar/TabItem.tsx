import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { TabContextMenu } from "./TabContextMenu";
import type { QueryTab } from "@/store";

interface TabItemProps {
  tab: QueryTab;
  isActive: boolean;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
}

export function TabItem({ tab, isActive, onSelect, onClose }: TabItemProps) {
  function handleMouseDown(e: React.MouseEvent) {
    // Middle-click to close
    if (e.button === 1) {
      e.preventDefault();
      onClose(tab.id);
    }
  }

  function handleClose(e: React.MouseEvent) {
    e.stopPropagation();
    onClose(tab.id);
  }

  return (
    <TabContextMenu tab={tab}>
      <div
        role="tab"
        aria-selected={isActive}
        onClick={() => onSelect(tab.id)}
        onMouseDown={handleMouseDown}
        className={cn(
          "group/tab relative flex h-full shrink-0 cursor-pointer select-none items-center gap-1.5 border-r border-border/40 px-3 text-[12px] transition-colors",
          isActive
            ? "bg-background text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-background"
            : "bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        )}
      >
        {/* Dirty indicator */}
        {tab.isDirty && (
          <span className="text-[10px] leading-none text-amber-500">●</span>
        )}

        {/* Title */}
        <span className="max-w-[120px] truncate">{tab.title}</span>

        {/* Close button */}
        <button
          type="button"
          aria-label={`Close ${tab.title}`}
          onClick={handleClose}
          className={cn(
            "ml-0.5 flex size-4 shrink-0 items-center justify-center rounded transition-colors",
            "opacity-0 group-hover/tab:opacity-100",
            isActive && "opacity-60",
            "hover:bg-muted hover:opacity-100 hover:text-foreground"
          )}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={10} />
        </button>
      </div>
    </TabContextMenu>
  );
}
