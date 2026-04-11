// =============================================================================
// Mutation types — mirrors internal/mutation/types.go exactly.
// Components import from here; never directly from bindings/.
// =============================================================================

/** A modification to a single column value. */
export interface CellChange {
  column: string;
  /** Previous value used for optimistic locking. null = no lock. */
  oldValue: unknown;
  newValue: unknown;
}

/** A request to update a single row. */
export interface UpdateRowRequest {
  schema: string;
  table: string;
  /** e.g. { id: 42 } or composite { org_id: 1, user_id: 5 } */
  primaryKeys: Record<string, unknown>;
  changes: CellChange[];
}

/** Wraps multiple row updates for a single transaction. */
export interface UpdateBulkRequest {
  rows: UpdateRowRequest[];
}

/** Rows to delete from a single table. */
export interface DeleteRowsRequest {
  schema: string;
  table: string;
  /** One map per row, e.g. [{ id: 1 }, { id: 2 }] */
  primaryKeys: Record<string, unknown>[];
}

/** Returned to the frontend after any mutation. */
export interface MutationResponse {
  success: boolean;
  affectedRows: number;
  errors?: MutationError[];
}

/** Per-row error in a bulk operation. */
export interface MutationError {
  rowIndex: number;
  /** One of the MutationErrorCode values. */
  code: MutationErrorCode;
  message: string;
}

/** Error codes returned in MutationError.code. */
export type MutationErrorCode =
  | "ROW_NOT_FOUND"
  | "CONFLICT"
  | "CONSTRAINT_VIOLATION"
  | "BUILD_ERROR"
  | "DB_ERROR"
  | "TX_BEGIN"
  | "TX_COMMIT"
  | "CONNECTION_ERROR"
  | "UNSUPPORTED_DIALECT";

// =============================================================================
// Client-side mutation state types
// =============================================================================

/** Tracks pending changes for a single dirty row. */
export interface DirtyRow {
  /** PK map, e.g. { id: 42 }. */
  primaryKeys: Record<string, unknown>;
  /** column → { oldValue, newValue } */
  changes: Record<string, { oldValue: unknown; newValue: unknown }>;
}

/** Identifies which cell is being edited right now. */
export interface EditingCell {
  rowKey: string;
  column: string;
}

/**
 * Builds a deterministic row key from a primary-key map.
 * Keys are sorted alphabetically so { b:2, a:1 } === { a:1, b:2 }.
 */
export function buildRowKey(primaryKeys: Record<string, unknown>): string {
  const sorted = Object.keys(primaryKeys)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = primaryKeys[k];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

/**
 * Extracts the primary-key map for a row from the query result.
 * Returns null when any PK column is missing from the result columns.
 */
export function extractPrimaryKeys(
  row: unknown[],
  columns: string[],
  pkColumns: string[],
): Record<string, unknown> | null {
  if (pkColumns.length === 0) return null;
  const result: Record<string, unknown> = {};
  for (const pk of pkColumns) {
    const idx = columns.indexOf(pk);
    if (idx === -1) return null; // PK column not in result set
    result[pk] = row[idx];
  }
  return result;
}
