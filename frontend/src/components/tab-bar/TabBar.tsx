import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";

import { useEditorStore } from "@/store";
import { TabItem } from "./TabItem";

export function TabBar() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const addTab = useEditorStore((s) => s.addTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);

  return (
    <div
      role="tablist"
      aria-label="Query tabs"
      className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border/40 bg-muted/20 [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: "none" }}
    >
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onSelect={setActiveTab}
          onClose={closeTab}
        />
      ))}

      {/* New tab button */}
      <button
        type="button"
        aria-label="New tab"
        onClick={() => addTab()}
        className="flex shrink-0 items-center justify-center px-2.5 text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <HugeiconsIcon icon={Add01Icon} size={14} />
      </button>
    </div>
  );
}
