import { BubbleChatIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function ChatTab() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-10">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <HugeiconsIcon icon={BubbleChatIcon} size={22} className="text-muted-foreground" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-[13px] font-medium text-foreground">Chat settings</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Coming soon</p>
      </div>
    </div>
  );
}
