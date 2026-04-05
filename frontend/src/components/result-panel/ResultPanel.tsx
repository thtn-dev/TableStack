import { useRef, useMemo, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertCircleIcon,
  DatabaseIcon,
  Tick01Icon,
  Clock01Icon,
  Layers01Icon,
} from "@hugeicons/core-free-icons";

import { useDBStore } from "@/store";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

// =============================================================================
// ResultPanel Component
// =============================================================================

export function ResultPanel() {
  const resultState = useDBStore((s) => s.queryResult);
  const { data, status, error } = resultState;

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

  // Columns present but zero rows — empty table.
  // Do NOT mount VirtualTable with 0 rows: the virtualizer enters a
  // measure→re-render loop when the scroll container is flex-1 and
  // there's no body content to establish height. Show a static message.
  const rowCount = data.rows?.length ?? 0;
  if (rowCount === 0) {
    return (
      <div className="flex flex-col h-full bg-background overflow-hidden">
        {/* Show column headers so the user sees the schema */}
        <div className="overflow-auto border-b border-border/40">
          <table
            className="border-separate border-spacing-0"
            style={{ width: "max-content", minWidth: "100%" }}
          >
            <thead>
              <tr>
                <th className="w-10 px-2 py-1.5 text-[10px] font-mono text-muted-foreground/30 border-b border-r border-border/50 text-center bg-muted/60 select-none">
                  #
                </th>
                {(data.columns ?? []).map((col: string, i: number) => (
                  <th
                    key={i}
                    className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground border-b border-r border-border/50 min-w-[120px] max-w-[320px] whitespace-nowrap select-none bg-muted/60"
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
        {/* Status bar */}
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

  return <VirtualTable key={data.duration} result={data} />;
}

// =============================================================================
// VirtualTable — correct TanStack Virtual pattern for <table> elements
// Uses padding rows (not absolute positioning) to avoid browser layout thrash.
// =============================================================================

function VirtualTable({ result }: { result: any }) {
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // ── Stabilise data references so useMemo deps never change identity ──────
  // result prop is a plain object from Zustand — columns/rows are stable between
  // re-renders of the SAME result. We read them once here.
  const columnNames: string[] = result.columns ?? [];
  const rawRows: any[][] = result.rows ?? [];

  // ── Column definitions — stable as long as column names don't change ──────
  const colDefs = useMemo(
    () =>
      columnNames.map((col: string, index: number) => ({
        header: col,
        // accessorFn reads a specific index from each row array
        accessorFn: (row: any[]) => row[index],
        id: col + "_" + index, // stable id — NOT just the index string
        cell: ({ getValue }: any) => {
          const val = getValue();
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
        },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result], // re-compute only when the result object itself changes (new query)
  );

  // ── TanStack Table ────────────────────────────────────────────────────────
  const table = useReactTable({
    data: rawRows,
    columns: colDefs,
    getCoreRowModel: getCoreRowModel(),
  });

  const { rows } = table.getRowModel();

  // ── TanStack Virtual ──────────────────────────────────────────────────────
  // CORRECT pattern for tables: use padding rows, NOT position:absolute on <tr>.
  // Absolute <tr> inside <tbody> breaks browser table layout and causes freeze.
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 28,
    overscan: 15,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  // Padding above and below the virtual window
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Scrollable container */}
      <div ref={tableContainerRef} className="flex-1 overflow-auto">
        <table
          className="border-separate border-spacing-0"
          style={{ width: "max-content", minWidth: "100%" }}
        >
          {/* Sticky header */}
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {/* Row number */}
                <th className="w-10 px-2 py-1.5 text-[10px] font-mono text-muted-foreground/30 border-b border-r border-border/50 text-center bg-muted/60 backdrop-blur-sm select-none">
                  #
                </th>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-1.5 text-left text-[11px] font-semibold text-muted-foreground border-b border-r border-border/50 min-w-[120px] max-w-[320px] whitespace-nowrap select-none bg-muted/60 backdrop-blur-sm"
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {/* Top padding row — replaces absolute translateY */}
            {paddingTop > 0 && (
              <tr>
                <td style={{ height: paddingTop }} />
              </tr>
            )}

            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <tr
                  key={row.id}
                  className={cn(
                    "hover:bg-muted/70 transition-colors",
                    virtualRow.index % 2 !== 0
                      ? "bg-muted/50"
                      : "bg-transparent",
                  )}
                >
                  {/* Row number cell */}
                  <td className="w-10 px-2 py-1 text-center text-[10px] font-mono text-muted-foreground/25 border-b border-r border-border/20 select-none bg-muted/5">
                    {virtualRow.index + 1}
                  </td>
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-1 border-b border-r border-border/10 min-w-[120px] max-w-[320px]"
                    >
                      <div className="truncate font-mono">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}

            {/* Bottom padding row */}
            {paddingBottom > 0 && (
              <tr>
                <td style={{ height: paddingBottom }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Status bar */}
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
        <span className="opacity-40 italic lowercase text-[10px]">
          Virtualizing {virtualRows.length} / {rawRows.length} rows
        </span>
      </div>
    </div>
  );
}
