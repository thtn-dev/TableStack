import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useEditorStore } from "@/store";
import type { QueryTab } from "@/store";

interface TabContextMenuProps {
  tab: QueryTab;
  children: React.ReactNode;
}

export function TabContextMenu({ tab, children }: TabContextMenuProps) {
  const closeTab = useEditorStore((s) => s.closeTab);
  const tabs = useEditorStore((s) => s.tabs);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const saveActiveTab = useEditorStore((s) => s.saveActiveTab);

  function closeOthers() {
    tabs.filter((t) => t.id !== tab.id).forEach((t) => closeTab(t.id));
    setActiveTab(tab.id);
  }

  function closeAll() {
    tabs.forEach((t) => closeTab(t.id));
  }

  function closeToRight() {
    const idx = tabs.findIndex((t) => t.id === tab.id);
    tabs.slice(idx + 1).forEach((t) => closeTab(t.id));
  }

  function copyPath() {
    if (tab.filePath) navigator.clipboard.writeText(tab.filePath);
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => closeTab(tab.id)}>
          Close
        </ContextMenuItem>
        <ContextMenuItem onClick={closeOthers} disabled={tabs.length <= 1}>
          Close Others
        </ContextMenuItem>
        <ContextMenuItem onClick={closeAll}>Close All</ContextMenuItem>
        <ContextMenuItem
          onClick={closeToRight}
          disabled={tabs.findIndex((t) => t.id === tab.id) >= tabs.length - 1}
        >
          Close to the Right
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          onClick={() => {
            setActiveTab(tab.id);
            saveActiveTab(false);
          }}
        >
          Save
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            setActiveTab(tab.id);
            saveActiveTab(true);
          }}
        >
          Save As…
        </ContextMenuItem>

        {tab.filePath && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={copyPath}>Copy Path</ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
