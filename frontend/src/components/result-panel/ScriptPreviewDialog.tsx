import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick01Icon, Copy01Icon } from "@hugeicons/core-free-icons";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// =============================================================================
// ScriptPreviewDialog
// =============================================================================

interface ScriptPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** SQL preview for UPDATE statements (dirty rows). Omit when not applicable. */
  updateSQL?: string;
  /** SQL preview for DELETE statements (selected rows). Omit when not applicable. */
  deleteSQL?: string;
  schema: string;
  table: string;
}

type Tab = "update" | "delete";

export function ScriptPreviewDialog({
  open,
  onOpenChange,
  updateSQL,
  deleteSQL,
  schema,
  table,
}: ScriptPreviewDialogProps) {
  const hasUpdate = !!updateSQL;
  const hasDelete = !!deleteSQL;

  const defaultTab: Tab = hasUpdate ? "update" : "delete";
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [copied, setCopied] = useState(false);

  const currentSQL = activeTab === "update" ? updateSQL : deleteSQL;

  function handleCopy() {
    if (!currentSQL) return;
    void navigator.clipboard.writeText(currentSQL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const tableLabel = schema ? `${schema}.${table}` : table;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle>Generated SQL Script</DialogTitle>
          <DialogDescription>
            Preview the SQL that will be executed on{" "}
            <code className="font-mono text-foreground">{tableLabel}</code>.
            This script is for reference only — execution uses parameterised queries.
          </DialogDescription>
        </DialogHeader>

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        {hasUpdate && hasDelete && (
          <div className="flex gap-1 border-b border-border/50 -mt-1">
            <TabButton
              active={activeTab === "update"}
              onClick={() => setActiveTab("update")}
            >
              UPDATE
            </TabButton>
            <TabButton
              active={activeTab === "delete"}
              onClick={() => setActiveTab("delete")}
            >
              DELETE
            </TabButton>
          </div>
        )}

        {/* ── SQL block ────────────────────────────────────────────────────── */}
        <div className="relative rounded-md border border-border/50 bg-muted/30 overflow-hidden">
          <div className="absolute right-2 top-2 z-10">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px] gap-1 text-muted-foreground"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <HugeiconsIcon icon={Tick01Icon} size={11} />
                  Copied
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={Copy01Icon} size={11} />
                  Copy
                </>
              )}
            </Button>
          </div>
          <pre className="text-[12px] font-mono text-foreground/80 leading-relaxed overflow-auto p-4 pr-16 max-h-96 whitespace-pre-wrap break-all">
            {currentSQL || <span className="text-muted-foreground/40 italic">No script generated.</span>}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// TabButton
// =============================================================================

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-[11px] font-semibold tracking-wide border-b-2 transition-colors select-none",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
