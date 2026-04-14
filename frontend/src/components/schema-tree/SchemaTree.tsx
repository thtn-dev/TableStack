import { useEffect, useCallback, useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Table01Icon,
  ViewIcon,
  FolderIcon,
  FolderOpenIcon,
  ArrowRight01Icon,
  RefreshIcon,
  DatabaseIcon,
  WifiDisconnected02Icon,
} from "@hugeicons/core-free-icons";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useDBStore, useEditorStore, selectSchemaNode } from "@/store";
import type { TableInfo, TableRef } from "@/store";
import { useSchemaTree } from "./useSchemaTree";
import { cn } from "@/lib/utils";

// =============================================================================
// Constants & helpers
// =============================================================================

const TABLE_ICON_MAP: Record<string, typeof Table01Icon> = {
  table: Table01Icon,
  view: ViewIcon,
};

function getTableIcon(type: string) {
  return TABLE_ICON_MAP[type?.toLowerCase()] ?? Table01Icon;
}

// =============================================================================
// Sub-components
// =============================================================================

// ── Chevron ───────────────────────────────────────────────────────────────────

function Chevron({ open }: { open: boolean }) {
  return (
    <HugeiconsIcon
      icon={ArrowRight01Icon}
      size={11}
      className={cn(
        "shrink-0 text-muted-foreground/50 transition-transform duration-150",
        open && "rotate-90",
      )}
    />
  );
}

// ── Tree row (generic) ────────────────────────────────────────────────────────

interface TreeRowProps {
  depth: number;
  icon: React.ReactNode;
  label: React.ReactNode;
  isSelected?: boolean;
  isExpandable?: boolean;
  isExpanded?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  actions?: React.ReactNode;
  className?: string;
  id?: string;
}

function TreeRow({
  depth,
  icon,
  label,
  isSelected,
  isExpandable,
  isExpanded,
  onClick,
  onDoubleClick,
  actions,
  className,
  id,
}: TreeRowProps) {
  return (
    <div
      id={id}
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={isExpandable ? isExpanded : undefined}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        "group/row flex items-center gap-1.5 cursor-pointer select-none",
        "h-6 rounded-md text-xs",
        "px-2 transition-colors duration-100",
        "hover:bg-muted/70",
        isSelected && "bg-primary/10 text-primary hover:bg-primary/15",
        className,
      )}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
    >
      {/* Expand chevron */}
      {isExpandable ? (
        <Chevron open={Boolean(isExpanded)} />
      ) : (
        <span className="w-2.75 shrink-0" />
      )}

      {/* Node icon */}
      <span className="shrink-0 text-muted-foreground">{icon}</span>

      {/* Label */}
      <span className="flex-1 truncate">{label}</span>

      {/* Actions (shown on hover) */}
      {actions && (
        <span className="opacity-0 group-hover/row:opacity-100 transition-opacity">
          {actions}
        </span>
      )}
    </div>
  );
}

// ── Table node ────────────────────────────────────────────────────────────────

interface TableNodeProps {
  table: TableInfo;
  profileId: string;
  depth: number;
  isSelected: boolean;
  onSelect: (ref: TableRef) => void;
}

function TableNode({
  table,
  profileId,
  depth,
  isSelected,
  onSelect,
}: TableNodeProps) {
  const Icon = getTableIcon(table.type);
  const addTab = useEditorStore((s) => s.addTab);
  const executeQuery = useDBStore((s) => s.executeQuery);

  const handleDoubleClick = useCallback(() => {
    onSelect({ profileId, schema: table.schema, table: table.name });

    const tabId = crypto.randomUUID();
    const content = `SELECT *\nFROM "${table.schema}"."${table.name}"\nLIMIT 100;`;

    addTab({
      id: tabId,
      title: table.name,
      content,
      connectionId: profileId,
    });

    void executeQuery(profileId, content, tabId);
  }, [addTab, executeQuery, onSelect, table.name, table.schema, profileId]);

  return (
    <TreeRow
      id={`tree-table-${profileId}-${table.schema}-${table.name}`}
      depth={depth}
      icon={
        <HugeiconsIcon
          icon={Icon}
          size={13}
          className={cn(isSelected ? "text-primary" : "text-muted-foreground")}
        />
      }
      label={table.name}
      isSelected={isSelected}
      onDoubleClick={handleDoubleClick}
    />
  );
}

// ── Schema node ───────────────────────────────────────────────────────────────

interface SchemaNodeProps {
  schema: string;
  tables: TableInfo[];
  profileId: string;
  depth: number;
  isExpanded: boolean;
  selectedTable: TableRef | null;
  onToggle: () => void;
  onSelectTable: (ref: TableRef) => void;
}

function SchemaNode({
  schema,
  tables,
  profileId,
  depth,
  isExpanded,
  selectedTable,
  onToggle,
  onSelectTable,
}: SchemaNodeProps) {
  const FolderIco = isExpanded ? FolderOpenIcon : FolderIcon;

  return (
    <>
      <TreeRow
        id={`tree-schema-${profileId}-${schema}`}
        depth={depth}
        icon={
          <HugeiconsIcon
            icon={FolderIco}
            size={13}
            className="text-amber-400"
          />
        }
        label={schema}
        isExpandable
        isExpanded={isExpanded}
        onClick={onToggle}
      />

      {isExpanded && (
        <>
          {tables.length === 0 ? (
            <div
              className="px-3 py-1 text-[11px] text-muted-foreground/50 italic select-none"
              style={{ paddingLeft: `${8 + (depth + 2) * 14}px` }}
            >
              No tables
            </div>
          ) : (
            tables.map((t) => (
              <TableNode
                key={`${t.schema}.${t.name}`}
                table={t}
                profileId={profileId}
                depth={depth + 1}
                isSelected={
                  selectedTable?.profileId === profileId &&
                  selectedTable.schema === t.schema &&
                  selectedTable.table === t.name
                }
                onSelect={onSelectTable}
              />
            ))
          )}
        </>
      )}
    </>
  );
}

// ── Schema node wrapper with local expansion ──────────────────────────────────

interface SchemaNodeWrapperProps {
  schema: string;
  tables: TableInfo[];
  profileId: string;
  depth: number;
  selectedTable: TableRef | null;
  onSelectTable: (ref: TableRef) => void;
}

function SchemaNodeWrapper({
  schema,
  tables,
  profileId,
  depth,
  selectedTable,
  onSelectTable,
}: SchemaNodeWrapperProps) {
  const defaultExpanded = useMemo(
    () => (schema === "public" ? [`${profileId}::${schema}`] : []),
    [schema, profileId],
  );

  const { isExpanded, toggle } = useSchemaTree(defaultExpanded);
  const key = `${profileId}::${schema}`;

  return (
    <SchemaNode
      schema={schema}
      tables={tables}
      profileId={profileId}
      depth={depth}
      isExpanded={isExpanded(key)}
      selectedTable={selectedTable}
      onToggle={() => toggle(key)}
      onSelectTable={onSelectTable}
    />
  );
}

// =============================================================================
// Main SchemaTree component — shows the active profile's schema tree only
// =============================================================================

export function SchemaTree() {
  const activeProfileId = useDBStore((s) => s.activeProfileId);
  const isConnected = useDBStore((s) =>
    Boolean(activeProfileId && s.activeConnections.has(activeProfileId)),
  );
  const isConnecting = useDBStore((s) =>
    Boolean(activeProfileId && s.connectingIds.has(activeProfileId)),
  );
  const isTreeLoading = useDBStore(
    (s) => (activeProfileId ? (s.schemaTreeLoading[activeProfileId] ?? false) : false),
  );
  const schemaNode = useDBStore(
    activeProfileId ? selectSchemaNode(activeProfileId) : () => null,
  );

  const selectedTable = useDBStore((s) => s.selectedTable);
  const selectTable = useDBStore((s) => s.selectTable);
  const loadSchemaTree = useDBStore((s) => s.loadSchemaTree);
  const connect = useDBStore((s) => s.connect);

  const { isExpanded, expand } = useSchemaTree();

  // Auto-expand when the active profile connects
  useEffect(() => {
    if (activeProfileId && isConnected) {
      expand(activeProfileId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, activeProfileId]);

  return (
    <div
      className="flex flex-col h-full min-h-0"
      role="tree"
      aria-label="Database explorer"
    >
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between px-2 py-1.5 border-b border-border/60">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-1 select-none">
          Explorer
        </span>

        {isConnected && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                id="sidebar-refresh-schema"
                aria-label="Refresh schema"
                onClick={() => activeProfileId && void loadSchemaTree(activeProfileId)}
                disabled={isTreeLoading}
              >
                {isTreeLoading ? (
                  <Spinner className="size-3" />
                ) : (
                  <HugeiconsIcon icon={RefreshIcon} size={12} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Refresh schema</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* ── Body ── */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="py-1 px-1" role="group">

          {/* No active profile */}
          {!activeProfileId && (
            <div className="flex flex-col items-center gap-2.5 px-3 py-6 text-center select-none">
              <HugeiconsIcon
                icon={DatabaseIcon}
                size={28}
                className="text-muted-foreground/20"
              />
              <p className="text-[11px] text-muted-foreground/50">
                Select a connection from the sidebar
              </p>
            </div>
          )}

          {/* Active profile but not connected */}
          {activeProfileId && !isConnected && !isConnecting && (
            <div className="flex flex-col items-center gap-3 px-3 py-6 text-center select-none">
              <HugeiconsIcon
                icon={WifiDisconnected02Icon}
                size={28}
                className="text-muted-foreground/20"
              />
              <p className="text-[11px] text-muted-foreground/50">
                Not connected
              </p>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 px-3"
                onClick={() => void connect(activeProfileId)}
              >
                Connect
              </Button>
            </div>
          )}

          {/* Connecting spinner */}
          {activeProfileId && isConnecting && (
            <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-muted-foreground">
              <Spinner className="size-3.5" />
              <span>Connecting…</span>
            </div>
          )}

          {/* Schema tree loading */}
          {activeProfileId && isConnected && isTreeLoading && !schemaNode && (
            <div
              className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground"
              style={{ paddingLeft: "22px" }}
            >
              <Spinner className="size-3 text-muted-foreground/60" />
              <span>Loading schema…</span>
            </div>
          )}

          {/* Schema tree */}
          {activeProfileId && isConnected && schemaNode && (
            schemaNode.schemas.map((schema) => (
              <SchemaNodeWrapper
                key={schema}
                schema={schema}
                tables={schemaNode.tablesBySchema[schema] ?? []}
                profileId={activeProfileId}
                depth={0}
                selectedTable={selectedTable}
                onSelectTable={selectTable}
              />
            ))
          )}

        </div>
      </ScrollArea>
    </div>
  );
}
