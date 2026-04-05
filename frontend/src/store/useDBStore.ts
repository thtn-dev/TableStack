import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { subscribeWithSelector } from "zustand/middleware";
import { enableMapSet } from "immer";

// Required for Immer to handle projects using Set/Map in state
enableMapSet();

import {
  ListProfiles,
  SaveProfile,
  DeleteProfile,
  Connect,
  Disconnect,
  ActiveConnections,
  ListDatabases,
  ListSchemas,
  ListTables,
  DescribeTable,
  ListIndexes,
  ExecuteQuery,
} from "../../wailsjs/go/main/App";

import type {
  Profile,
  TableRef,
  TableCacheKey,
  ColumnInfo,
  TableInfo,
  SchemaNode,
  AsyncState,
  QueryResult,
} from "./types";

import {
  toTableCacheKey,
  asyncLoading,
  asyncSuccess,
  asyncError,
  asyncIdle,
} from "./types";

// =============================================================================
// State shape
// =============================================================================

interface DBState {
  // ── Profiles ────────────────────────────────────────────────────────────────
  /** All saved connection profiles (loaded from disk at startup). */
  profiles: AsyncState<Profile[]>;

  // ── Active connections ───────────────────────────────────────────────────────
  /** Set of profileIds that are currently connected. */
  activeConnections: Set<string>;
  /** Per-profile: loading state of Connect/Disconnect action. */
  connectingIds: Set<string>;

  // ── Schema tree ─────────────────────────────────────────────────────────────
  /** Per-profile schema tree data. */
  schemaTree: Record<string, SchemaNode>;
  /** Per-profile schema tree loading state. */
  schemaTreeLoading: Record<string, boolean>;

  // ── Selection ───────────────────────────────────────────────────────────────
  /** Currently selected table (drives QueryEditor default, etc.). */
  selectedTable: TableRef | null;
  /** Currently active profileId in the sidebar. */
  activeProfileId: string | null;

  // ── Column cache ────────────────────────────────────────────────────────────
  /** Memoized DescribeTable results — keyed by toTableCacheKey(). */
  columnCache: Record<TableCacheKey, AsyncState<ColumnInfo[]>>;

  // ── Query execution ─────────────────────────────────────────────────────────
  /** Last execution result (current tab). */
  queryResult: AsyncState<QueryResult>;
}

// =============================================================================
// Actions shape
// =============================================================================

interface DBActions {
  // ── Profile CRUD ─────────────────────────────────────────────────────────────
  loadProfiles: () => Promise<void>;
  saveProfile: (profile: Profile) => Promise<Profile>;
  deleteProfile: (id: string) => Promise<void>;

  // ── Connection management ────────────────────────────────────────────────────
  connect: (profileId: string) => Promise<void>;
  disconnect: (profileId: string) => Promise<void>;
  syncActiveConnections: () => Promise<void>;

  // ── Schema tree ──────────────────────────────────────────────────────────────
  loadSchemaTree: (profileId: string) => Promise<void>;

  // ── Selection ────────────────────────────────────────────────────────────────
  selectTable: (ref: TableRef | null) => void;
  setActiveProfile: (profileId: string | null) => void;

  // ── Column cache ─────────────────────────────────────────────────────────────
  fetchColumns: (ref: TableRef) => Promise<void>;
  invalidateColumnCache: (profileId: string) => void;

  // ── Query execution ─────────────────────────────────────────────────────────
  executeQuery: (profileId: string, sql: string) => Promise<void>;
}

// =============================================================================
// Store
// =============================================================================

export const useDBStore = create<DBState & DBActions>()(
  subscribeWithSelector(
    immer((set, get) => ({
      // ── Initial state ──────────────────────────────────────────────────────

      profiles: asyncIdle<Profile[]>(),
      activeConnections: new Set(),
      connectingIds: new Set(),

      schemaTree: {},
      schemaTreeLoading: {},

      selectedTable: null,
      activeProfileId: null,

      columnCache: {},
      queryResult: asyncIdle<QueryResult>(),

      // ── Profile CRUD ────────────────────────────────────────────────────────

      loadProfiles: async () => {
        set((s) => {
          s.profiles = asyncLoading(s.profiles.data);
        });
        try {
          const data = await ListProfiles();
          set((s) => {
            s.profiles = asyncSuccess(data ?? []);
          });
        } catch (err) {
          set((s) => {
            s.profiles = asyncError(String(err), s.profiles.data);
          });
        }
      },

      saveProfile: async (profile) => {
        const saved = await SaveProfile(profile);
        // Refresh list after save
        await get().loadProfiles();
        return saved;
      },

      deleteProfile: async (id) => {
        await DeleteProfile(id);
        // Remove from active connections optimistically
        set((s) => {
          s.activeConnections.delete(id);
          delete s.schemaTree[id];
          // Clear column cache entries for this profile
          for (const key of Object.keys(s.columnCache)) {
            if (key.startsWith(`${id}::`)) {
              delete s.columnCache[key as TableCacheKey];
            }
          }
          // Reset selection if affected
          if (s.activeProfileId === id) s.activeProfileId = null;
          if (s.selectedTable?.profileId === id) s.selectedTable = null;
        });
        await get().loadProfiles();
      },

      // ── Connection management ──────────────────────────────────────────────

      connect: async (profileId) => {
        set((s) => {
          s.connectingIds.add(profileId);
        });
        try {
          await Connect(profileId);
          set((s) => {
            s.activeConnections.add(profileId);
            s.connectingIds.delete(profileId);
            s.activeProfileId = profileId;
          });
          // Load schema tree immediately after connecting
          await get().loadSchemaTree(profileId);
        } catch (err) {
          set((s) => {
            s.connectingIds.delete(profileId);
          });
          throw err;
        }
      },

      disconnect: async (profileId) => {
        set((s) => {
          s.connectingIds.add(profileId);
        });
        try {
          await Disconnect(profileId);
        } finally {
          set((s) => {
            s.activeConnections.delete(profileId);
            s.connectingIds.delete(profileId);
            delete s.schemaTree[profileId];
            // Clear selection if disconnected profile was active
            if (s.activeProfileId === profileId) s.activeProfileId = null;
            if (s.selectedTable?.profileId === profileId)
              s.selectedTable = null;
          });
        }
      },

      syncActiveConnections: async () => {
        try {
          const ids = await ActiveConnections();
          set((s) => {
            s.activeConnections = new Set(ids ?? []);
          });
        } catch {
          // Non-fatal — app can still work
        }
      },

      // ── Schema tree ───────────────────────────────────────────────────────

      loadSchemaTree: async (profileId) => {
        set((s) => {
          s.schemaTreeLoading[profileId] = true;
        });

        try {
          // Fetch databases, schemas, and tables in parallel where possible
          const [dbInfos, schemas] = await Promise.all([
            ListDatabases(profileId),
            ListSchemas(profileId),
          ]);

          const databases = (dbInfos ?? []).map((d) => d.name);

          // Fetch tables for each schema (sequentially to avoid overwhelming the DB)
          const tablesBySchema: Record<string, TableInfo[]> = {};
          for (const schema of schemas ?? []) {
            try {
              const tables = await ListTables(profileId, schema);
              tablesBySchema[schema] = tables ?? [];
            } catch {
              tablesBySchema[schema] = [];
            }
          }

          set((s) => {
            s.schemaTree[profileId] = {
              profileId,
              databases,
              schemas: schemas ?? [],
              tablesBySchema,
            };
            s.schemaTreeLoading[profileId] = false;
          });
        } catch (err) {
          set((s) => {
            s.schemaTreeLoading[profileId] = false;
          });
          throw err;
        }
      },

      // ── Selection ─────────────────────────────────────────────────────────

      selectTable: (ref) => {
        set((s) => {
          s.selectedTable = ref;
          if (ref) s.activeProfileId = ref.profileId;
        });
        // Eagerly warm the column cache when a table is selected
        if (ref) {
          const key = toTableCacheKey(ref);
          const cached = get().columnCache[key];
          if (
            !cached ||
            cached.status === "idle" ||
            cached.status === "error"
          ) {
            get().fetchColumns(ref);
          }
        }
      },

      setActiveProfile: (profileId) => {
        set((s) => {
          s.activeProfileId = profileId;
        });
      },

      // ── Column cache ──────────────────────────────────────────────────────

      fetchColumns: async (ref) => {
        const key = toTableCacheKey(ref);
        const existing = get().columnCache[key];

        // Skip if already loading or freshly loaded
        if (existing?.status === "loading" || existing?.status === "success")
          return;

        set((s) => {
          s.columnCache[key] = asyncLoading(existing?.data);
        });

        try {
          const cols = await DescribeTable(
            ref.profileId,
            ref.schema,
            ref.table,
          );
          set((s) => {
            s.columnCache[key] = asyncSuccess(cols ?? []);
          });
        } catch (err) {
          set((s) => {
            s.columnCache[key] = asyncError(String(err), existing?.data);
          });
        }
      },

      invalidateColumnCache: (profileId) => {
        set((s) => {
          for (const key of Object.keys(s.columnCache)) {
            if (key.startsWith(`${profileId}::`)) {
              delete s.columnCache[key as TableCacheKey];
            }
          }
        });
      },

      // ── Query execution ───────────────────────────────────────────────────

      executeQuery: async (profileId, sql) => {
        set((s) => {
          // Reset completely — do NOT preserve stale data.
          // Preserving previous data causes VirtualTable to stay mounted during
          // loading, then re-receive new colDefs when results arrive, which
          // triggers a TanStack Table rebuild loop that freezes the UI on empty
          // result sets (second run).
          s.queryResult = asyncLoading<QueryResult>();
        });

        try {
          const res = await ExecuteQuery(profileId, sql);
          set((s) => {
            if (res.error) {
              s.queryResult = asyncError(res.error, res);
            } else {
              s.queryResult = asyncSuccess(res);
            }
          });
        } catch (err) {
          set((s) => {
            s.queryResult = asyncError(String(err));
          });
        }
      },
    })),
  ),
);

// =============================================================================
// Derived selectors (stable references — call outside components for perf)
// =============================================================================

/** Is a given profileId actively connected? */
export const selectIsConnected = (profileId: string) => (s: DBState) =>
  s.activeConnections.has(profileId);

/** Is a given profileId in the middle of connecting/disconnecting? */
export const selectIsConnecting = (profileId: string) => (s: DBState) =>
  s.connectingIds.has(profileId);

/** Get columns for the currently selected table (or null). */
export const selectCurrentColumns = (s: DBState & DBActions) => {
  if (!s.selectedTable) return null;
  return s.columnCache[toTableCacheKey(s.selectedTable)] ?? null;
};

/** Get the schema tree for a given profileId. */
export const selectSchemaNode = (profileId: string) => (s: DBState) =>
  s.schemaTree[profileId] ?? null;

/** Number of active connections. */
export const selectConnectionCount = (s: DBState) => s.activeConnections.size;

/** Profile list data (unwrapped). */
export const selectProfiles = (s: DBState) => s.profiles.data ?? [];
