import { useState, useEffect, useCallback, useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DatabaseIcon,
  FolderIcon,
  FolderOpenIcon,
  Table01Icon,
  ViewIcon,
  ArrowRight01Icon,
  RefreshIcon,
  Add01Icon,
  MoreHorizontalIcon,
  Logout01Icon,
  Login01Icon,
  Delete02Icon,
  PencilEdit01Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useDBStore, useEditorStore, selectSchemaNode } from "@/store";
import type { Profile, TableInfo, TableRef } from "@/store";
import { ConnectionDialog } from "@/components/connection";
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

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 select-none">
      {label}
    </p>
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
    // Activate the table (column cache + highlight)
    onSelect({ profileId, schema: table.schema, table: table.name });
    
    // Auto-generate ID to link the tab and the query
    const tabId = crypto.randomUUID();
    const content = `SELECT *\nFROM "${table.schema}"."${table.name}"\nLIMIT 100;`;
    
    // Open a new tab with the default SELECT query
    addTab({
      id: tabId,
      title: table.name,
      content,
      connectionId: profileId,
    });
    
    // Automatically execute the query
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

// ── Profile context menu ──────────────────────────────────────────────────────

interface ProfileMenuProps {
  profile: Profile;
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}

function ProfileMenu({
  profile,
  isConnected,
  onConnect,
  onDisconnect,
  onEdit,
  onDelete,
  onRefresh,
}: ProfileMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Options for ${profile.name}`}
          id={`profile-menu-${profile.id}`}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded",
            "text-muted-foreground hover:bg-muted hover:text-foreground",
            "transition-colors",
          )}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} size={12} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-40">
        {isConnected ? (
          <>
            <DropdownMenuItem
              id={`profile-refresh-${profile.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onRefresh();
              }}
            >
              <HugeiconsIcon icon={RefreshIcon} size={13} />
              Refresh
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              id={`profile-disconnect-${profile.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onDisconnect();
              }}
            >
              <HugeiconsIcon icon={Logout01Icon} size={13} />
              Disconnect
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem
            id={`profile-connect-${profile.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onConnect();
            }}
          >
            <HugeiconsIcon icon={Login01Icon} size={13} />
            Connect
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          id={`profile-edit-${profile.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <HugeiconsIcon icon={PencilEdit01Icon} size={13} />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          id={`profile-delete-${profile.id}`}
          variant="destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <HugeiconsIcon icon={Delete02Icon} size={13} />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Profile node ──────────────────────────────────────────────────────────────

interface ProfileNodeProps {
  profile: Profile;
  depth: number;
  isExpanded: boolean;
  selectedTable: TableRef | null;
  onToggle: () => void;
  onSelectTable: (ref: TableRef) => void;
  onEditProfile: (profile: Profile) => void;
}

function ProfileNode({
  profile,
  depth,
  isExpanded,
  selectedTable,
  onToggle,
  onSelectTable,
  onEditProfile,
}: ProfileNodeProps) {
  const connect = useDBStore((s) => s.connect);
  const disconnect = useDBStore((s) => s.disconnect);
  const deleteProfile = useDBStore((s) => s.deleteProfile);
  const loadSchemaTree = useDBStore((s) => s.loadSchemaTree);

  const isConnected = useDBStore((s) => s.activeConnections.has(profile.id));
  const isConnecting = useDBStore((s) => s.connectingIds.has(profile.id));
  const isTreeLoading = useDBStore(
    (s) => s.schemaTreeLoading[profile.id] ?? false,
  );
  const schemaNode = useDBStore(selectSchemaNode(profile.id));

  const [connectError, setConnectError] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    setConnectError(null);
    try {
      await connect(profile.id);
    } catch (err) {
      setConnectError(String(err));
    }
  }, [connect, profile.id]);

  const handleDisconnect = useCallback(async () => {
    await disconnect(profile.id);
  }, [disconnect, profile.id]);

  const handleRefresh = useCallback(async () => {
    await loadSchemaTree(profile.id);
  }, [loadSchemaTree, profile.id]);

  const handleDelete = useCallback(async () => {
    await deleteProfile(profile.id);
  }, [deleteProfile, profile.id]);

  // (Parent ProfileNode controls expand state; no local effect needed here)

  // Status indicator dot
  const statusDot = isConnected ? (
    <span className="block h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
  ) : (
    <span className="block h-1.5 w-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
  );

  const tagColor = profile.tag?.color || "#6B7280";
  const tagName = profile.tag?.name || "Default";

  return (
    <>
      <TreeRow
        id={`tree-profile-${profile.id}`}
        depth={depth}
        icon={
          isConnecting || isTreeLoading ? (
            <Spinner className="size-3.5 text-muted-foreground" />
          ) : (
            <div className="relative flex items-center justify-center">
              <HugeiconsIcon
                icon={DatabaseIcon}
                size={13}
                style={{ color: isConnected ? tagColor : undefined }}
                className={cn(
                  !isConnected && "text-muted-foreground",
                )}
              />
              <span className="absolute -bottom-0.5 -right-0.5">
                {statusDot}
              </span>
            </div>
          )
        }
        label={
          <span className="flex items-center gap-1.5 min-w-0">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-sm"
              style={{ backgroundColor: tagColor }}
              title={tagName}
            />
            <span className="truncate">{profile.name}</span>
          </span>
        }
        isExpandable={isConnected}
        isExpanded={isExpanded}
        onClick={() => {
          if (isConnected) {
            onToggle();
          } else if (!isConnecting) {
            handleConnect();
          }
        }}
        actions={
          <ProfileMenu
            profile={profile}
            isConnected={isConnected}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onEdit={() => onEditProfile(profile)}
            onDelete={handleDelete}
            onRefresh={handleRefresh}
          />
        }
      />

      {/* Connection error inline */}
      {connectError && (
        <div
          className="mx-2 mb-1 flex items-start gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive"
          style={{ marginLeft: `${8 + depth * 14 + 11 + 6}px` }}
        >
          <HugeiconsIcon
            icon={AlertCircleIcon}
            size={12}
            className="mt-px shrink-0"
          />
          <span className="break-all">{connectError}</span>
        </div>
      )}

      {/* Schema tree when connected + expanded */}
      {isConnected && isExpanded && (
        <>
          {isTreeLoading ? (
            <div
              className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground"
              style={{ paddingLeft: `${8 + (depth + 1) * 14 + 4}px` }}
            >
              <Spinner className="size-3 text-muted-foreground/60" />
              <span>Loading schema…</span>
            </div>
          ) : schemaNode ? (
            schemaNode.schemas.map((schema) => (
              <SchemaNodeWrapper
                key={schema}
                schema={schema}
                tables={schemaNode.tablesBySchema[schema] ?? []}
                profileId={profile.id}
                depth={depth + 1}
                selectedTable={selectedTable}
                onSelectTable={onSelectTable}
              />
            ))
          ) : null}
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
  // Stable default — useMemo prevents a new array literal on every render,
  // which would otherwise cause useSchemaTree's useState initializer to see
  // a different reference and trigger unnecessary work downstream.
  const defaultExpanded = useMemo(
    () => (schema === "public" ? [`${profileId}::${schema}`] : []),
    [schema, profileId]
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
// Main SchemaTree component
// =============================================================================

// Stable empty array — used as fallback when profiles.data is null to avoid
// returning a new [] reference from the Zustand selector on every render.
const EMPTY_PROFILES: Profile[] = [];

export function SchemaTree() {
  // profiles.data can be null before first load; don't use `?? []` inside the
  // selector because that creates a new array reference on every call (infinite loop).
  const profilesData = useDBStore((s) => s.profiles.data);
  const profiles = profilesData ?? EMPTY_PROFILES;

  const profilesStatus = useDBStore((s) => s.profiles.status);
  const loadProfiles = useDBStore((s) => s.loadProfiles);
  const selectedTable = useDBStore((s) => s.selectedTable);
  const selectTable = useDBStore((s) => s.selectTable);

  const { isExpanded, toggle, expand } = useSchemaTree();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<Profile | undefined>(
    undefined,
  );

  // Subscribe to a serialised string of active IDs so the effect only re-runs
  // when the actual set of connected profiles changes — not on every immer update
  // (which creates a new Set reference even when contents are identical).
  const activeConnectionsKey = useDBStore((s) =>
    [...s.activeConnections].sort().join(","),
  );

  // Auto-expand newly connected profiles
  useEffect(() => {
    if (!activeConnectionsKey) return;
    activeConnectionsKey.split(",").forEach((id) => {
      if (id) expand(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConnectionsKey]); // `expand` is stable; intentionally omitted to avoid stale closure issues

  const handleNewConnection = () => {
    setEditProfile(undefined);
    setDialogOpen(true);
  };

  const handleEditProfile = (profile: Profile) => {
    setEditProfile(profile);
    setDialogOpen(true);
  };

  const handleDialogClose = async (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      // Refresh profile list after dialog closes
      await loadProfiles();
    }
  };

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

        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                id="sidebar-refresh-profiles"
                aria-label="Refresh profiles"
                onClick={() => loadProfiles()}
                disabled={profilesStatus === "loading"}
              >
                {profilesStatus === "loading" ? (
                  <Spinner className="size-3" />
                ) : (
                  <HugeiconsIcon icon={RefreshIcon} size={12} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Refresh</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                id="sidebar-new-connection"
                aria-label="New connection"
                onClick={handleNewConnection}
              >
                <HugeiconsIcon icon={Add01Icon} size={12} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New Connection</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* ── Body ── */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="py-1 px-1" role="group">
          {/* Loading state */}
          {profilesStatus === "loading" && profiles.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-muted-foreground">
              <Spinner className="size-3.5" />
              <span>Loading connections…</span>
            </div>
          )}

          {/* Empty state */}
          {profilesStatus !== "loading" && profiles.length === 0 && (
            <div className="flex flex-col items-center gap-2.5 px-3 py-6 text-center">
              <HugeiconsIcon
                icon={DatabaseIcon}
                size={28}
                className="text-muted-foreground/20"
              />
              <div className="flex flex-col gap-1">
                <p className="text-[12px] font-medium text-muted-foreground/70">
                  No connections yet
                </p>
                <p className="text-[11px] text-muted-foreground/50">
                  Click + to add your first DB
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleNewConnection}
                id="sidebar-new-connection-empty"
                className="mt-1 gap-1.5 text-xs"
              >
                <HugeiconsIcon icon={Add01Icon} size={12} />
                New Connection
              </Button>
            </div>
          )}

          {/* Profile list */}
          {profiles.length > 0 && (
            <>
              <SectionLabel label="Connections" />
              {profiles.map((profile) => (
                <ProfileNode
                  key={profile.id}
                  profile={profile}
                  depth={0}
                  isExpanded={isExpanded(profile.id)}
                  selectedTable={selectedTable}
                  onToggle={() => toggle(profile.id)}
                  onSelectTable={selectTable}
                  onEditProfile={handleEditProfile}
                />
              ))}
            </>
          )}
        </div>
      </ScrollArea>

      {/* ── Connection dialog ── */}
      <ConnectionDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        editProfile={editProfile}
      />
    </div>
  );
}
