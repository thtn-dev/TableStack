import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { subscribeWithSelector } from "zustand/middleware";
import { enableMapSet } from "immer";

enableMapSet();

import {
  UpdateRows,
  DeleteRows,
} from "../../bindings/github.com/thtn-dev/table_stack/app";

import type {
  DirtyRow,
  EditingCell,
  UpdateBulkRequest,
  DeleteRowsRequest,
  MutationResponse,
} from "@/types/mutation";
import { buildRowKey } from "@/types/mutation";

// =============================================================================
// State shape
// =============================================================================

interface MutationState {
  /** Rows with uncommitted changes. Key = buildRowKey(primaryKeys). */
  dirtyRows: Map<string, DirtyRow>;

  /** Row keys selected for bulk delete. */
  selectedRowKeys: Set<string>;

  /** Which cell is being actively edited, if any. */
  editingCell: EditingCell | null;

  /** True while a save (UPDATE) is in flight. */
  isSaving: boolean;

  /** True while a delete is in flight. */
  isDeleting: boolean;

  /** Last mutation error message (cleared on next save/delete attempt). */
  lastError: string | null;

  /** Last successful mutation response (for toast/status display). */
  lastResponse: MutationResponse | null;
}

// =============================================================================
// Actions shape
// =============================================================================

interface MutationActions {
  // ── Cell editing ─────────────────────────────────────────────────────────────

  /**
   * Record a changed cell value into the dirty-row map.
   * rowKey = buildRowKey(primaryKeys). primaryKeys are stored so they can be
   * sent to the backend without re-deriving them from the result set.
   */
  setCellValue: (
    rowKey: string,
    primaryKeys: Record<string, unknown>,
    column: string,
    oldValue: unknown,
    newValue: unknown,
  ) => void;

  /** Remove all pending changes for a single row. */
  clearDirtyRow: (rowKey: string) => void;

  /** Clear all dirty rows (e.g. after successful save or explicit discard). */
  clearAllDirty: () => void;

  /** Set which cell is being edited. */
  setEditingCell: (rowKey: string, column: string) => void;

  /** Clear the active editing cell. */
  clearEditingCell: () => void;

  // ── Row selection ─────────────────────────────────────────────────────────────

  toggleRowSelection: (rowKey: string) => void;
  selectAllRows: (rowKeys: string[]) => void;
  deselectAllRows: () => void;

  // ── Derived helpers ──────────────────────────────────────────────────────────

  hasDirtyRows: () => boolean;
  getDirtyRowCount: () => number;

  // ── Backend operations ───────────────────────────────────────────────────────

  /**
   * Send all dirty rows to the backend as a single transactional UPDATE.
   * On success clears dirty state. On failure keeps it so the user can retry.
   */
  saveChanges: (
    connID: string,
    schema: string,
    table: string,
  ) => Promise<MutationResponse>;

  /**
   * Delete all selected rows in a single transactional DELETE.
   * On success clears selection. On failure keeps it.
   */
  deleteSelected: (
    connID: string,
    schema: string,
    table: string,
  ) => Promise<MutationResponse>;

  /** Clear last error and response messages. */
  clearStatus: () => void;
}

// =============================================================================
// Store
// =============================================================================

export const useMutationStore = create<MutationState & MutationActions>()(
  subscribeWithSelector(
    immer((set, get) => ({
      // ── Initial state ──────────────────────────────────────────────────────

      dirtyRows: new Map(),
      selectedRowKeys: new Set(),
      editingCell: null,
      isSaving: false,
      isDeleting: false,
      lastError: null,
      lastResponse: null,

      // ── Cell editing ───────────────────────────────────────────────────────

      setCellValue: (rowKey, primaryKeys, column, oldValue, newValue) => {
        set((s) => {
          if (!s.dirtyRows.has(rowKey)) {
            s.dirtyRows.set(rowKey, { primaryKeys, changes: {} });
          }
          const row = s.dirtyRows.get(rowKey)!;
          row.changes[column] = { oldValue, newValue };
        });
      },

      clearDirtyRow: (rowKey) => {
        set((s) => {
          s.dirtyRows.delete(rowKey);
        });
      },

      clearAllDirty: () => {
        set((s) => {
          s.dirtyRows.clear();
        });
      },

      setEditingCell: (rowKey, column) => {
        set((s) => {
          s.editingCell = { rowKey, column };
        });
      },

      clearEditingCell: () => {
        set((s) => {
          s.editingCell = null;
        });
      },

      // ── Row selection ──────────────────────────────────────────────────────

      toggleRowSelection: (rowKey) => {
        set((s) => {
          if (s.selectedRowKeys.has(rowKey)) {
            s.selectedRowKeys.delete(rowKey);
          } else {
            s.selectedRowKeys.add(rowKey);
          }
        });
      },

      selectAllRows: (rowKeys) => {
        set((s) => {
          for (const k of rowKeys) s.selectedRowKeys.add(k);
        });
      },

      deselectAllRows: () => {
        set((s) => {
          s.selectedRowKeys.clear();
        });
      },

      // ── Derived helpers ────────────────────────────────────────────────────

      hasDirtyRows: () => get().dirtyRows.size > 0,
      getDirtyRowCount: () => get().dirtyRows.size,

      // ── Backend operations ─────────────────────────────────────────────────

      saveChanges: async (connID, schema, table) => {
        set((s) => {
          s.isSaving = true;
          s.lastError = null;
        });

        const dirtyRows = get().dirtyRows;
        const rows = Array.from(dirtyRows.entries()).map(([, row]) => ({
          schema,
          table,
          primaryKeys: row.primaryKeys,
          changes: Object.entries(row.changes).map(([column, { oldValue, newValue }]) => ({
            column,
            oldValue,
            newValue,
          })),
        }));

        const req: UpdateBulkRequest = { rows };

        try {
          const resp = await UpdateRows(connID, req as any);
          const response = resp as unknown as MutationResponse;

          if (response.success) {
            set((s) => {
              s.dirtyRows.clear();
              s.lastResponse = response;
              s.isSaving = false;
            });
          } else {
            const msg =
              response.errors?.[0]?.message ?? "Unknown error during save";
            set((s) => {
              s.lastError = msg;
              s.lastResponse = response;
              s.isSaving = false;
            });
          }
          return response;
        } catch (err) {
          const msg = String(err);
          set((s) => {
            s.lastError = msg;
            s.isSaving = false;
          });
          return { success: false, affectedRows: 0, errors: [{ rowIndex: 0, code: "DB_ERROR", message: msg }] };
        }
      },

      deleteSelected: async (connID, schema, table) => {
        const selectedKeys = get().selectedRowKeys;
        if (selectedKeys.size === 0) {
          return { success: true, affectedRows: 0 };
        }

        // Reconstruct PK maps from row keys (which are JSON-serialized PK maps)
        const primaryKeys = Array.from(selectedKeys).map((key) =>
          JSON.parse(key) as Record<string, unknown>,
        );

        set((s) => {
          s.isDeleting = true;
          s.lastError = null;
        });

        const req: DeleteRowsRequest = { schema, table, primaryKeys };

        try {
          const resp = await DeleteRows(connID, req as any);
          const response = resp as unknown as MutationResponse;

          if (response.success) {
            set((s) => {
              // Remove deleted rows from dirty state too
              for (const key of selectedKeys) {
                s.dirtyRows.delete(key);
              }
              s.selectedRowKeys.clear();
              s.lastResponse = response;
              s.isDeleting = false;
            });
          } else {
            const msg =
              response.errors?.[0]?.message ?? "Unknown error during delete";
            set((s) => {
              s.lastError = msg;
              s.lastResponse = response;
              s.isDeleting = false;
            });
          }
          return response;
        } catch (err) {
          const msg = String(err);
          set((s) => {
            s.lastError = msg;
            s.isDeleting = false;
          });
          return { success: false, affectedRows: 0, errors: [{ rowIndex: 0, code: "DB_ERROR", message: msg }] };
        }
      },

      clearStatus: () => {
        set((s) => {
          s.lastError = null;
          s.lastResponse = null;
        });
      },
    })),
  ),
);

// =============================================================================
// Stable selectors
// =============================================================================

/** Is a specific row dirty? */
export const selectIsRowDirty = (rowKey: string) => (s: MutationState) =>
  s.dirtyRows.has(rowKey);

/** Is a specific cell dirty? */
export const selectIsCellDirty =
  (rowKey: string, column: string) => (s: MutationState) =>
    s.dirtyRows.get(rowKey)?.changes[column] !== undefined;

/** Is a specific row selected for delete? */
export const selectIsRowSelected = (rowKey: string) => (s: MutationState) =>
  s.selectedRowKeys.has(rowKey);

/** Number of selected rows. */
export const selectSelectedCount = (s: MutationState) =>
  s.selectedRowKeys.size;

/** Are there any dirty rows? */
export const selectHasDirty = (s: MutationState) => s.dirtyRows.size > 0;

export { buildRowKey };
