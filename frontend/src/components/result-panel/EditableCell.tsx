import { useEffect, useRef, useState, useCallback, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

// =============================================================================
// EditableCell
// =============================================================================

interface EditableCellProps {
  /** Current cell value (may be null/undefined). */
  value: unknown;
  /** Column name — used for accessibility labels. */
  column: string;
  /** Data type hint from the DB schema (e.g. "integer", "boolean", "timestamp"). */
  dataType?: string;
  /** Whether this cell is the currently active edit target. */
  isEditing: boolean;
  /** True when this cell has an uncommitted change. */
  isDirty: boolean;
  /** True when the column is a primary key (read-only, no double-click). */
  isPrimaryKey: boolean;
  /** Called when the user wants to start editing this cell. */
  onStartEdit: () => void;
  /** Called with the new value when the user confirms an edit. */
  onCommit: (newValue: unknown) => void;
  /** Called when the user cancels an edit (Escape). */
  onCancel: () => void;
}

function formatDisplay(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

function parseValueForType(raw: string, dataType?: string): unknown {
  if (raw === "") return null;
  const dt = (dataType ?? "").toLowerCase();
  if (dt.includes("int") || dt.includes("numeric") || dt.includes("float") || dt.includes("double") || dt.includes("decimal") || dt.includes("real")) {
    const n = Number(raw);
    return isNaN(n) ? raw : n;
  }
  if (dt.includes("bool")) {
    if (raw.toLowerCase() === "true") return true;
    if (raw.toLowerCase() === "false") return false;
    return raw;
  }
  return raw;
}

export function EditableCell({
  value,
  column,
  dataType,
  isEditing,
  isDirty,
  isPrimaryKey,
  onStartEdit,
  onCommit,
  onCancel,
}: EditableCellProps) {
  const [draft, setDraft] = useState(formatDisplay(value));
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-sync draft when the value prop changes (e.g. after a save or data refresh)
  useEffect(() => {
    if (!isEditing) {
      setDraft(formatDisplay(value));
    }
  }, [value, isEditing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commit = useCallback(() => {
    onCommit(parseValueForType(draft, dataType));
  }, [draft, dataType, onCommit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setDraft(formatDisplay(value));
        onCancel();
      } else if (e.key === "Tab") {
        commit();
        // Let Tab propagate so the browser moves focus naturally
      }
    },
    [commit, onCancel, value],
  );

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (isEditing) {
    const isBoolean =
      (dataType ?? "").toLowerCase().includes("bool") ||
      typeof value === "boolean";

    if (isBoolean) {
      return (
        <select
          ref={inputRef as unknown as React.RefObject<HTMLSelectElement>}
          value={draft}
          autoFocus
          className="w-full h-6 px-1 text-[11px] font-mono bg-background border border-primary/60 rounded outline-none ring-1 ring-primary/40"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); setDraft(formatDisplay(value)); onCancel(); }
            else if (e.key === "Enter") { e.preventDefault(); commit(); }
          }}
        >
          <option value="">NULL</option>
          <option value="true">TRUE</option>
          <option value="false">FALSE</option>
        </select>
      );
    }

    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        className="w-full h-6 px-1 text-[11px] font-mono bg-background border border-primary/60 rounded outline-none ring-1 ring-primary/40"
        aria-label={`Edit ${column}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />
    );
  }

  // ── Read mode ──────────────────────────────────────────────────────────────
  const isNull = value === null || value === undefined;
  const isBoolean = typeof value === "boolean";

  return (
    <div
      className={cn(
        "truncate font-mono cursor-default select-text",
        isDirty && "bg-yellow-500/15 rounded px-0.5",
        isPrimaryKey && "opacity-60",
      )}
      onDoubleClick={!isPrimaryKey ? onStartEdit : undefined}
      title={
        isPrimaryKey
          ? "Primary key columns are read-only"
          : isNull
            ? "NULL — double-click to edit"
            : `${String(value)} — double-click to edit`
      }
    >
      {isNull ? (
        <span className="text-muted-foreground/30 italic text-[11px]">NULL</span>
      ) : isBoolean ? (
        <span className="text-blue-500 font-semibold text-[11px]">
          {value ? "TRUE" : "FALSE"}
        </span>
      ) : (
        <span className="text-[12px]">{String(value)}</span>
      )}
    </div>
  );
}
