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
  GetLastActiveProfile,
  ListDatabases,
  ListSchemas,
  ListTables,
  DescribeTable,
  ListIndexes,
  SetLastActiveProfile,
  ShowMainWindow,
  ExecuteQuery,
  FetchRowByPK,
} from "../../bindings/github.com/thtn-dev/table_stack/app";

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
  /** Per-tab execution results, keyed by tab ID. */
  queryResults: Record<string, AsyncState<QueryResult>>;
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
  syncLastActiveProfile: () => Promise<void>;
  openMainWindow: () => Promise<void>;

  // ── Schema tree ──────────────────────────────────────────────────────────────
  loadSchemaTree: (profileId: string) => Promise<void>;

  // ── Selection ────────────────────────────────────────────────────────────────
  selectTable: (ref: TableRef | null) => void;
  setActiveProfile: (profileId: string | null) => void;

  // ── Column cache ─────────────────────────────────────────────────────────────
  fetchColumns: (ref: TableRef) => Promise<void>;
  invalidateColumnCache: (profileId: string) => void;

  // ── Query execution ─────────────────────────────────────────────────────────
  executeQuery: (profileId: string, sql: string, tabId: string) => Promise<void>;
  clearQueryResult: (tabId: string) => void;

  // ── Row-level sync (post-mutation) ───────────────────────────────────────────
  /** Replace a single row in a tab's result after a successful edit. */
  patchQueryRow: (
    tabId: string,
    pkColumns: string[],
    pkValues: Record<string, unknown>,
    freshResult: QueryResult,
  ) => void;
  /** Remove rows from a tab's result after a successful delete. */
  removeQueryRows: (
    tabId: string,
    pkColumns: string[],
    pkValuesList: Record<string, unknown>[],
  ) => void;
  /**
   * Immediately apply known dirty-row changes to the cached result rows.
   * Called right after a successful save so the UI reflects new values without
   * waiting for a DB round-trip.
   */
  applyDirtyChangesToRows: (
    tabId: string,
    pkColumns: string[],
    dirtyRowsList: Array<{
      primaryKeys: Record<string, unknown>;
      changes: Record<string, { newValue: unknown }>;
    }>,
  ) => void;
  /**
   * Re-fetch a single row from the DB and patch local state.
   * Returns 'patched' when the row was updated, or 'gone' when the row no
   * longer exists (also removes it from local state automatically).
   * Throws on network / DB errors.
   */
  syncRowAfterEdit: (
    tabId: string,
    connID: string,
    schema: string,
    table: string,
    pkColumns: string[],
    pkValues: Record<string, unknown>,
  ) => Promise<"patched" | "gone">;
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
      queryResults: {},

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
        const isEditing = Boolean(profile.id);
        const wasConnected = isEditing
          ? get().activeConnections.has(profile.id)
          : false;

        const saved = await SaveProfile(profile);
        // Refresh list after save
        await get().loadProfiles();

        if (wasConnected) {
          set((s) => {
            s.connectingIds.add(saved.id);
          });
          try {
            await Connect(saved.id);
            set((s) => {
              s.activeConnections.add(saved.id);
              s.connectingIds.delete(saved.id);
              s.activeProfileId = saved.id;
            });
            await get().loadSchemaTree(saved.id);
          } catch (err) {
            set((s) => {
              s.activeConnections.delete(saved.id);
              s.connectingIds.delete(saved.id);
              delete s.schemaTree[saved.id];
              if (s.selectedTable?.profileId === saved.id) s.selectedTable = null;
              if (s.activeProfileId === saved.id) s.activeProfileId = null;
            });
            throw err;
          }
        }

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

      syncLastActiveProfile: async () => {
        try {
          const id = await GetLastActiveProfile();
          if (!id) {
            return;
          }

          if (!get().activeConnections.has(id)) {
            return;
          }

          set((s) => {
            s.activeProfileId = id;
          });
          await get().loadSchemaTree(id);
        } catch {
          // Non-fatal — app can still work
        }
      },

      openMainWindow: async () => {
        await ShowMainWindow();
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
        void SetLastActiveProfile(profileId ?? "");
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

      executeQuery: async (profileId, sql, tabId) => {
        set((s) => {
          // Reset completely — do NOT preserve stale data.
          // Preserving previous data causes VirtualTable to stay mounted during
          // loading, then re-receive new colDefs when results arrive, which
          // triggers a TanStack Table rebuild loop that freezes the UI on empty
          // result sets (second run).
          s.queryResults[tabId] = asyncLoading<QueryResult>();
        });

        try {
          const res = await ExecuteQuery(profileId, sql);
          set((s) => {
            if (!res) {
              s.queryResults[tabId] = asyncError("Empty query result");
            } else if (res.error) {
              s.queryResults[tabId] = asyncError(res.error, res);
            } else {
              s.queryResults[tabId] = asyncSuccess(res);
            }
          });
        } catch (err) {
          set((s) => {
            s.queryResults[tabId] = asyncError(String(err));
          });
        }
      },

      clearQueryResult: (tabId) => {
        set((s) => {
          delete s.queryResults[tabId];
        });
      },

      patchQueryRow: (tabId, pkColumns, pkValues, freshResult) => {
        set((s) => {
          const resultState = s.queryResults[tabId];
          if (!resultState?.data?.rows?.length || !freshResult.rows?.length) return;

          const origCols = resultState.data.columns;
          const freshCols = freshResult.columns;
          const freshRow = freshResult.rows[0];

          const pkIndices = pkColumns.map((pk) => origCols.indexOf(pk));
          if (pkIndices.some((i) => i === -1)) return;

          const rowIdx = resultState.data.rows.findIndex((row) =>
            pkColumns.every((pk, j) => String(row[pkIndices[j]]) === String(pkValues[pk]))
          );
          if (rowIdx === -1) return;

          // Remap fresh row values into the original column order.
          // Columns absent from the fresh SELECT * are left unchanged.
          const oldRow = resultState.data.rows[rowIdx];
          resultState.data.rows[rowIdx] = origCols.map((col, origIdx) => {
            const freshIdx = freshCols.indexOf(col);
            return freshIdx !== -1 ? freshRow[freshIdx] : oldRow[origIdx];
          });
        });
      },

      removeQueryRows: (tabId, pkColumns, pkValuesList) => {
        set((s) => {
          const resultState = s.queryResults[tabId];
          if (!resultState?.data?.rows?.length) return;

          const origCols = resultState.data.columns;
          const pkIndices = pkColumns.map((pk) => origCols.indexOf(pk));
          if (pkIndices.some((i) => i === -1)) return;

          const toRemove = new Set(
            pkValuesList.map((pkMap) =>
              pkColumns.map((pk) => String(pkMap[pk])).join("\0")
            )
          );

          resultState.data.rows = resultState.data.rows.filter((row) => {
            const key = pkColumns.map((_, j) => String(row[pkIndices[j]])).join("\0");
            return !toRemove.has(key);
          });
        });
      },

      applyDirtyChangesToRows: (tabId, pkColumns, dirtyRowsList) => {
        set((s) => {
          const resultState = s.queryResults[tabId];
          if (!resultState?.data?.rows?.length) return;

          const origCols = resultState.data.columns;
          const pkIndices = pkColumns.map((pk) => origCols.indexOf(pk));
          if (pkIndices.some((i) => i === -1)) return;

          for (const dirtyRow of dirtyRowsList) {
            const rowIdx = resultState.data.rows.findIndex((row) =>
              pkColumns.every(
                (pk, j) =>
                  String(row[pkIndices[j]]) === String(dirtyRow.primaryKeys[pk]),
              ),
            );
            if (rowIdx === -1) continue;

            for (const [column, { newValue }] of Object.entries(
              dirtyRow.changes,
            )) {
              const colIdx = origCols.indexOf(column);
              if (colIdx !== -1) {
                resultState.data.rows[rowIdx][colIdx] = newValue;
              }
            }
          }
        });
      },

      syncRowAfterEdit: async (tabId, connID, schema, table, pkColumns, pkValues) => {
        const freshResult = await FetchRowByPK(connID, schema, table, pkValues as any);
        if (!freshResult) throw new Error("FetchRowByPK returned null");
        if (freshResult.error) throw new Error(freshResult.error);

        if (!freshResult.rows?.length) {
          // Row was deleted between the edit and the re-fetch
          get().removeQueryRows(tabId, pkColumns, [pkValues]);
          return "gone";
        }

        get().patchQueryRow(tabId, pkColumns, pkValues, freshResult);
        return "patched";
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
