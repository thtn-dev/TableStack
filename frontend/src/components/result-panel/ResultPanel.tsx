import {
  useRef,
  useMemo,
  useCallback,
  useState,
  useEffect,
} from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  DatabaseIcon,
  Tick01Icon,
  Clock01Icon,
  Layers01Icon,
  FloppyDiskIcon,
  Cancel01Icon,
  InformationCircleIcon,
  Alert02Icon,
  SourceCodeSquareIcon,
} from "@hugeicons/core-free-icons";

import { useDBStore, useEditorStore, toTableCacheKey } from "@/store";
import type { DirtyRow } from "@/types/mutation";
import {
  useMutationStore,
  selectHasDirty,
  selectSelectedCount,
  selectFocusedRowKey,
  buildRowKey,
} from "@/store/mutationStore";
import { extractPrimaryKeys } from "@/types/mutation";
import type { QueryResult, AsyncState } from "@/store/types";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { EditableCell } from "./EditableCell";
import { ScriptPreviewDialog } from "./ScriptPreviewDialog";
import { generateUpdatePreview, generateDeletePreview } from "@/lib/sql-preview";
import { toast } from "sonner";

// Stable fallback — never recreated, so Zustand selector won't infinite-loop.
const IDLE_STATE: AsyncState<QueryResult> = { status: "idle", data: null, error: null };

// =============================================================================
// ResultPanel
// =============================================================================

export function ResultPanel() {
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const resultState = useDBStore((s) =>
    activeTabId ? (s.queryResults[activeTabId] ?? IDLE_STATE) : IDLE_STATE
  );
  const selectedTable = useDBStore((s) => s.selectedTable);
  const activeProfileId = useDBStore((s) => s.activeProfileId);
  const columnCache = useDBStore((s) => s.columnCache);
  const { data, status, error } = resultState;

  // Derive PK + metadata columns from column cache when a table is selected
  const pkColumns = useMemo(() => {
    if (!selectedTable) return [];
    const key = toTableCacheKey(selectedTable);
    const cols = columnCache[key]?.data ?? [];
    return cols.filter((c) => c.isPrimaryKey).map((c) => c.name);
  }, [selectedTable, columnCache]);

  const columnDataTypes = useMemo(() => {
    if (!selectedTable) return {} as Record<string, string>;
    const key = toTableCacheKey(selectedTable);
    const cols = columnCache[key]?.data ?? [];
    return Object.fromEntries(cols.map((c) => [c.name, c.dataType]));
  }, [selectedTable, columnCache]);

  const columnIsGenerated = useMemo(() => {
    if (!selectedTable) return {} as Record<string, boolean>;
    const key = toTableCacheKey(selectedTable);
    const cols = columnCache[key]?.data ?? [];
    return Object.fromEntries(cols.map((c) => [c.name, c.isGenerated ?? false]));
  }, [selectedTable, columnCache]);

  const columnIsNullable = useMemo(() => {
    if (!selectedTable) return {} as Record<string, boolean>;
    const key = toTableCacheKey(selectedTable);
    const cols = columnCache[key]?.data ?? [];
    return Object.fromEntries(cols.map((c) => [c.name, c.isNullable]));
  }, [selectedTable, columnCache]);

  // ── Render States ────────────────────────────────────────────────────────

  if (status === "loading" && !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground animate-in fade-in duration-300">
        <Spinner className="size-5 opacity-40" />
        <p className="text-[11px] font-medium uppercase tracking-widest opacity-40">
          Executing query...
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-full flex-col bg-destructive/5 p-6 overflow-auto">
        <div className="flex items-center gap-2 text-destructive mb-3">
          <HugeiconsIcon icon={AlertCircleIcon} size={18} />
          <h3 className="text-sm font-semibold">Query Error</h3>
        </div>
        <pre className="text-xs font-mono text-destructive/80 leading-relaxed whitespace-pre-wrap break-all bg-destructive/10 p-4 rounded-md border border-destructive/20">
          {error}
        </pre>
      </div>
    );
  }

  // Empty / idle
  if (
    !data ||
    ((!data.columns || data.columns.length === 0) &&
      (!data.rows || data.rows.length === 0) &&
      !data.affected &&
      !data.error)
  ) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground/30 select-none">
        <HugeiconsIcon icon={DatabaseIcon} size={32} strokeWidth={1} />
        <p className="text-[11px] font-medium uppercase tracking-widest">
          Run a query to see results
        </p>
      </div>
    );
  }

  // Non-SELECT (INSERT / UPDATE / DELETE)
  if (!data.columns || data.columns.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 bg-emerald-500/5">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex items-center justify-center size-12 rounded-full bg-emerald-500/10 text-emerald-600">
            <HugeiconsIcon icon={Tick01Icon} size={28} />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-500">
              Query Executed Successfully
            </p>
            <div className="mt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <HugeiconsIcon icon={Layers01Icon} size={12} />
                <b>{data.affected ?? 0}</b> rows affected
              </span>
              <span className="flex items-center gap-1.5">
                <HugeiconsIcon icon={Clock01Icon} size={12} />
                <b>{data.duration?.toFixed(2) ?? "0.00"}</b> ms
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Columns present but zero rows
  const rowCount = data.rows?.length ?? 0;
  if (rowCount === 0) {
    return (
      <div className="flex flex-col h-full bg-background overflow-hidden">
        <div className="overflow-auto border-b border-border/40">
          <table
            className="border-separate border-spacing-0"
            style={{ width: "max-content", minWidth: "100%" }}
          >
            <thead>
              <tr>
                <th className="sticky left-0 z-20 w-10 px-2 py-1.5 text-[10px] font-mono text-muted-foreground/30 border-b border-r border-border/50 text-center bg-muted/70 select-none">
                  #
                </th>
                {(data.columns ?? []).map((col: string, i: number) => (
                  <th
                    key={i}
                    className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground border-b border-r border-border/50 min-w-30 max-w-[320px] whitespace-nowrap select-none bg-muted/60"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/30">
            Query returned 0 rows
          </p>
        </div>
        <div className="h-7 shrink-0 flex items-center justify-between px-3 border-t border-border/40 bg-muted/20 text-[10px] text-muted-foreground/70 font-medium tracking-wide select-none">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <HugeiconsIcon icon={Layers01Icon} size={11} />
              <b className="text-foreground/60">0</b>
              <span className="uppercase">rows</span>
            </span>
            <span className="flex items-center gap-1.5">
              <HugeiconsIcon icon={Clock01Icon} size={11} />
              <b className="text-foreground/60">
                {data.duration?.toFixed(2) ?? "0.00"}
              </b>
              <span>ms</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  const editEnabled =
    pkColumns.length > 0 &&
    !!selectedTable &&
    !!activeProfileId;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── No-PK banner ─────────────────────────────────────────────────── */}
      {selectedTable && pkColumns.length === 0 && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-500 select-none">
          <HugeiconsIcon icon={InformationCircleIcon} size={13} />
          <span>
            No primary key detected on <strong>{selectedTable.table}</strong> — editing is disabled.
          </span>
        </div>
      )}

      <VirtualTable
        key={data.duration}
        result={data}
        pkColumns={pkColumns}
        columnDataTypes={columnDataTypes}
        columnIsGenerated={columnIsGenerated}
        columnIsNullable={columnIsNullable}
        editEnabled={editEnabled}
        connID={activeProfileId ?? ""}
        schema={selectedTable?.schema ?? ""}
        table={selectedTable?.table ?? ""}
      />
    </div>
  );
}

// =============================================================================
// VirtualTable — TanStack Virtual with optional edit/delete mode
// =============================================================================

interface VirtualTableProps {
  result: any;
  pkColumns: string[];
  columnDataTypes: Record<string, string>;
  columnIsGenerated: Record<string, boolean>;
  columnIsNullable: Record<string, boolean>;
  editEnabled: boolean;
  connID: string;
  schema: string;
  table: string;
}

function VirtualTable({
  result,
  pkColumns,
  columnDataTypes,
  columnIsGenerated,
  columnIsNullable,
  editEnabled,
  connID,
  schema,
  table,
}: VirtualTableProps) {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [conflictDeleteOpen, setConflictDeleteOpen] = useState(false);
  const [scriptPreviewOpen, setScriptPreviewOpen] = useState(false);

  const activeTabId = useEditorStore((s) => s.activeTabId);

  const columnNames: string[] = result.columns ?? [];
  const rawRows: any[][] = result.rows ?? [];

  const {
    dirtyRows,
    editingCell,
    isSaving,
    selectedRowKeys,
    setCellValue,
    clearAllDirty,
    clearEditingCell,
    setEditingCell,
    deselectAllRows,
    setFocusedRow,
    saveChanges,
    deleteSelected,
    undoLastCellEdit,
  } = useMutationStore();

  const hasDirty = useMutationStore(selectHasDirty);
  const selectedCount = useMutationStore(selectSelectedCount);
  const focusedRowKey = useMutationStore(selectFocusedRowKey);

  // ── Clear dirty state when new query result arrives ─────────────────────
  useEffect(() => {
    clearAllDirty();
    deselectAllRows();
    setFocusedRow(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build a row key for a raw data row
  const getRowKey = useCallback(
    (row: any[]) => {
      const pks = extractPrimaryKeys(row, columnNames, pkColumns);
      if (!pks) return null;
      return buildRowKey(pks);
    },
    [columnNames, pkColumns],
  );

  // ── Save + Delete handlers ───────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    const rowsToSync: DirtyRow[] = Array.from(dirtyRows.values());

    if (rowsToSync.length > 1000) {
      toast.warning(`Saving ${rowsToSync.length} rows. This may take a moment…`);
    }
    const resp = await saveChanges(connID, schema, table);
    if (resp.success) {
      toast.success(`${resp.affectedRows} row${resp.affectedRows !== 1 ? "s" : ""} saved`);

      if (activeTabId) {
        useDBStore.getState().applyDirtyChangesToRows(activeTabId, pkColumns, rowsToSync);
      }

      if (activeTabId) {
        for (const row of rowsToSync) {
          try {
            const outcome = await useDBStore.getState().syncRowAfterEdit(
              activeTabId, connID, schema, table, pkColumns, row.primaryKeys,
            );
            if (outcome === "gone") {
              toast.warning("A saved row was removed by another session.");
            }
          } catch {
            // applyDirtyChangesToRows already updated the UI — no stale display.
          }
        }
      }
    } else {
      const code = resp.errors?.[0]?.code ?? "";
      const msg = resp.errors?.[0]?.message ?? "Save failed";
      if (code === "CONFLICT") {
        toast.error("Conflict: row was modified by another session. Refresh and retry.");
      } else if (code === "CONSTRAINT_VIOLATION") {
        toast.error(`Constraint violation: ${msg}`);
      } else {
        toast.error(msg);
      }
    }
  }, [saveChanges, connID, schema, table, dirtyRows, activeTabId, pkColumns]);

  const handleDeleteConfirmed = useCallback(async () => {
    setDeleteConfirmOpen(false);
    setConflictDeleteOpen(false);

    const pkValuesList = Array.from(
      useMutationStore.getState().selectedRowKeys
    ).map((key) => JSON.parse(key) as Record<string, unknown>);

    if (pkValuesList.length > 1000) {
      toast.warning(`Deleting ${pkValuesList.length} rows. This may take a moment…`);
    }
    const resp = await deleteSelected(connID, schema, table);
    if (resp.success) {
      toast.success(`${resp.affectedRows} row${resp.affectedRows !== 1 ? "s" : ""} deleted`);

      if (activeTabId) {
        useDBStore.getState().removeQueryRows(activeTabId, pkColumns, pkValuesList);
      }
    } else {
      const code = resp.errors?.[0]?.code ?? "";
      const msg = resp.errors?.[0]?.message ?? "Delete failed";
      if (code === "CONSTRAINT_VIOLATION") {
        toast.error(`Cannot delete: referenced by another table. ${msg}`);
      } else {
        toast.error(msg);
      }
    }
  }, [deleteSelected, connID, schema, table, activeTabId, pkColumns]);

  /**
   * Try to initiate a delete for the current selection.
   * If any selected row has unsaved edits, opens the conflict dialog instead.
   */
  const handleTriggerDelete = useCallback(() => {
    const { selectedRowKeys: sel, dirtyRows: dr } = useMutationStore.getState();
    if (sel.size === 0) return;
    const hasConflict = [...sel].some((k) => dr.has(k));
    if (hasConflict) {
      setConflictDeleteOpen(true);
    } else {
      setDeleteConfirmOpen(true);
    }
  }, []);

  /**
   * Cancel all pending changes: discard edits, deselect rows, clear focus.
   */
  const handleCancelAll = useCallback(() => {
    clearAllDirty();
    deselectAllRows();
    setFocusedRow(null);
  }, [clearAllDirty, deselectAllRows, setFocusedRow]);

  /**
   * Save all pending work in order: edits first, then deletes.
   * If any selected row has unsaved edits, opens the conflict dialog first.
   */
  const handleSaveAll = useCallback(async () => {
    const { selectedRowKeys: sel, dirtyRows: dr } = useMutationStore.getState();
    const hasConflict = sel.size > 0 && [...sel].some((k) => dr.has(k));
    if (hasConflict) {
      setConflictDeleteOpen(true);
      return;
    }
    if (dr.size > 0) {
      await handleSave();
    }
    // Re-read state after save (save clears dirtyRows on success)
    const { selectedRowKeys: selAfter } = useMutationStore.getState();
    if (selAfter.size > 0) {
      await handleDeleteConfirmed();
    }
  }, [handleSave, handleDeleteConfirmed]);

  // ── Script preview SQL ───────────────────────────────────────────────────

  const updateSQL = useMemo(
    () => generateUpdatePreview(schema, table, dirtyRows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schema, table, dirtyRows.size],
  );

  const deleteSQL = useMemo(() => {
    if (selectedRowKeys.size === 0) return "";
    const pkList = Array.from(selectedRowKeys).map(
      (k) => JSON.parse(k) as Record<string, unknown>
    );
    return generateDeletePreview(schema, table, pkList);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, table, selectedRowKeys.size]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    if (!editEnabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+S — save grid changes (edits + pending deletes)
      if (ctrl && e.key === "s" && !e.shiftKey) {
        const { dirtyRows: dr, selectedRowKeys: sel } = useMutationStore.getState();
        if (dr.size > 0 || sel.size > 0) {
          e.preventDefault();
          e.stopPropagation();
          void handleSaveAll();
        }
        return;
      }

      // Ctrl+Z — undo last cell edit
      if (ctrl && e.key === "z") {
        const { cellHistory } = useMutationStore.getState();
        if (cellHistory.length > 0) {
          e.preventDefault();
          undoLastCellEdit();
          return;
        }
      }

      // Delete — toggle the focused row's mark-for-deletion (no dialog; Save executes)
      if (e.key === "Delete" && !ctrl) {
        const { focusedRowKey: focused, editingCell: ec } = useMutationStore.getState();
        if (ec) return; // A cell is being edited — let the input handle it
        if (focused) {
          e.preventDefault();
          useMutationStore.getState().toggleRowSelection(focused);
        }
      }

      // Escape — cancel editing or deselect / unfocus
      if (e.key === "Escape") {
        const { editingCell: ec, selectedRowKeys: sel } = useMutationStore.getState();
        if (ec) {
          clearEditingCell();
          return;
        }
        if (sel.size > 0) {
          deselectAllRows();
          return;
        }
        setFocusedRow(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [editEnabled, handleSave, handleTriggerDelete, undoLastCellEdit, clearEditingCell, deselectAllRows, setFocusedRow]);

  // ── Column definitions ───────────────────────────────────────────────────

  const colDefs = useMemo((): ColumnDef<any[]>[] => {
    const dataCols: ColumnDef<any[]>[] = columnNames.map(
      (col: string, index: number) => ({
        header: col,
        accessorFn: (row: any[]) => row[index],
        id: col + "_" + index,
        cell: ({ row, getValue }: any) => {
          const val = getValue();
          if (!editEnabled) {
            if (val === null || val === undefined)
              return (
                <span className="text-muted-foreground/30 italic text-[11px]">
                  NULL
                </span>
              );
            if (typeof val === "boolean")
              return (
                <span className="text-blue-500 font-semibold text-[11px]">
                  {val ? "TRUE" : "FALSE"}
                </span>
              );
            return <span className="text-[12px]">{String(val)}</span>;
          }

          const rowKey = getRowKey(row.original);
          if (!rowKey) {
            if (val === null || val === undefined)
              return <span className="text-muted-foreground/30 italic text-[11px]">NULL</span>;
            return <span className="text-[12px]">{String(val)}</span>;
          }

          const isPk = pkColumns.includes(col);
          const isEditingThis =
            editingCell?.rowKey === rowKey && editingCell?.column === col;
          const dirtyChange = dirtyRows.get(rowKey)?.changes[col];
          const displayValue = dirtyChange !== undefined ? dirtyChange.newValue : val;
          const isDirty = dirtyChange !== undefined;

          return (
            <EditableCell
              value={displayValue}
              column={col}
              dataType={columnDataTypes[col]}
              isEditing={isEditingThis}
              isDirty={isDirty}
              isPrimaryKey={isPk}
              isGenerated={columnIsGenerated[col] ?? false}
              isNullable={columnIsNullable[col] ?? true}
              onStartEdit={() => setEditingCell(rowKey, col)}
              onCommit={(newValue) => {
                const pks = extractPrimaryKeys(row.original, columnNames, pkColumns);
                if (pks) {
                  setCellValue(rowKey, pks, col, val, newValue);
                }
                clearEditingCell();
              }}
              onCancel={() => clearEditingCell()}
            />
          );
        },
      }),
    );
    return dataCols;
  }, [
    columnNames,
    editEnabled,
    pkColumns,
    columnDataTypes,
    columnIsGenerated,
    columnIsNullable,
    editingCell,
    dirtyRows,
    getRowKey,
    setEditingCell,
    clearEditingCell,
    setCellValue,
  ]);

  // ── TanStack Table ───────────────────────────────────────────────────────

  const tableInstance = useReactTable({
    data: rawRows,
    columns: colDefs,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row, index) => getRowKey(row) ?? String(index),
  });

  const { rows } = tableInstance.getRowModel();

  // ── TanStack Virtual ─────────────────────────────────────────────────────

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 28,
    overscan: 15,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">

      {/* ── Scrollable table ──────────────────────────────────────────────── */}
      <div ref={tableContainerRef} className="flex-1 overflow-auto">
        <table
          className="border-separate border-spacing-0"
          style={{ width: "max-content", minWidth: "100%" }}
        >
          {/* Sticky header */}
          <thead className="sticky top-0 z-10">
            {tableInstance.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {/* Row number */}
                <th className="sticky left-0 z-30 w-10 px-2 py-1.5 text-[10px] font-mono text-muted-foreground/30 border-b border-r border-border/50 text-center bg-muted/70 backdrop-blur-sm select-none">
                  #
                </th>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      "px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground border-b border-r border-border/50 min-w-30 max-w-[320px] whitespace-nowrap select-none bg-muted/60 backdrop-blur-sm",
                      pkColumns.includes(header.column.id.replace(/_\d+$/, "")) &&
                        "text-primary/70",
                    )}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                    {pkColumns.includes(header.column.id.replace(/_\d+$/, "")) && (
                      <span className="ml-1 text-[9px] text-primary/50 uppercase tracking-wide">
                        pk
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {paddingTop > 0 && (
              <tr>
                <td colSpan={columnNames.length + 1} style={{ height: paddingTop }} />
              </tr>
            )}

            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              const rowKey = getRowKey(row.original);
              const isSelected = rowKey ? selectedRowKeys.has(rowKey) : false;
              const isFocused = rowKey ? rowKey === focusedRowKey : false;
              const isRowDirty = rowKey ? dirtyRows.has(rowKey) : false;
              const hasConflict = isSelected && isRowDirty;

              return (
                <tr
                  key={row.id}
                  className={cn(
                    "transition-colors",
                    editEnabled && "cursor-pointer",
                    isSelected
                      ? "bg-destructive/8 hover:bg-destructive/12"
                      : isFocused
                      ? "bg-primary/5 hover:bg-primary/8"
                      : isRowDirty
                      ? "bg-yellow-500/5 hover:bg-yellow-500/10"
                      : virtualRow.index % 2 !== 0
                      ? "bg-muted/50 hover:bg-muted/70"
                      : "hover:bg-muted/70",
                  )}
                  onClick={() => {
                    if (!editEnabled || !rowKey) return;
                    setFocusedRow(rowKey);
                  }}
                >
                  {/* Row number cell — shows conflict icon when row is both dirty+selected */}
                  <td className="sticky left-0 z-20 w-10 px-2 py-1 text-center text-[10px] font-mono border-b border-r border-border/20 select-none bg-background">
                    {hasConflict ? (
                      <span title="This row has unsaved edits and is selected for deletion">
                        <HugeiconsIcon
                          icon={Alert02Icon}
                          size={11}
                          className="text-amber-500 mx-auto"
                        />
                      </span>
                    ) : (
                      <span className="text-muted-foreground/25">
                        {virtualRow.index + 1}
                      </span>
                    )}
                  </td>

                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        "px-3 py-1 border-b border-r border-border/10 min-w-30 max-w-[320px]",
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}

            {paddingBottom > 0 && (
              <tr>
                <td colSpan={columnNames.length + 1} style={{ height: paddingBottom }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Status bar ────────────────────────────────────────────────────── */}
      <div className="h-7 shrink-0 flex items-center justify-between px-3 border-t border-border/40 bg-muted/20 text-[10px] text-muted-foreground/70 font-medium tracking-wide select-none">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <HugeiconsIcon icon={Layers01Icon} size={11} />
            <b className="text-foreground/60">{rawRows.length}</b>
            <span className="uppercase">rows</span>
          </span>
          <span className="flex items-center gap-1.5">
            <HugeiconsIcon icon={Clock01Icon} size={11} />
            <b className="text-foreground/60">
              {result.duration?.toFixed(2) ?? "0.00"}
            </b>
            <span>ms</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          {editEnabled && (
            <span className="opacity-30 text-[10px]">
              Click to focus · Delete to mark for deletion · Double-click to edit · Ctrl+S save · Ctrl+Z undo
            </span>
          )}
          <span className="opacity-40 italic lowercase text-[10px]">
            {virtualRows.length} / {rawRows.length} rows visible
          </span>
        </div>
      </div>

      {/* ── Unified action bar (edits + pending deletes) ──────────────────── */}
      {editEnabled && (hasDirty || selectedCount > 0) && (
        <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-background border-t-2 border-primary/30 shadow-lg">
          <span className="text-[11px] font-medium text-muted-foreground">
            {[
              hasDirty && `${dirtyRows.size} edit${dirtyRows.size !== 1 ? "s" : ""}`,
              selectedCount > 0 && `${selectedCount} row${selectedCount !== 1 ? "s" : ""} to delete`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-3 text-[11px] gap-1.5 text-muted-foreground"
              disabled={isSaving}
              onClick={() => setScriptPreviewOpen(true)}
            >
              <HugeiconsIcon icon={SourceCodeSquareIcon} size={12} />
              Preview script
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-3 text-[11px] gap-1.5 text-muted-foreground"
              disabled={isSaving}
              onClick={handleCancelAll}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} />
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 px-3 text-[11px] gap-1.5"
              disabled={isSaving}
              onClick={() => void handleSaveAll()}
            >
              {isSaving ? (
                <>
                  <Spinner className="size-3" />
                  Saving…
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={FloppyDiskIcon} size={12} />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Standard delete confirmation dialog ───────────────────────────── */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedCount} row{selectedCount !== 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected{" "}
              {selectedCount === 1 ? "row" : `${selectedCount} rows`} from{" "}
              <code className="font-mono text-foreground">{schema}.{table}</code>.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirmed}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Conflict delete dialog (row has unsaved edits) ─────────────────── */}
      <AlertDialog open={conflictDeleteOpen} onOpenChange={setConflictDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={Alert02Icon} size={18} className="text-amber-500" />
              Unsaved edits will be discarded
            </AlertDialogTitle>
            <AlertDialogDescription>
              One or more of the selected rows have unsaved changes.
              Deleting them will permanently discard those edits.
              <br /><br />
              You can <strong>cancel</strong> to save your edits first, or proceed to{" "}
              <strong>discard edits and delete</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirmed}
            >
              Discard edits &amp; delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Script preview dialog ─────────────────────────────────────────── */}
      <ScriptPreviewDialog
        open={scriptPreviewOpen}
        onOpenChange={setScriptPreviewOpen}
        updateSQL={updateSQL || undefined}
        deleteSQL={deleteSQL || undefined}
        schema={schema}
        table={table}
      />
    </div>
  );
}
