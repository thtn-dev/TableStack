import { useState } from "react";
import { PaintBoardIcon, BubbleChatIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThemeTab } from "./tabs/ThemeTab";
import { ChatTab } from "./tabs/ChatTab";

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type TabId = "theme" | "chat";

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  content: React.ReactNode;
}

const TABS: TabDef[] = [
  {
    id: "theme",
    label: "Theme",
    icon: PaintBoardIcon,
    content: <ThemeTab />,
  },
  {
    id: "chat",
    label: "Chat",
    icon: BubbleChatIcon,
    content: <ChatTab />,
  },
];

// ---------------------------------------------------------------------------
// SettingsDialog
// ---------------------------------------------------------------------------

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>("theme");
  const current = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-175 p-0 gap-0 overflow-hidden rounded-sm">
        <div className="flex h-105">
          {/* ── Left: tab navigation ── */}
          <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-border/60 bg-muted/30 p-2">
            <DialogHeader className="px-2 pt-1 pb-3">
              <DialogTitle className="text-[13px] font-semibold text-foreground/70 tracking-wide uppercase">
                Settings
              </DialogTitle>
            </DialogHeader>

            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors",
                  activeTab === tab.id
                    ? "bg-background text-foreground font-medium shadow-sm border border-border/60"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                )}
              >
                <HugeiconsIcon icon={tab.icon} size={15} strokeWidth={1.5} />
                {tab.label}
              </button>
            ))}
          </nav>

          {/* ── Right: tab content ── */}
          <div className="flex-1 overflow-y-auto p-5">
            {current.content}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
